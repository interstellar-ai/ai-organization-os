import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization, Scheduler } from "../src/organization.js";
import { createDefaultTools } from "../src/tools.js";
import { GeneralAgentExecutor } from "../src/executors/general.js";
import { GoalWorkflow, validateGoalPlan } from "../src/goal-workflow.js";

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-goal-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new JsonStore(path.join(dir, "state.json"));
  const org = new Organization(store, null);
  const ceo = org.createAgent({ name: "CEO", jobType: "ai_ceo", capabilities: ["iterate"] });
  const product = org.createAgent({ name: "Product", jobType: "product_manager", capabilities: ["design"] });
  const designer = org.createAgent({ name: "Designer", jobType: "product_designer", capabilities: ["design"] });
  const reviewer = org.createAgent({ name: "Reviewer", jobType: "quality_reviewer", capabilities: ["validate"] });
  const engineer = org.createAgent({ name: "Engineer", jobType: "software_engineer", capabilities: ["build"] });
  const runtimeAsset = org.createAsset({ name: "General runtime", type: "agent_runtime", tags: ["general-executor"] });
  for (const employee of [ceo, product, designer, reviewer]) org.createPolicy({ name: `${employee.name} runtime`, employeeJobType: employee.jobType, assetType: "agent_runtime", actions: ["execute"] });
  const responses = [];
  const calls = [];
  const executor = new GeneralAgentExecutor({ runtime: { command: "codex", status: () => ({ available: true }) }, processRunner: async (_command, _args, options) => {
    calls.push(options.input);
    const output = responses.shift();
    assert.ok(output, "Unexpected provider call");
    return { code: 0, stdout: [
      { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(output) } }, { type: "turn.completed" }
    ].map((e) => JSON.stringify(e)).join("\n") };
  } });
  const codeCalls = [];
  org.tools = createDefaultTools(org, { generalExecutor: executor, codexExecutor: { execute: async (input) => {
    codeCalls.push(input);
    return { summary: "Code change produced in an isolated worktree", changedFiles: ["example.js"], provider: "test" };
  } } });
  const workflow = new GoalWorkflow(org, executor, () => ({ generalAvailable: true, codexAvailable: true }));
  workflow.registerTool();
  const goal = org.createGoal({ title: "Prepare a reading-list product", description: "Produce a product brief and an interaction specification; no external actions." });
  const plan = () => ({ summary: "Define then design", assumptions: ["Document-only scope"], successCriteria: ["Both deliverables accepted"],
    projects: [{ key: "definition", title: "Product definition", objective: "Define scope", successCriteria: ["Brief accepted"] },
      { key: "experience", title: "Interaction design", objective: "Specify the flows", successCriteria: ["Flows match the brief"] }],
    tasks: [{ key: "brief", projectKey: "definition", title: "Write brief", workType: "product_strategy", executionMode: "document", assignedAgentId: product.id,
      instructions: "Write the concrete brief", deliverable: "brief.md", acceptanceCriteria: ["Three core features"], dependsOn: [] },
    { key: "flows", projectKey: "experience", title: "Design flows", workType: "design", executionMode: "document", assignedAgentId: designer.id,
      instructions: "Use the accepted brief to design flows", deliverable: "flows.md", acceptanceCriteria: ["Cover every feature"], dependsOn: ["brief"] }] });
  const delivery = (filename, content) => ({ outcome: "delivered", summary: "Actual work returned", questions: [], limitations: [], artifacts: [{ filename, content }] });
  const propose = async (value = plan()) => {
    responses.push(delivery("plan.json", JSON.stringify(value)));
    const task = workflow.startPlanning(goal.id);
    return org.executeTask(task.id);
  };
  return { org, workflow, goal, plan, delivery, propose, responses, calls, codeCalls, ceo, product, designer, reviewer, engineer, runtimeAsset, store, dir };
}

test("goal proposal materializes projects only on approval and delivers through dependency handoffs", async (t) => {
  const { org, workflow, goal, propose, responses, calls, delivery, store } = setup(t);
  const proposal = await propose();
  assert.equal(proposal.status, "awaiting_review");
  assert.equal(org.list("projects").length, 0);
  assert.equal(org.list("tasks").length, 1);
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "awaiting_plan_approval");
  assert.throws(() => org.acceptTask(proposal.id), /plan approval/);
  const input = { proposalId: proposal.output.proposalId };
  const accepted = workflow.approvePlan(goal.id, input);
  assert.equal(accepted.projects.length, 2);
  assert.equal(accepted.tasks.length, 2);
  workflow.approvePlan(goal.id, input);
  assert.equal(org.list("tasks").length, 3, "duplicate confirmation must not create duplicate work");
  const [brief, flows] = accepted.tasks;
  assert.deepEqual(flows.dependsOn, [brief.id]);
  const scheduler = new Scheduler(org);
  responses.push(delivery("brief.md", "Unique accepted product requirements"));
  await scheduler.tick();
  while (scheduler.running.size) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(org.getTask(brief.id).status, "awaiting_review");
  assert.equal(org.getTask(flows.id).status, "pending");
  await scheduler.tick();
  assert.equal(calls.length, 2, "awaiting review does not unlock dependencies");
  org.acceptTask(brief.id);
  responses.push(delivery("flows.md", "A concrete flow based on the brief"));
  await scheduler.tick();
  while (scheduler.running.size) await new Promise((resolve) => setImmediate(resolve));
  assert.match(calls[2], /Unique accepted product requirements/);
  assert.equal(org.getTask(flows.id).status, "awaiting_review");
  org.acceptTask(flows.id);
  const summary = org.summarizeGoal(goal.id);
  assert.equal(summary.executionStatus, "delivered");
  assert.equal(summary.progress.percent, 100);
  assert.equal(summary.outcomeStatus, "unverified");
  assert.ok(summary.projects.every((p) => p.progress.status === "delivered"));
  assert.equal(new JsonStore(store.filePath).read().projects.length, 2);
});

test("CEO clarification and revision cannot launch work or approve a stale plan", async (t) => {
  const { org, workflow, goal, responses, delivery, plan } = setup(t);
  responses.push({ outcome: "needs_input", summary: "Clarify scope", questions: ["Is this document-only work?"], limitations: [], artifacts: [] });
  const task = workflow.startPlanning(goal.id);
  assert.equal(workflow.startPlanning(goal.id).id, task.id);
  await org.executeTask(task.id);
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "needs_input");
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: "fake" }), /not ready/);
  assert.throws(() => workflow.startPlanning(goal.id), /feedback is required/);
  responses.push(delivery("plan.json", JSON.stringify(plan())));
  workflow.startPlanning(goal.id, { message: "Yes, documents only" });
  const proposal = await org.executeTask(task.id);
  workflow.startPlanning(goal.id, { message: "Keep the same scope, shorten the outputs" });
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId }), /not ready/);
  assert.equal(org.list("projects").length, 0);
  assert.equal(org.getTask(task.id).executionHistory.length, 2);
});

test("simple goals can produce direct tasks with no project", async (t) => {
  const { workflow, goal, propose, plan } = setup(t);
  const simple = plan();
  simple.projects = [];
  simple.tasks = [{ ...simple.tasks[0], projectKey: null }];
  const proposal = await propose(simple);
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId });
  assert.equal(result.projects.length, 0);
  assert.equal(result.tasks[0].projectId, null);
});

test("invalid plan graphs, nonexistent employees, capabilities and self-review fail closed", (t) => {
  const { org, plan, product } = setup(t);
  const mutations = [
    (p) => p.tasks[0].dependsOn.push("flows"),
    (p) => p.tasks[1].dependsOn.push("unknown"),
    (p) => { p.tasks[0].assignedAgentId = "unknown"; },
    (p) => { p.tasks[0].workType = "software_development"; },
    (p) => { p.tasks[0].executionMode = "shell"; },
    (p) => { p.tasks[0].projectKey = "missing"; },
    (p) => { p.tasks[1].key = p.tasks[0].key; },
    (p) => { p.tasks[1].projectKey = "definition"; },
    (p) => { p.tasks[1].workType = "review"; p.tasks[1].assignedAgentId = product.id; }
  ];
  for (const mutate of mutations) {
    const value = plan(); mutate(value);
    assert.throws(() => validateGoalPlan(value, org.list("agents")), /Invalid goal plan/);
  }
});

test("confirmation revalidates employee capabilities and is atomic", async (t) => {
  const { org, workflow, goal, propose, designer } = setup(t);
  const proposal = await propose();
  org.store.update((s) => { s.agents.find((a) => a.id === designer.id).capabilities = []; return s; });
  const before = org.store.read();
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId }), /capability/);
  assert.deepEqual(org.store.read(), before);
});

test("external and unbound code work remain blocked and cannot use general retry", async (t) => {
  const { org, workflow, goal, plan, propose, engineer } = setup(t);
  const value = plan();
  value.tasks[0].executionMode = "external";
  value.tasks[1] = { ...value.tasks[1], workType: "software_development", executionMode: "code", assignedAgentId: engineer.id };
  const proposal = await propose(value);
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId });
  assert.ok(result.tasks.every((task) => task.status === "blocked"));
  assert.throws(() => org.resumeGeneralTask(result.tasks[0].id, {}, { generalAvailable: true }), /External work/);
  assert.throws(() => workflow.configureCodeTask(result.tasks[1].id, { assetId: "unknown" }), /asset is required/);
  assert.equal(result.progress.percent, 0);
});

test("dependency handoffs reject unrelated goals and planning requires runtime policy", async (t) => {
  const { org, workflow, goal, propose, calls, runtimeAsset } = setup(t);
  const proposal = await propose();
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId });
  const other = org.createGoal({ title: "Private unrelated goal" });
  const unrelated = org.createTask({ goalId: other.id, title: "Private work" });
  org.updateTask(unrelated.id, { status: "completed" });
  const forged = { ...result.tasks[1], dependsOn: [unrelated.id] };
  assert.throws(() => workflow.dependencyContext(forged), /Unapproved dependency/);
  org.createPolicy({ name: "Deny all model execution", assetType: runtimeAsset.type, actions: ["execute"], effect: "deny" });
  const next = workflow.startPlanning(other.id);
  await assert.rejects(org.executeTask(next.id), /authorization denied/);
  assert.equal(calls.length, 1);
});

test("failure during plan materialization writes no partial work", async (t) => {
  const { org, workflow, goal, plan, propose, engineer } = setup(t);
  const value = plan();
  value.tasks[1] = { ...value.tasks[1], workType: "software_development", executionMode: "code", assignedAgentId: engineer.id };
  const proposal = await propose(value);
  const before = org.store.read();
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, codeAssets: { flows: "invalid" } }), /asset is invalid/);
  assert.deepEqual(org.store.read(), before);
});

test("explicitly bound plan code work keeps policy checks and waits for acceptance", async (t) => {
  const { org, workflow, goal, plan, propose, engineer, codeCalls, dir } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null, workType: "software_development", executionMode: "code", assignedAgentId: engineer.id }];
  const proposal = await propose(value);
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId });
  const asset = org.createAsset({ name: "Test repository", type: "source_code", workspacePath: dir });
  const task = workflow.configureCodeTask(result.tasks[0].id, { assetId: asset.id });
  await assert.rejects(org.executeTask(task.id), /authorization denied/);
  assert.equal(codeCalls.length, 0);
  org.createPolicy({ name: "Engineer works on test source", employeeJobType: engineer.jobType, assetType: "source_code", actions: ["read", "modify", "execute"] });
  workflow.configureCodeTask(task.id, { assetId: asset.id });
  const delivery = await org.executeTask(task.id);
  assert.equal(delivery.status, "awaiting_review");
  assert.equal(org.acceptTask(task.id).status, "completed");
  assert.equal(org.summarizeGoal(goal.id).outcomeStatus, "unverified");
});
