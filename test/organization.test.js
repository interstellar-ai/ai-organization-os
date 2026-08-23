import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization, Scheduler } from "../src/organization.js";
import { createDefaultTools } from "../src/tools.js";

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-os-"));
  const store = new JsonStore(path.join(dir, "state.json"));
  const organization = new Organization(store, null);
  organization.tools = createDefaultTools(organization);
  return organization;
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for workflow");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("creates agents, goals and a dependency-ordered plan", () => {
  const organization = setup();
  organization.createAgent({ name: "Builder", capabilities: ["build"] });
  const goal = organization.createGoal({ title: "Ship MVP" });
  const tasks = organization.planGoal(goal.id);
  assert.equal(tasks.length, 5);
  assert.equal(tasks[2].assignedAgentId !== null, true);
  assert.deepEqual(tasks[1].dependsOn, [tasks[0].id]);
  assert.equal(tasks[0].toolName, "goal.analyze");
  assert.equal(tasks[0].acceptanceCriteria.length > 0, true);
});

test("scheduler executes ready tasks and then unlocks dependencies", async () => {
  const organization = setup();
  const first = organization.createTask({ title: "Write memory", toolName: "memory.write", input: { content: "MVP is local-first" } });
  const second = organization.createTask({ title: "Read memory", dependsOn: [first.id], toolName: "memory.search", input: { query: "local-first" } });
  const scheduler = new Scheduler(organization, 10);
  scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  scheduler.stop();
  const tasks = organization.list("tasks");
  assert.equal(tasks.find((task) => task.id === first.id).status, "completed");
  assert.equal(tasks.find((task) => task.id === second.id).status, "completed");
  assert.equal(organization.searchMemories("local-first").length, 1);
});

test("a planned goal completes with evidence and awaits human review", async () => {
  const organization = setup();
  organization.createAgent({ name: "COO", role: "coo", capabilities: ["research", "design", "validate", "iterate"] });
  organization.createAgent({ name: "Builder", capabilities: ["build"] });
  const goal = organization.createGoal({ title: "Validate the local workflow", description: "Produce an evidence-backed MVP validation" });
  organization.planGoal(goal.id);
  const scheduler = new Scheduler(organization, 10);
  scheduler.start();
  await waitFor(() => organization.summarizeGoal(goal.id).progress.completed === 5);
  scheduler.stop();
  const summary = organization.summarizeGoal(goal.id);
  assert.equal(summary.executionStatus, "awaiting_review");
  assert.equal(summary.evidence.length >= 5, true);
  assert.equal(summary.tasks.every((task) => task.status === "completed"), true);
  assert.equal(organization.list("events").some((event) => event.type === "task.completed"), true);
});

test("unknown tools fail safely", async () => {
  const organization = setup();
  const task = organization.createTask({ title: "Bad tool", toolName: "not-registered" });
  await assert.rejects(() => organization.executeTask(task.id), /Unknown tool/);
  assert.equal(organization.list("tasks")[0].status, "failed");
});

test("access policies match employee and asset attributes with deny precedence", () => {
  const organization = setup();
  const engineer = organization.createAgent({
    name: "Engineer",
    role: "software_engineer",
    jobType: "software_engineer",
    department: "Engineering"
  });
  const repository = organization.createAsset({
    name: "Development repository",
    type: "source_code",
    environment: "development"
  });
  organization.createPolicy({
    name: "Engineering source access",
    employeeJobType: "software_engineer",
    assetType: "source_code",
    actions: ["read", "modify", "delete"],
    effect: "allow"
  });
  organization.createPolicy({
    name: "Repository deletion denied",
    employeeJobType: "*",
    assetType: "source_code",
    actions: ["delete"],
    effect: "deny"
  });

  const [access] = organization.effectiveAccess(engineer.id, repository.id);
  assert.equal(access.actions.find((item) => item.action === "read").effect, "allowed");
  assert.equal(access.actions.find((item) => item.action === "modify").effect, "allowed");
  assert.equal(access.actions.find((item) => item.action === "delete").effect, "denied");
  assert.equal(access.actions.find((item) => item.action === "publish").effect, "not_granted");
});

test("approved access requests create an auditable temporary grant", () => {
  const organization = setup();
  const reviewer = organization.createAgent({ name: "Reviewer", jobType: "quality_reviewer" });
  const repository = organization.createAsset({ name: "Repository", type: "source_code" });
  organization.createPolicy({
    name: "Repository reads require approval",
    employeeJobType: "quality_reviewer",
    assetType: "source_code",
    actions: ["read"],
    effect: "approval_required"
  });
  const [before] = organization.effectiveAccess(reviewer.id, repository.id);
  assert.equal(before.actions.find((item) => item.action === "read").effect, "approval_required");
  const request = organization.createAccessRequest({
    requesterAgentId: reviewer.id,
    assetId: repository.id,
    action: "read",
    reason: "Review the assigned artifact",
    duration: "one review"
  });

  organization.decideAccessRequest(request.id, { decision: "approved", reason: "Required for independent review" });
  const [access] = organization.effectiveAccess(reviewer.id, repository.id);
  const read = access.actions.find((item) => item.action === "read");
  assert.equal(read.effect, "allowed");
  assert.equal(read.sources.some((source) => source.type === "temporary_grant"), true);
  assert.equal(organization.list("events").some((event) => event.type === "access.approved"), true);

  const use = organization.consumeAccess({ agentId: reviewer.id, assetId: repository.id, action: "read" });
  assert.equal(use.consumedGrantId, request.id);
  assert.equal(organization.list("accessRequests")[0].status, "consumed");
  const [after] = organization.effectiveAccess(reviewer.id, repository.id);
  assert.equal(after.actions.find((item) => item.action === "read").effect, "approval_required");
  assert.equal(organization.list("events").some((event) => event.type === "access.used"), true);
});

test("employees inherit role data from persistent job templates", () => {
  const organization = setup();
  const template = organization.createJobTemplate({
    name: "Research Analyst",
    jobType: "research_analyst",
    department: "Research",
    description: "Produces source-backed research.",
    capabilities: ["research", "cite"],
    responsibilities: ["Validate sources"]
  });
  const analyst = organization.createAgent({ name: "Analyst", templateId: template.id });
  assert.equal(analyst.jobType, "research_analyst");
  assert.equal(analyst.department, "Research");
  assert.deepEqual(analyst.capabilities, ["research", "cite"]);
  assert.deepEqual(analyst.responsibilities, ["Validate sources"]);
});

test("policy preview reports affected employees, assets and conflicts without saving", () => {
  const organization = setup();
  organization.createAgent({ name: "Engineer", jobType: "software_engineer", department: "Engineering" });
  organization.createAsset({ name: "Repository", type: "source_code", environment: "development" });
  organization.createPolicy({ name: "Existing deny", employeeJobType: "software_engineer", assetType: "source_code", actions: ["delete"], effect: "deny" });
  const beforeCount = organization.list("policies").length;
  const preview = organization.previewPolicy({ employeeJobType: "software_engineer", assetType: "source_code", actions: ["read", "delete"], effect: "allow" });
  assert.equal(preview.matchedAgents.length, 1);
  assert.equal(preview.matchedAssets.length, 1);
  assert.equal(preview.affectedPermissionCount, 2);
  assert.equal(preview.conflicts.length, 1);
  assert.equal(organization.list("policies").length, beforeCount);
});

test("hiring preview explains inherited role and default access without creating an employee", () => {
  const organization = setup();
  const template = organization.createJobTemplate({
    name: "Software Engineer",
    jobType: "software_engineer",
    department: "Engineering",
    responsibilities: ["Implementation"],
    capabilities: ["build"]
  });
  organization.createAsset({ name: "Repository", type: "source_code", environment: "development" });
  organization.createPolicy({ name: "Engineering build", employeeJobType: "software_engineer", assetType: "source_code", assetEnvironment: "development", actions: ["read", "modify"], effect: "allow" });
  const beforeCount = organization.list("agents").length;
  const preview = organization.previewAgentFromTemplate(template.id);
  assert.equal(preview.template.id, template.id);
  assert.equal(preview.matchedPolicies.length, 1);
  assert.equal(preview.summary.allowed, 2);
  assert.equal(preview.access[0].actions.find((item) => item.action === "modify").effect, "allowed");
  assert.equal(organization.list("agents").length, beforeCount);
});

test("employee creation rejects an unknown manager", () => {
  const organization = setup();
  assert.throws(() => organization.createAgent({ name: "Engineer", managerId: "agent_missing" }), /Manager not found/);
});

test("time-bound grants receive a real expiration timestamp", () => {
  const organization = setup();
  const employee = organization.createAgent({ name: "Publisher", jobType: "publisher" });
  const destination = organization.createAsset({ name: "External destination", type: "publishing_destination" });
  const request = organization.createAccessRequest({ requesterAgentId: employee.id, assetId: destination.id, action: "publish", reason: "Publish an approved artifact", grantType: "time_bound", durationMinutes: 30 });
  const approved = organization.decideAccessRequest(request.id, { decision: "approved", grantType: "time_bound", durationMinutes: 30 });
  assert.equal(approved.grantType, "time_bound");
  assert.equal(new Date(approved.expiresAt).getTime() > Date.now(), true);
  assert.equal(approved.usesRemaining, null);
});

test("persistent policy access does not consume a redundant one-use grant", () => {
  const organization = setup();
  const employee = organization.createAgent({ name: "Engineer", jobType: "software_engineer" });
  const asset = organization.createAsset({ name: "Repository", type: "source_code" });
  organization.createPolicy({ name: "Permanent read", employeeJobType: "software_engineer", assetType: "source_code", actions: ["read"], effect: "allow" });
  const request = organization.createAccessRequest({ requesterAgentId: employee.id, assetId: asset.id, action: "read", reason: "Redundant request" });
  organization.decideAccessRequest(request.id, { decision: "approved", grantType: "once" });
  const use = organization.consumeAccess({ agentId: employee.id, assetId: asset.id, action: "read" });
  assert.equal(use.consumedGrantId, null);
  assert.equal(organization.list("accessRequests")[0].status, "approved");
  assert.equal(organization.list("accessRequests")[0].usesRemaining, 1);
});
