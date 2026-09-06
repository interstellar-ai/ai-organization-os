import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CodeIntegrationExecutor } from "../src/executors/integration.js";

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

test("approved code is committed, tested and applied only to the integration branch", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-integration-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repository = path.join(root, "repository");
  fs.mkdirSync(repository);
  execFileSync("git", ["init", "-b", "main", repository]);
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }));
  fs.writeFileSync(path.join(repository, "feature.js"), "export const value = 1;\n");
  git(repository, ["add", "."]);
  git(repository, ["-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-m", "Initial"]);
  const codeRoot = path.join(root, "worktrees");
  const repositoryKey = crypto.createHash("sha256").update(fs.realpathSync(repository)).digest("hex").slice(0, 12);
  const taskId = "task_integration";
  const codeWorktree = path.join(codeRoot, repositoryKey, taskId);
  fs.mkdirSync(path.dirname(codeWorktree), { recursive: true });
  git(repository, ["worktree", "add", "--detach", codeWorktree, "HEAD"]);
  fs.writeFileSync(path.join(codeWorktree, "feature.js"), "export const value = 2;\n");
  const executor = new CodeIntegrationExecutor({ projectRoot: root, codeWorktreeRoot: codeRoot, runtimeRoot: path.join(root, "integrations") });
  const result = await executor.execute({
    task: { id: taskId, title: "Update feature", output: { worktreeId: taskId, changedFiles: [] } },
    asset: { workspacePath: repository, integrationTestCommand: ["npm", "test"] }
  });
  assert.equal(result.outcome, "integrated");
  assert.equal(result.branch, "codex/integration");
  assert.equal(result.test.status, "passed");
  assert.deepEqual(result.changedFiles, ["feature.js"]);
  assert.equal(git(repository, ["show", "codex/integration:feature.js"]), "export const value = 2;");
  assert.equal(git(repository, ["show", "main:feature.js"]), "export const value = 1;");
});
