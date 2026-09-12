import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess, safeEnvironment, safeErrorMessage } from "./codex.js";

const schemaPath = fileURLToPath(new URL("./ceo-chat.schema.json", import.meta.url));

function text(value, limit) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit;
}

function parseEvents(output) {
  return String(output || "").split(/\r?\n/).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function finalMessage(events) {
  return events.filter((event) => event.type === "item.completed" && event.item?.type === "agent_message")
    .at(-1)?.item.text || null;
}

export function validateCeoChatResult(value) {
  if (!value || !text(value.reply, 6000) || !value.suggestedAction || typeof value.suggestedAction !== "object") {
    throw new Error("CEO returned an invalid conversation response");
  }
  if (value.suggestedAction.type === "none"
    && Object.keys(value.suggestedAction).every((key) => ["type", "title", "description"].includes(key))
    && (!value.suggestedAction.title || !String(value.suggestedAction.title).trim())
    && (!value.suggestedAction.description || !String(value.suggestedAction.description).trim())) {
    return { reply: value.reply.trim(), suggestedAction: { type: "none" } };
  }
  if (value.suggestedAction.type === "propose_goal" && text(value.suggestedAction.title, 180)
    && text(value.suggestedAction.description, 12000) && Object.keys(value.suggestedAction).every((key) => ["type", "title", "description"].includes(key))) {
    return { reply: value.reply.trim(), suggestedAction: { type: "propose_goal", title: value.suggestedAction.title.trim(), description: value.suggestedAction.description.trim() } };
  }
  throw new Error("CEO returned an invalid suggested action");
}

export class CeoChatExecutor {
  constructor({ runtime, processRunner = runProcess, timeoutMs = 180_000 } = {}) {
    this.runtime = runtime;
    this.processRunner = processRunner;
    this.timeoutMs = timeoutMs;
  }

  status() {
    return { ...this.runtime.status(), mode: "executive-conversation", tools: "disabled", organizationData: "host-generated summary only" };
  }

  async execute({ ceo, message, history, snapshot }) {
    if (!this.status().available) throw new Error("CEO conversation runtime is unavailable. Check Codex installation and sign-in.");
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-ceo-chat-"));
    try {
      const prompt = [
        "You are the AI CEO of a small organization. Hold a concise, practical conversation with the Founder.",
        "You may explain the supplied organization snapshot, discuss strategy, compare options and surface blockers. Treat the snapshot as the only source of operational facts. State when a conclusion is a recommendation rather than an observed fact.",
        "Do not claim to have inspected systems, assets, files, employee conversations, the web, or any information not present in the snapshot. Do not invoke tools, execute work, create employees, change access, send messages, publish, spend money, deploy, or approve anything.",
        "A normal discussion must return suggestedAction.type=none. Only suggest propose_goal when the Founder clearly asks to turn a new outcome into organizational work. A suggestion is not approval and does not start work.",
        "A request to eliminate an active blocker or build a missing organizational capability is a new outcome when no equivalent active goal appears in the snapshot. In that case, propose a focused capability-building goal instead of merely repeating the blocker.",
        "Reply in the Founder’s language when practical. Keep the response readable and decision-oriented.",
        JSON.stringify({ ceo: { name: ceo.name, role: ceo.jobType }, history, founderMessage: message, organizationSnapshot: snapshot })
      ].join("\n");
      if (prompt.length > 260_000) throw new Error("CEO conversation context is too large; start a new discussion or shorten the message");
      const args = ["--ask-for-approval", "never", "exec", "--cd", workspace, "--skip-git-repo-check", "--sandbox", "read-only",
        "--ignore-user-config", "--ignore-rules", "--ephemeral", "--json", "--config", "web_search=\"disabled\"", "--config", "project_doc_max_bytes=0",
        "--config", "mcp_servers={}",
        ...(this.runtime.providerArgs || []),
        ...["shell_tool", "unified_exec", "plugins", "apps", "browser_use", "computer_use", "multi_agent", "multi_agent_v2", "image_generation", "view_image", "memories", "skill_search"].flatMap((flag) => ["--disable", flag]),
        "--output-schema", schemaPath, "--color", "never", "-"];
      const response = await this.processRunner(this.runtime.command, args, {
        cwd: workspace, env: safeEnvironment(), input: prompt, timeoutMs: this.timeoutMs, maxOutputBytes: 2 * 1024 * 1024
      });
      if (response.code !== 0) throw new Error(`CEO conversation failed: ${safeErrorMessage(response.stderr || response.stdout || "provider error")}`);
      const events = parseEvents(response.stdout);
      if (!events.some((event) => event.type === "turn.completed")) throw new Error("CEO conversation did not finish");
      if (events.some((event) => event.item && ["command_execution", "mcp_tool_call", "web_search", "file_change"].includes(event.item.type))) {
        throw new Error("CEO attempted a tool outside the conversation boundary");
      }
      let payload;
      try { payload = JSON.parse(finalMessage(events)); } catch { throw new Error("CEO did not return a structured conversation response"); }
      const result = validateCeoChatResult(payload);
      const usage = events.findLast((event) => event.type === "turn.completed")?.usage || {};
      return { ...result, provider: "codex-cli", sandbox: "read-only", networkAccess: "model-service-only", eventCount: events.length,
        usage: Object.fromEntries(Object.entries(usage).filter(([, value]) => Number.isFinite(value))) };
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  }
}
