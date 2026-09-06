import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

function limitedText(value, maximum = 2_000) {
  const text = String(value || "").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

export function safeErrorMessage(value, maximum = 1_000) {
  let text = String(value || "Execution failed");
  for (const localPath of [process.env.HOME, process.env.CODEX_HOME].filter(Boolean)) {
    text = text.replaceAll(localPath, "[local path]");
  }
  text = text.replace(/\/(?:Users|home)\/[^/\s]+/g, "/[local user]");
  return limitedText(text, maximum);
}

export function safeEnvironment(source = process.env) {
  const allowed = ["PATH", "HOME", "CODEX_HOME", "LANG", "LC_ALL", "TMPDIR", "TERM"];
  return Object.fromEntries(allowed.flatMap((name) => source[name] ? [[name, source[name]]] : []));
}

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || safeEnvironment(),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout;
    const maximum = options.maxOutputBytes || DEFAULT_MAX_OUTPUT_BYTES;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      reject(error);
    };
    timeout = setTimeout(() => fail(new Error("Codex execution timed out")), options.timeoutMs || DEFAULT_TIMEOUT_MS);

    const append = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maximum) {
        child.kill("SIGTERM");
        throw new Error("Codex execution output exceeded the configured limit");
      }
      return next;
    };

    child.stdout.on("data", (chunk) => {
      try { stdout = append(stdout, chunk); } catch (error) { fail(error); }
    });
    child.stderr.on("data", (chunk) => {
      try { stderr = append(stderr, chunk); } catch (error) { fail(error); }
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({ code: code ?? 1, signal, stdout, stderr });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input || "");
  });
}

function parseJsonLines(output) {
  return String(output || "").split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function finalMessage(events) {
  for (const event of [...events].reverse()) {
    const item = event.item || event.output || event.message;
    if (item?.type === "agent_message" && item.text) return limitedText(item.text, 6_000);
    if (typeof item?.content === "string") return limitedText(item.content, 6_000);
    if (typeof event.message === "string") return limitedText(event.message, 6_000);
  }
  return null;
}

function finalUsage(events) {
  const completed = [...events].reverse().find((event) => event.type === "turn.completed");
  if (!completed?.usage) return null;
  return Object.fromEntries(Object.entries(completed.usage).filter(([, value]) => Number.isFinite(value)));
}

function changedFilesFromStatus(status) {
  return String(status || "").split(/\r?\n/).filter(Boolean).map((line) => line.slice(3).trim()).filter(Boolean);
}

function workspaceKey(sourceRoot) {
  return crypto.createHash("sha256").update(sourceRoot).digest("hex").slice(0, 12);
}

function taskPrompt({ task, agent, asset }) {
  const acceptance = task.acceptanceCriteria?.length
    ? task.acceptanceCriteria.map((criterion) => `- ${criterion}`).join("\n")
    : "- Produce a focused, working change with proportionate tests.";
  return [
    "You are the Software Engineer assigned by AI Organization OS.",
    "Work only inside the provided isolated Git worktree.",
    "Do not commit, push, merge, deploy, access external services, or install global software.",
    "Do not read or expose credentials, personal data, or files outside this worktree.",
    "Keep public-facing code, comments, documentation, and user interface text in English.",
    "Inspect existing project instructions before editing. Make the smallest coherent change, run relevant local tests, and report remaining limitations.",
    "",
    `Employee: ${agent.name} (${agent.jobType})`,
    `Protected asset: ${asset.name}`,
    `Task: ${task.title}`,
    `Instructions: ${task.input.instructions}`,
    `Expected deliverable: ${task.deliverable || "A tested code change"}`,
    `Context and constraints: ${task.context || "None supplied"}`,
    "Acceptance criteria:",
    acceptance
  ].join("\n");
}

export class CodexExecutor {
  constructor(options = {}) {
    this.command = options.command || process.env.AI_ORG_CODEX_COMMAND || "codex";
    this.projectRoot = path.resolve(options.projectRoot || process.cwd());
    this.runtimeRoot = path.resolve(options.runtimeRoot || path.join(this.projectRoot, "data", "worktrees"));
    this.processRunner = options.processRunner || runProcess;
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.cachedStatus = { provider: "codex-cli", available: false, version: null, reason: "Not checked" };
  }

  status() {
    return { ...this.cachedStatus };
  }

  async checkAvailability() {
    try {
      const result = await this.processRunner(this.command, ["--version"], {
        cwd: this.projectRoot,
        env: safeEnvironment(),
        timeoutMs: 10_000,
        maxOutputBytes: 64_000
      });
      if (result.code !== 0) throw new Error(limitedText(result.stderr || result.stdout || "Codex exited with an error"));
      const auth = await this.processRunner(this.command, ["login", "status"], {
        cwd: this.projectRoot, env: safeEnvironment(), timeoutMs: 10_000, maxOutputBytes: 64_000
      });
      if (auth.code !== 0) throw new Error("Codex sign-in is required");
      this.cachedStatus = { provider: "codex-cli", available: true, version: limitedText(result.stdout, 120), reason: null };
    } catch (error) {
      const reason = error.code === "ENOENT" || error.message.includes("ENOENT")
        ? "Codex CLI installation is incomplete or unavailable"
        : safeErrorMessage(error.message, 240);
      this.cachedStatus = { provider: "codex-cli", available: false, version: null, reason };
    }
    return this.status();
  }

  resolveSourceRoot(asset) {
    const locator = asset.workspacePath || ".";
    const candidate = path.isAbsolute(locator) ? locator : path.resolve(this.projectRoot, locator);
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) throw new Error("Repository workspace is unavailable");
    return fs.realpathSync(candidate);
  }

  async git(sourceRoot, args, options = {}) {
    const result = await this.processRunner("git", ["-C", sourceRoot, ...args], {
      cwd: sourceRoot,
      env: safeEnvironment(),
      timeoutMs: options.timeoutMs || 60_000,
      maxOutputBytes: 512_000
    });
    if (result.code !== 0) throw new Error(safeErrorMessage(result.stderr || "Git workspace operation failed"));
    return result.stdout.replace(/\s+$/, "");
  }

  async prepareWorktree(sourceRoot, taskId, baseRef = "HEAD") {
    const repositoryRoot = await this.git(sourceRoot, ["rev-parse", "--show-toplevel"]);
    const destination = path.join(this.runtimeRoot, workspaceKey(repositoryRoot), taskId);
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await this.git(repositoryRoot, ["worktree", "add", "--detach", destination, baseRef]);
    }
    return destination;
  }

  async execute({ task, agent, asset }) {
    if (!this.cachedStatus.available) await this.checkAvailability();
    if (!this.cachedStatus.available) throw new Error(`Codex executor unavailable: ${this.cachedStatus.reason}`);
    const sourceRoot = this.resolveSourceRoot(asset);
    const worktree = await this.prepareWorktree(sourceRoot, task.id, task.input.baseRef || "HEAD");
    const prompt = taskPrompt({ task, agent, asset });
    const args = [
      "--ask-for-approval", "never",
      "exec",
      "--cd", worktree,
      "--sandbox", "workspace-write",
      "--json",
      "--ephemeral",
      "--ignore-user-config",
      "--config", "sandbox_workspace_write.network_access=false",
      "--color", "never",
      "-"
    ];
    const result = await this.processRunner(this.command, args, {
      cwd: worktree,
      env: safeEnvironment(),
      input: prompt,
      timeoutMs: this.timeoutMs,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES
    });
    if (result.code !== 0) throw new Error(`Codex execution failed: ${safeErrorMessage(result.stderr || result.stdout || `exit ${result.code}`)}`);
    const events = parseJsonLines(result.stdout);
    const summary = finalMessage(events);
    if (!summary || !events.some((event) => event.type === "turn.completed")) throw new Error("Codex did not return a completed result");
    const workspaceStatus = await this.git(worktree, ["status", "--short"]);
    return {
      kind: "codex_execution",
      summary,
      provider: "codex-cli",
      sandbox: "workspace-write",
      networkAccess: "disabled",
      transport: /falling back to HTTP/i.test(result.stderr) ? "https-fallback" : "default",
      worktreeId: task.id,
      changedFiles: changedFilesFromStatus(workspaceStatus),
      workspaceStatus: limitedText(workspaceStatus, 8_000),
      eventCount: events.length,
      usage: finalUsage(events),
      restrictions: ["No push", "No merge", "No deployment", "No external-service access"]
    };
  }
}
