import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization, Scheduler } from "../src/organization.js";
import { createDefaultTools } from "../src/tools.js";

function setup(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-os-"));
  const store = new JsonStore(path.join(dir, "state.json"));
  const organization = new Organization(store, null);
  organization.tools = createDefaultTools(organization, options);
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

test("authorized asset catalog hides assets outside an employee's policy scope", async () => {
  const organization = setup();
  const engineer = organization.createAgent({ name: "Engineer", jobType: "software_engineer", department: "Engineering" });
  const repository = organization.createAsset({ name: "Repository", type: "source_code", environment: "development" });
  organization.createAsset({ name: "Finance vault", type: "financial_data", sensitivity: "restricted" });
  organization.createPolicy({ name: "Engineering reads code", employeeJobType: "software_engineer", assetType: "source_code", actions: ["read"], effect: "allow" });
  const result = await organization.tools.execute("asset.catalog", {}, { organization, agent: engineer });
  assert.deepEqual(result.items.map((item) => item.id), [repository.id]);
  assert.deepEqual(result.items[0].allowedActions, ["read"]);
  assert.equal(result.items.some((item) => item.name === "Finance vault"), false);
  await assert.rejects(() => organization.tools.execute("asset.catalog", {}, { organization }), /Tool identity required/);
});

test("tool gateway requires both policy access and an active task capability", async () => {
  const organization = setup();
  const engineer = organization.createAgent({ name: "Engineer", jobType: "software_engineer", department: "Engineering" });
  const repository = organization.createAsset({ name: "Repository", type: "source_code", environment: "development" });
  organization.createPolicy({ name: "Engineering reads code", employeeJobType: "software_engineer", assetType: "source_code", actions: ["read"], effect: "allow" });
  const blocked = organization.createTask({ title: "Inspect without scope", assignedAgentId: engineer.id, toolName: "asset.inspect", input: { assetId: repository.id } });
  await assert.rejects(() => organization.executeTask(blocked.id), /Tool authorization denied/);
  assert.equal(organization.getTask(blocked.id).status, "failed");
  const authorized = organization.createTask({
    title: "Inspect assigned repository",
    assignedAgentId: engineer.id,
    toolName: "asset.inspect",
    input: { assetId: repository.id },
    accessScope: [{ assetId: repository.id, actions: ["read"] }],
    accessExpiresAt: new Date(Date.now() + 60_000).toISOString()
  });
  const completed = await organization.executeTask(authorized.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.output.asset.id, repository.id);
  assert.equal(organization.list("events").some((event) => event.type === "access.denied" && event.payload.taskId === blocked.id), true);
  assert.equal(organization.list("events").some((event) => event.type === "tool.authorized" && event.payload.taskId === authorized.id), true);
});

test("expired task capabilities are rejected without revealing asset details", async () => {
  const organization = setup();
  const engineer = organization.createAgent({ name: "Engineer", jobType: "software_engineer" });
  const repository = organization.createAsset({ name: "Repository", type: "source_code" });
  organization.createPolicy({ name: "Engineering reads code", employeeJobType: "software_engineer", assetType: "source_code", actions: ["read"], effect: "allow" });
  const task = organization.createTask({
    title: "Expired inspection",
    assignedAgentId: engineer.id,
    toolName: "asset.inspect",
    input: { assetId: repository.id },
    accessScope: [{ assetId: repository.id, actions: ["read"] }],
    accessExpiresAt: new Date(Date.now() - 60_000).toISOString()
  });
  await assert.rejects(() => organization.executeTask(task.id), (error) => error.message === "Tool authorization denied" && !error.message.includes(repository.name));
  assert.throws(() => organization.createTask({ title: "Invalid lease", accessExpiresAt: "not-a-time" }), /valid timestamp/);
  assert.throws(() => organization.createTask({ title: "Unknown assignee", assignedAgentId: "agent_missing" }), /Assigned employee not found/);
});

test("general work requests are classified, routed and blocked without a connected executor", () => {
  const organization = setup();
  const ceo = organization.createAgent({ name: "CEO", jobType: "ai_ceo", capabilities: ["iterate"] });
  const designer = organization.createAgent({ name: "Designer", jobType: "product_designer", capabilities: ["design"] });
  const task = organization.createWorkRequest({
    title: "Redesign the onboarding experience",
    instructions: "Create a clearer UI and user flow for first-time customers.",
    deliverable: "An interface specification",
    workType: "auto"
  });
  assert.equal(task.workType, "design");
  assert.equal(task.assignedAgentId, designer.id);
  assert.equal(task.status, "blocked");
  assert.equal(task.toolName, null);
  assert.equal(task.routing.mode, "automatic");
  assert.equal(task.routing.requiredExecutor, "agent.general");
  assert.match(task.nextAction, /General Agent runtime/);
  assert.notEqual(task.assignedAgentId, ceo.id);
  assert.equal(organization.list("events").some((event) => event.type === "work_request.routed" && event.payload.taskId === task.id), true);
});

test("software work requests route to a protected Codex task when the executor is connected", () => {
  const codexExecutor = { async execute() { throw new Error("Execution is not part of this routing test"); } };
  const organization = setup({ codexExecutor });
  organization.createAgent({ name: "CEO", jobType: "ai_ceo", capabilities: ["iterate"] });
  const engineer = organization.createAgent({ name: "Engineer", jobType: "software_engineer", capabilities: ["build"] });
  const repository = organization.createAsset({ name: "Repository", type: "source_code", workspacePath: ".", environment: "development" });
  const task = organization.createWorkRequest({
    title: "Fix the login bug",
    instructions: "Update the application code and keep existing sessions valid.",
    acceptanceCriteria: ["Tests pass"],
    workType: "auto"
  }, { codexAvailable: true });
  assert.equal(task.workType, "software_development");
  assert.equal(task.assignedAgentId, engineer.id);
  assert.equal(task.status, "pending");
  assert.equal(task.toolName, "code.codex");
  assert.equal(task.input.assetId, repository.id);
  assert.equal(task.requestSource, "founder_work_request");
  assert.equal(task.routing.executorStatus, "connected");
});

test("a coding task reaches Codex only after all repository permissions pass", async () => {
  const calls = [];
  const codexExecutor = {
    async execute(context) {
      calls.push(context);
      return {
        kind: "codex_execution",
        summary: "Implemented the requested change and ran tests.",
        provider: "codex-cli",
        sandbox: "workspace-write",
        worktreeId: context.task.id,
        changedFiles: ["src/feature.js", "test/feature.test.js"],
        workspaceStatus: " M src/feature.js",
        eventCount: 4,
        restrictions: ["No push", "No merge", "No deployment", "No external-service access"]
      };
    }
  };
  const organization = setup({ codexExecutor });
  const engineer = organization.createAgent({ name: "Engineer", jobType: "software_engineer", capabilities: ["build"] });
  const repository = organization.createAsset({ name: "Repository", type: "source_code", workspacePath: ".", environment: "development" });
  organization.createPolicy({ name: "Engineer reads code", employeeJobType: "software_engineer", assetType: "source_code", actions: ["read", "execute"], effect: "allow" });
  const denied = organization.createCodingTask({ title: "Denied implementation", instructions: "Add the feature", assignedAgentId: engineer.id, assetId: repository.id });
  await assert.rejects(() => organization.executeTask(denied.id), /Tool authorization denied/);
  assert.equal(calls.length, 0);

  organization.createPolicy({ name: "Engineer modifies code", employeeJobType: "software_engineer", assetType: "source_code", actions: ["modify"], effect: "allow" });
  const task = organization.createCodingTask({
    title: "Implement feature",
    instructions: "Add the feature without changing existing behavior",
    assignedAgentId: engineer.id,
    assetId: repository.id,
    acceptanceCriteria: ["Tests pass"]
  });
  const delivery = await organization.executeTask(task.id);
  assert.equal(delivery.status, "awaiting_review");
  assert.deepEqual(delivery.output.changedFiles, ["src/feature.js", "test/feature.test.js"]);
  assert.equal(delivery.evidence[0].type, "codex_execution");
  assert.equal(organization.acceptTask(task.id).status, "completed");
  assert.equal(organization.list("integrationRequests")[0].status, "pending");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].task.accessScope[0].actions, ["read", "modify", "execute"]);
  assert.equal(organization.list("events").filter((event) => event.type === "tool.authorized" && event.payload.taskId === task.id).length, 3);
});
