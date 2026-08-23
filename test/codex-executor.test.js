import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CodexExecutor } from "../src/executors/codex.js";

test("Codex executor uses non-interactive workspace sandboxing and returns safe evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-codex-"));
  const sourceRoot = path.join(root, "repository");
  const runtimeRoot = path.join(root, "worktrees");
  fs.mkdirSync(sourceRoot, { recursive: true });
  const calls = [];
  const processRunner = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "codex" && args[0] === "--version") return { code: 0, stdout: "codex-cli 1.0.0\n", stderr: "" };
    if (command === "git" && args.includes("rev-parse")) return { code: 0, stdout: `${sourceRoot}\n`, stderr: "" };
    if (command === "git" && args.includes("worktree")) {
      fs.mkdirSync(args[5], { recursive: true });
      return { code: 0, stdout: "Prepared worktree\n", stderr: "" };
    }
    if (command === "git" && args.includes("status")) return { code: 0, stdout: " M src/feature.js\n?? test/feature.test.js\n", stderr: "" };
    if (command === "codex") {
      return { code: 0, stdout: `${JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Implemented the feature and ran tests." } })}\n${JSON.stringify({ type: "turn.completed", usage: { input_tokens: 100, output_tokens: 20 } })}\n`, stderr: "" };
    }
    throw new Error(`Unexpected command: ${command}`);
  };
  const executor = new CodexExecutor({ projectRoot: root, runtimeRoot, processRunner });
  assert.equal((await executor.checkAvailability()).available, true);
  const result = await executor.execute({
    task: { id: "task_safe", title: "Implement feature", input: { instructions: "Add the requested behavior" }, acceptanceCriteria: ["Tests pass"] },
    agent: { name: "Software Engineer", jobType: "software_engineer" },
    asset: { name: "Repository", workspacePath: sourceRoot }
  });
  const codexRun = calls.find((call) => call.command === "codex" && call.args.includes("exec"));
  assert.ok(codexRun);
  assert.equal(codexRun.args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
  assert.equal(codexRun.args.includes("workspace-write"), true);
  assert.equal(codexRun.args.includes("--ignore-user-config"), true);
  assert.equal(codexRun.args.includes("sandbox_workspace_write.network_access=false"), true);
  assert.equal(codexRun.options.input.includes("Do not commit, push, merge, deploy"), true);
  assert.equal(Object.hasOwn(codexRun.options.env, "OPENAI_API_KEY"), false);
  assert.deepEqual(result.changedFiles, ["src/feature.js", "test/feature.test.js"]);
  assert.equal(result.summary, "Implemented the feature and ran tests.");
  assert.equal(result.worktreeId, "task_safe");
  assert.equal(result.networkAccess, "disabled");
  assert.deepEqual(result.usage, { input_tokens: 100, output_tokens: 20 });
});
