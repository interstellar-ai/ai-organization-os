import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { runProcess, safeEnvironment, safeErrorMessage } from "./codex.js";

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["'][^"']{12,}/i,
  /\bgh[oprsu]_[A-Za-z0-9_]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/
];

const workspaceKey = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
const commitTitle = (value) => String(value || "approved code task").replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7E]/g, "").trim().slice(0, 72) || "approved code task";
const allowedTestCommand = (value) => [["npm", "test"], ["npm", "run", "test"], ["pnpm", "test"], ["yarn", "test"], ["cargo", "test"], ["go", "test", "./..."]]
  .some((allowed) => JSON.stringify(value) === JSON.stringify(allowed));

export class CodeIntegrationExecutor {
  constructor(options = {}) {
    this.projectRoot = path.resolve(options.projectRoot || process.cwd());
    this.runtimeRoot = path.resolve(options.runtimeRoot || path.join(this.projectRoot, "data", "integrations"));
    this.codeWorktreeRoot = path.resolve(options.codeWorktreeRoot || path.join(this.projectRoot, "data", "worktrees"));
    this.processRunner = options.processRunner || runProcess;
    this.branch = options.branch || "codex/integration";
    this.baseRef = options.baseRef || "main";
  }

  async process(command, args, cwd, allowFailure = false, timeoutMs = 120_000) {
    const result = await this.processRunner(command, args, { cwd, env: safeEnvironment(), timeoutMs, maxOutputBytes: 2 * 1024 * 1024 });
    if (!allowFailure && result.code !== 0) throw new Error(safeErrorMessage(result.stderr || result.stdout || `${command} failed`));
    return result;
  }

  async git(cwd, args, allowFailure = false) {
    return this.process("git", ["-C", cwd, ...args], cwd, allowFailure);
  }

  inspectFiles(worktree, changedFiles) {
    for (const relative of changedFiles) {
      const candidate = path.resolve(worktree, relative);
      if (candidate !== worktree && !candidate.startsWith(`${worktree}${path.sep}`)) throw new Error("Changed file escaped the approved worktree");
      if (!fs.existsSync(candidate)) continue;
      const stat = fs.lstatSync(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Integration rejects changed links and non-file entries");
      if (stat.size > 2 * 1024 * 1024) throw new Error("A changed file exceeds the integration size limit");
      const content = fs.readFileSync(candidate, "utf8");
      if (SECRET_PATTERNS.some((pattern) => pattern.test(content))) throw new Error("Potential credential material detected in the code delivery");
    }
  }

  async prepareIntegrationWorktree(repositoryRoot, baseRef) {
    const destination = path.join(this.runtimeRoot, workspaceKey(repositoryRoot));
    if (fs.existsSync(destination)) {
      const status = await this.git(destination, ["status", "--porcelain"]);
      if (status.stdout.trim()) throw new Error("Integration workspace has unreviewed changes");
      return destination;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const exists = await this.git(repositoryRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${this.branch}`], true);
    const args = exists.code === 0
      ? ["worktree", "add", destination, this.branch]
      : ["worktree", "add", "-b", this.branch, destination, baseRef];
    await this.git(repositoryRoot, args);
    return destination;
  }

  async execute({ task, asset }) {
    const configuredRoot = path.isAbsolute(asset.workspacePath) ? asset.workspacePath : path.resolve(this.projectRoot, asset.workspacePath || ".");
    const sourceRoot = fs.realpathSync(configuredRoot);
    const repositoryRoot = (await this.git(sourceRoot, ["rev-parse", "--show-toplevel"])).stdout.trim();
    const sourceWorktree = path.join(this.codeWorktreeRoot, workspaceKey(repositoryRoot), task.output.worktreeId);
    if (!fs.existsSync(sourceWorktree)) throw new Error("The reviewed code worktree is unavailable");
    const status = await this.git(sourceWorktree, ["status", "--porcelain"]);
    const tracked = await this.git(sourceWorktree, ["diff", "--name-only", "-z"]);
    const untracked = await this.git(sourceWorktree, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const actualChangedFiles = [...new Set(`${tracked.stdout}\0${untracked.stdout}`.split("\0").filter(Boolean))];
    const changedFiles = actualChangedFiles.length ? actualChangedFiles : task.output.changedFiles || [];
    let sourceCommit;
    if (status.stdout.trim()) {
      this.inspectFiles(sourceWorktree, changedFiles);
      await this.git(sourceWorktree, ["add", "--all"]);
      await this.git(sourceWorktree, ["-c", "user.name=AI Organization OS", "-c", "user.email=noreply@localhost", "commit", "-m", `Integrate: ${commitTitle(task.title)}`]);
      sourceCommit = (await this.git(sourceWorktree, ["rev-parse", "HEAD"])).stdout.trim();
    } else {
      const latestTitle = (await this.git(sourceWorktree, ["log", "-1", "--format=%s"])).stdout.trim();
      if (latestTitle !== `Integrate: ${commitTitle(task.title)}`) throw new Error("The reviewed code task contains no changes to integrate");
      sourceCommit = (await this.git(sourceWorktree, ["rev-parse", "HEAD"])).stdout.trim();
    }
    const baseRef = asset.integrationBaseRef || this.baseRef;
    const validBase = await this.git(repositoryRoot, ["rev-parse", "--verify", `${baseRef}^{commit}`], true);
    if (validBase.code !== 0) throw new Error("Configured integration base branch is unavailable");
    const integrationWorktree = await this.prepareIntegrationWorktree(repositoryRoot, baseRef);
    const cherryPick = await this.git(integrationWorktree, ["cherry-pick", sourceCommit], true);
    if (cherryPick.code !== 0) {
      await this.git(integrationWorktree, ["cherry-pick", "--abort"], true);
      throw new Error(`Integration conflict: ${safeErrorMessage(cherryPick.stderr || cherryPick.stdout)}`);
    }
    const testCommand = Array.isArray(asset.integrationTestCommand) && allowedTestCommand(asset.integrationTestCommand)
      ? asset.integrationTestCommand
      : fs.existsSync(path.join(integrationWorktree, "package.json")) ? ["npm", "test"] : null;
    let test = { status: "not_configured", command: null, summary: "No integration test command is configured." };
    if (testCommand) {
      const appliedCommit = (await this.git(integrationWorktree, ["rev-parse", "HEAD"])).stdout.trim();
      const [command, ...args] = testCommand;
      const result = await this.process(command, args, integrationWorktree, true, 20 * 60_000);
      test = { status: result.code === 0 ? "passed" : "failed", command: testCommand,
        summary: safeErrorMessage(result.code === 0 ? result.stdout : result.stderr || result.stdout, 4_000) };
      if (result.code !== 0) {
        await this.git(integrationWorktree, ["revert", "--no-edit", appliedCommit], true);
        throw new Error(`Integration tests failed and the change was reverted: ${test.summary}`);
      }
    }
    const integrationCommit = (await this.git(integrationWorktree, ["rev-parse", "HEAD"])).stdout.trim();
    return { outcome: "integrated", branch: this.branch, sourceCommit, integrationCommit, changedFiles, test,
      restrictions: ["No push", "No main-branch merge", "No deployment"] };
  }
}
