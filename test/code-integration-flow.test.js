import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Organization } from "../src/organization.js";
import { JsonStore } from "../src/store.js";
import { createDefaultTools } from "../src/tools.js";

test("accepted code requires a separate Founder decision before integration", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-integration-flow-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const organization = new Organization(new JsonStore(path.join(root, "state.json")), null);
  const engineer = organization.createAgent({ name: "Engineer", jobType: "software_engineer", capabilities: ["build"] });
  const asset = organization.createAsset({ name: "Repository", type: "source_code", workspacePath: ".", environment: "development" });
  organization.createPolicy({ name: "Engineer code access", employeeJobType: engineer.jobType, assetType: "source_code",
    actions: ["read", "modify", "execute"] });
  organization.tools = createDefaultTools(organization, { codexExecutor: { execute: async ({ task }) => ({ summary: "Implemented in isolation",
    worktreeId: task.id, changedFiles: ["feature.js"], provider: "test", restrictions: ["No push", "No merge", "No deployment"] }) } });
  const task = organization.createCodingTask({ title: "Implement feature", instructions: "Change feature.js",
    assignedAgentId: engineer.id, assetId: asset.id });
  assert.equal((await organization.executeTask(task.id)).status, "awaiting_review");
  organization.acceptTask(task.id);
  const request = organization.list("integrationRequests")[0];
  assert.equal(request.status, "pending");
  let calls = 0;
  const executor = { execute: async () => { calls += 1; return { outcome: "integrated", branch: "codex/integration",
    sourceCommit: "source", integrationCommit: "integrated", changedFiles: ["feature.js"], test: { status: "passed" } }; } };
  assert.equal(calls, 0);
  await organization.decideCodeIntegration(request.id, { decision: "approved", reason: "Reviewed files and integration target." }, executor);
  assert.equal(calls, 1);
  assert.equal(organization.getTask(task.id).integrationStatus, "integrated");
});
