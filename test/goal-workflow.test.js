import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization, Scheduler } from "../src/organization.js";
import { createDefaultTools } from "../src/tools.js";
import { GeneralAgentExecutor } from "../src/executors/general.js";
import { GoalWorkflow, validateGoalPlan, validateQualityReview } from "../src/goal-workflow.js";

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
    if (output.process) return output.process;
    return { code: 0, stdout: [
      { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(output) } }, { type: "turn.completed" }
    ].map((e) => JSON.stringify(e)).join("\n") };
  } });
  const codeCalls = [];
  org.tools = createDefaultTools(org, { generalExecutor: executor, codexExecutor: { execute: async (input) => {
    codeCalls.push(input);
    return { summary: "Code change produced in an isolated worktree", worktreeId: input.task.id,
      changedFiles: ["example.js"], provider: "test" };
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
  const quality = (criteria, verdict = "pass", feedback = []) => delivery("review.json", JSON.stringify({ verdict,
    summary: verdict === "pass" ? "All criteria are supported by the delivery" : "The delivery needs correction", confidence: 0.9,
    checks: criteria.map((criterion, index) => ({ criterion, status: verdict === "pass" ? "pass" : index === 0 ? "fail" : "pass", evidence: "Specific content evidence" })), feedback }));
  const propose = async (value = plan()) => {
    responses.push(delivery("plan.json", JSON.stringify(value)));
    const task = workflow.startPlanning(goal.id);
    return org.executeTask(task.id);
  };
  return { org, workflow, goal, plan, delivery, quality, propose, responses, calls, codeCalls, ceo, product, designer, reviewer, engineer, runtimeAsset, store, dir };
}

test("goal proposal materializes projects only on approval and delivers through dependency handoffs", async (t) => {
  const { org, workflow, goal, propose, responses, calls, delivery, quality, store } = setup(t);
  const proposal = await propose();
  assert.equal(proposal.status, "awaiting_review");
  assert.equal(org.list("projects").length, 0);
  assert.equal(org.list("tasks").length, 1);
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "awaiting_plan_approval");
  assert.throws(() => org.acceptTask(proposal.id), /plan approval/);
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId }), /consent/);
  const input = { proposalId: proposal.output.proposalId, controlledAutonomy: true };
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
  assert.equal(org.getTask(brief.id).status, "awaiting_quality_review");
  assert.equal(org.getTask(flows.id).status, "pending");
  const briefReview = org.list("tasks").find((task) => task.reviewTargetTaskId === brief.id);
  responses.push(quality(brief.acceptanceCriteria));
  await org.executeTask(briefReview.id);
  assert.equal(org.getTask(brief.id).status, "completed");
  responses.push(delivery("flows.md", "A concrete flow based on the brief"));
  await scheduler.tick();
  while (scheduler.running.size) await new Promise((resolve) => setImmediate(resolve));
  assert.match(calls[3], /Unique accepted product requirements/);
  assert.equal(org.getTask(flows.id).status, "awaiting_quality_review");
  const flowReview = org.list("tasks").find((task) => task.reviewTargetTaskId === flows.id);
  responses.push(quality(flows.acceptanceCriteria));
  await org.executeTask(flowReview.id);
  assert.match(calls[4], /Unique accepted product requirements/, "the reviewer must receive accepted dependency artifacts");
  assert.equal(org.getTask(flows.id).status, "completed");
  let summary = org.summarizeGoal(goal.id);
  assert.equal(summary.executionStatus, "reporting");
  assert.equal(summary.finalReport.status, "pending");
  responses.push(delivery("executive-summary.md", "All two workstreams were accepted. Business outcomes remain unverified."));
  await org.executeTask(summary.finalReport.id);
  summary = org.summarizeGoal(goal.id);
  assert.equal(summary.executionStatus, "delivered");
  assert.equal(summary.finalReport.status, "completed");
  assert.equal(summary.progress.percent, 100);
  assert.equal(summary.outcomeStatus, "unverified");
  assert.equal(summary.autonomyUsage.modelRuns, 5);
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
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true });
  assert.equal(result.projects.length, 0);
  assert.equal(result.tasks[0].projectId, null);
});

test("CEO staffing proposals require Founder approval, hire from a template and trigger replanning", async (t) => {
  const { org, workflow, goal, propose, responses, delivery, ceo } = setup(t);
  const template = org.createJobTemplate({ name: "Research Analyst", jobType: "research_analyst", department: "Research",
    description: "Produces source-grounded analysis.", responsibilities: ["Research", "Source validation"], capabilities: ["research"] });
  const staffingPlan = { summary: "A dedicated research capability is required", assumptions: ["This is recurring work"],
    successCriteria: ["Research is completed by a qualified employee"], projects: [], tasks: [],
    staffingRequests: [{ key: "research_hire", templateId: template.id, name: "Research Specialist",
      reason: "The current roster has no dedicated research analyst for this recurring work.", expectedWorkTypes: ["research"], managerAgentId: ceo.id }] };
  const proposal = await propose(staffingPlan);
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "awaiting_staffing_approval");
  assert.equal(org.list("projects").length, 0);
  assert.equal(org.list("tasks").length, 1);
  const request = org.list("staffingRequests")[0];
  assert.equal(request.status, "pending");
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }), /Resolve staffing/);
  assert.throws(() => workflow.decideStaffingRequest(request.id, { decision: "approved" }), /reason/);

  const decision = workflow.decideStaffingRequest(request.id, { decision: "approved", reason: "The reusable capability is justified." });
  assert.equal(decision.request.status, "approved");
  assert.equal(decision.createdAgent.templateId, template.id);
  assert.deepEqual(decision.createdAgent.capabilities, ["research"]);
  assert.equal(decision.createdAgent.managerId, ceo.id);
  assert.equal(decision.planningTask.status, "pending");
  assert.match(decision.planningTask.messages.at(-1).content, /Founder staffing decisions/);
  assert.throws(() => workflow.decideStaffingRequest(request.id, { decision: "approved", reason: "Retry" }), /no longer pending/);

  const revisedPlan = { summary: "Research can now proceed", assumptions: [], successCriteria: ["Research memo accepted"], projects: [],
    staffingRequests: [], tasks: [{ key: "research", projectKey: null, title: "Research the opportunity", workType: "research",
      executionMode: "document", assignedAgentId: decision.createdAgent.id, instructions: "Produce a source-grounded research memo",
      deliverable: "research.md", acceptanceCriteria: ["Key claims are supported"], dependsOn: [] }] };
  responses.push(delivery("plan.json", JSON.stringify(revisedPlan)));
  const replanned = await org.executeTask(decision.planningTask.id);
  assert.equal(replanned.status, "awaiting_review");
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "awaiting_plan_approval");
  const approved = workflow.approvePlan(goal.id, { proposalId: replanned.output.proposalId, controlledAutonomy: true });
  assert.equal(approved.tasks[0].assignedAgentId, decision.createdAgent.id);
});

test("rejecting a staffing proposal creates no employee and asks the CEO to revise", async (t) => {
  const { org, workflow, goal, propose, ceo } = setup(t);
  const template = org.createJobTemplate({ name: "Sales Specialist", jobType: "sales_specialist", capabilities: ["research"] });
  const proposal = await propose({ summary: "Sales staffing proposed", assumptions: [], successCriteria: ["Sales work assigned"], projects: [], tasks: [],
    staffingRequests: [{ key: "sales_hire", templateId: template.id, name: "Sales Specialist", reason: "A recurring sales role is proposed.",
      expectedWorkTypes: ["sales"], managerAgentId: ceo.id }] });
  const request = org.list("staffingRequests").find((item) => item.proposalId === proposal.output.proposalId);
  const before = org.list("agents").length;
  const decision = workflow.decideStaffingRequest(request.id, { decision: "rejected", reason: "Use the current operations team." });
  assert.equal(decision.request.status, "rejected");
  assert.equal(decision.createdAgent, null);
  assert.equal(org.list("agents").length, before);
  assert.equal(decision.planningTask.status, "pending");
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
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }), /capability/);
  assert.deepEqual(org.store.read(), before);
});

test("external and unbound code work remain blocked and cannot use general retry", async (t) => {
  const { org, workflow, goal, plan, propose, engineer } = setup(t);
  const value = plan();
  value.tasks[0].executionMode = "external";
  value.tasks[1] = { ...value.tasks[1], workType: "software_development", executionMode: "code", assignedAgentId: engineer.id };
  const proposal = await propose(value);
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true });
  assert.ok(result.tasks.every((task) => task.status === "blocked"));
  assert.throws(() => org.resumeGeneralTask(result.tasks[0].id, {}, { generalAvailable: true }), /External work/);
  assert.throws(() => workflow.configureCodeTask(result.tasks[1].id, { assetId: "unknown" }), /asset is required/);
  assert.equal(result.progress.percent, 0);
});

test("dependency handoffs reject unrelated goals and planning requires runtime policy", async (t) => {
  const { org, workflow, goal, propose, calls, runtimeAsset } = setup(t);
  const proposal = await propose();
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true });
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
  assert.throws(() => workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true, codeAssets: { flows: "invalid" } }), /asset is invalid/);
  assert.deepEqual(org.store.read(), before);
});

test("explicitly bound plan code work keeps policy checks and waits for acceptance", async (t) => {
  const { org, workflow, goal, plan, propose, engineer, codeCalls, dir } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null, workType: "software_development", executionMode: "code", assignedAgentId: engineer.id }];
  const proposal = await propose(value);
  const result = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true });
  const asset = org.createAsset({ name: "Test repository", type: "source_code", workspacePath: dir });
  const task = workflow.configureCodeTask(result.tasks[0].id, { assetId: asset.id });
  await assert.rejects(org.executeTask(task.id), /authorization denied/);
  assert.equal(codeCalls.length, 0);
  assert.equal(org.getGoal(goal.id).autonomyUsage.modelRuns, 0);
  org.createPolicy({ name: "Engineer works on test source", employeeJobType: engineer.jobType, assetType: "source_code", actions: ["read", "modify", "execute"] });
  workflow.configureCodeTask(task.id, { assetId: asset.id });
  const delivery = await org.executeTask(task.id);
  assert.equal(delivery.status, "awaiting_review");
  assert.equal(org.getGoal(goal.id).autonomyUsage.modelRuns, 1);
  assert.equal(org.acceptTask(task.id).status, "completed");
  assert.equal(org.list("integrationRequests")[0].status, "pending");
  assert.equal(org.summarizeGoal(goal.id).outcomeStatus, "unverified");
});

test("controlled autonomy revises failed document work and accepts a corrected delivery", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery, quality } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;

  responses.push(delivery("brief.md", "An incomplete first draft"));
  await org.executeTask(work.id);
  let review = org.list("tasks").find((task) => task.reviewTargetTaskId === work.id && task.status === "pending");
  assert.notEqual(review.assignedAgentId, work.assignedAgentId);
  responses.push(quality(work.acceptanceCriteria, "revise", ["Add all three core features with concrete user value."]));
  await org.executeTask(review.id);
  let revised = org.getTask(work.id);
  assert.equal(revised.status, "pending");
  assert.equal(revised.autoRevisionCount, 1);
  assert.equal(revised.executionHistory.length, 1);
  assert.match(revised.messages[0].content, /three core features/);

  responses.push(delivery("brief.md", "Three concrete core features with user value"));
  await org.executeTask(work.id);
  review = org.list("tasks").find((task) => task.reviewTargetTaskId === work.id && task.status === "pending");
  responses.push(quality(work.acceptanceCriteria));
  await org.executeTask(review.id);
  revised = org.getTask(work.id);
  assert.equal(revised.status, "completed");
  assert.equal(revised.acceptanceMode, "independent_quality_review");
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "reporting");
});

test("the CEO can return a low-risk uncertainty to independent review without accepting it", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery, quality } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;
  responses.push(delivery("brief.md", "A usable internal delivery"));
  await org.executeTask(work.id);
  const firstReview = org.list("tasks").find((task) => task.reviewTargetTaskId === work.id);
  responses.push(delivery("review.json", JSON.stringify({
    verdict: "escalate",
    summary: "One internal reference was not visible to the reviewer",
    confidence: 0.9,
    checks: work.acceptanceCriteria.map((criterion) => ({ criterion, status: "uncertain", evidence: "The internal reference was not supplied" })),
    feedback: ["Repeat the review with the accepted internal context."]
  })));
  await org.executeTask(firstReview.id);
  assert.equal(org.getTask(work.id).status, "awaiting_review");
  const retried = workflow.retryRoutineReview(work.id);
  assert.equal(retried.task.status, "awaiting_quality_review");
  assert.notEqual(retried.review.id, firstReview.id);
  responses.push(quality(work.acceptanceCriteria));
  await org.executeTask(retried.review.id);
  assert.equal(org.getTask(work.id).status, "completed");
  assert.ok(org.list("events").some((event) => event.type === "task.routine_review_retried"));
});

test("a mixed uncertainty and fixable internal failure is revised before Founder escalation", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null,
    acceptanceCriteria: ["Internal reference is consistent", "Action list is minimal"] }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;
  responses.push(delivery("brief.md", "A delivery with one correctable list item"));
  await org.executeTask(work.id);
  const review = org.list("tasks").find((task) => task.reviewTargetTaskId === work.id);
  responses.push(delivery("review.json", JSON.stringify({
    verdict: "escalate",
    summary: "One reference is uncertain and one list item is fixable",
    confidence: 0.9,
    checks: [
      { criterion: "Internal reference is consistent", status: "uncertain", evidence: "The reference was not visible" },
      { criterion: "Action list is minimal", status: "fail", evidence: "One post-delivery duty is included" }
    ],
    feedback: ["Move the post-delivery duty out of the action list."]
  })));
  await org.executeTask(review.id);
  const revised = org.getTask(work.id);
  assert.equal(revised.status, "pending");
  assert.equal(revised.autoRevisionCount, 1);
  assert.match(revised.messages.at(-1).content, /post-delivery duty/);
  assert.equal(revised.founderReviewRequired, false);
});

test("future blocked work does not hide the active project stage", async (t) => {
  const { org, workflow, goal, plan, propose } = setup(t);
  const value = plan();
  value.projects = [{ key: "launch", title: "Launch", objective: "Prepare then publish", successCriteria: ["Package ready"] }];
  value.tasks = value.tasks.map((task) => ({ ...task, projectKey: "launch" }));
  const proposal = await propose(value);
  const accepted = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true });
  org.updateTask(accepted.tasks[1].id, { status: "blocked", blockedReason: "A future connector is not configured." });
  const project = workflow.summarizeProject(accepted.projects[0].id);
  assert.equal(project.progress.status, "in_progress");
  assert.deepEqual(project.progress.futureBlockerIds, [accepted.tasks[1].id]);
  assert.deepEqual(project.progress.currentBlockerIds, []);
});

test("the CEO resumes a document when requested files exist in the accepted transitive dependency chain", async (t) => {
  const { org, workflow, goal, plan, propose, product } = setup(t);
  const value = plan();
  value.projects = [{ key: "delivery", title: "Delivery", objective: "Build and review", successCriteria: ["Reviewed"] }];
  value.tasks = [
    { ...value.tasks[0], projectKey: "delivery" },
    { ...value.tasks[1], projectKey: "delivery" },
    { key: "final", projectKey: "delivery", title: "Final review", workType: "product_strategy", executionMode: "document",
      assignedAgentId: product.id, instructions: "Review the complete chain", deliverable: "final.md",
      acceptanceCriteria: ["All upstream decisions are covered"], dependsOn: ["flows"] }
  ];
  const proposal = await propose(value);
  const accepted = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true });
  const [brief, flows, final] = accepted.tasks;
  const artifact = (filename, content) => ({ filename, content, sha256: `${filename}-hash`, bytes: content.length });
  org.updateTask(brief.id, { status: "completed", output: { outcome: "delivered", summary: "Brief", artifacts: [artifact("brief.md", "Brief content")] }, evidence: [{ id: "brief-evidence" }] });
  org.updateTask(flows.id, { status: "completed", output: { outcome: "delivered", summary: "Flows", artifacts: [artifact("flows.md", "Flow content")] }, evidence: [{ id: "flow-evidence" }] });
  org.updateTask(final.id, { status: "needs_input", output: { outcome: "needs_input", summary: "Need the original brief",
    questions: ["Please supply brief.md so I can complete the review."], limitations: [], artifacts: [] }, evidence: [{ id: "question-evidence" }] });
  const deliveries = workflow.dependencyContext(org.getTask(final.id));
  assert.deepEqual(deliveries.flatMap((delivery) => delivery.artifacts.map((item) => item.filename)), ["flows.md", "brief.md"]);
  const resumed = workflow.tryResolveRoutineInput(org.getTask(final.id));
  assert.equal(resumed.status, "pending");
  assert.match(resumed.messages.at(-1).content, /brief\.md/);
  assert.ok(org.list("events").some((event) => event.type === "task.routine_input_resolved"));
});

test("model-run budget exhaustion escalates to the Founder and an approved extension resumes it", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery, quality } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;
  org.store.update((state) => { state.goals.find((item) => item.id === goal.id).autonomyPolicy.maxModelRuns = 1; return state; });
  responses.push(delivery("brief.md", "A delivery ready for review"));
  await org.executeTask(work.id);
  const review = org.list("tasks").find((task) => task.reviewTargetTaskId === work.id);
  await assert.rejects(org.executeTask(review.id), /budget exhausted/);
  assert.equal(org.getTask(review.id).status, "blocked");
  assert.equal(org.getTask(work.id).status, "awaiting_review");
  assert.equal(org.getTask(work.id).founderReviewRequired, true);
  assert.equal(org.getGoal(goal.id).autonomyUsage.modelRuns, 1);
  assert.throws(() => workflow.extendBudget(goal.id, { taskId: review.id, additionalModelRuns: 8 }), /reason/);
  const resumed = workflow.extendBudget(goal.id, { taskId: review.id, additionalModelRuns: 8, reason: "Complete the approved independent review." });
  assert.equal(resumed.autonomyPolicy.maxModelRuns, 9);
  assert.equal(org.getTask(review.id).status, "pending");
  assert.equal(org.getTask(work.id).status, "awaiting_quality_review");
  responses.push(quality(work.acceptanceCriteria));
  await org.executeTask(review.id);
  assert.equal(org.getTask(work.id).status, "completed");
  assert.ok(org.list("events").some((event) => event.type === "goal.budget_extended"));
});

test("temporary provider failures retry within the approved attempt limit", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;
  responses.push({ process: { code: 1, stdout: "", stderr: "connection reset" } });
  const retry = await org.executeTask(work.id);
  assert.equal(retry.status, "pending");
  assert.ok(retry.nextAttemptAt);
  org.updateTask(work.id, { nextAttemptAt: new Date(Date.now() - 1000).toISOString() });
  responses.push(delivery("brief.md", "Recovered delivery"));
  const delivered = await org.executeTask(work.id);
  assert.equal(delivered.status, "awaiting_quality_review");
  assert.equal(delivered.attempts, 2);
  assert.equal(org.getGoal(goal.id).autonomyUsage.modelRuns, 2);
});

test("a Founder decision supersedes a budget-blocked review without hiding later report budget needs", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;
  org.store.update((state) => { state.goals.find((item) => item.id === goal.id).autonomyPolicy.maxModelRuns = 1; return state; });
  responses.push(delivery("brief.md", "A Founder-reviewable delivery"));
  await org.executeTask(work.id);
  const review = org.list("tasks").find((task) => task.reviewTargetTaskId === work.id);
  await assert.rejects(org.executeTask(review.id), /budget exhausted/);
  org.acceptTask(work.id);
  assert.equal(org.getTask(review.id).status, "superseded");
  const report = org.summarizeGoal(goal.id).finalReport;
  await assert.rejects(org.executeTask(report.id), /budget exhausted/);
  assert.equal(org.getTask(report.id).status, "blocked");
  workflow.extendBudget(goal.id, { taskId: report.id, additionalModelRuns: 4, reason: "Finish the approved executive report." });
  responses.push(delivery("executive-summary.md", "Delivery complete; external business outcomes remain unverified."));
  await org.executeTask(report.id);
  assert.equal(org.summarizeGoal(goal.id).executionStatus, "delivered");
});

test("quality review contracts cannot pass failed criteria", () => {
  assert.throws(() => validateQualityReview({ verdict: "pass", summary: "Looks good", confidence: 0.9,
    checks: [{ criterion: "Required criterion", status: "fail", evidence: "Missing" }], feedback: [] }, ["Required criterion"]), /pass requires/);
});

test("plans without a controlled-autonomy policy keep Founder document acceptance", async (t) => {
  const { org, workflow, goal, plan, propose, responses, delivery } = setup(t);
  const value = plan();
  value.projects = [];
  value.tasks = [{ ...value.tasks[0], projectKey: null }];
  const proposal = await propose(value);
  const [work] = workflow.approvePlan(goal.id, { proposalId: proposal.output.proposalId, controlledAutonomy: true }).tasks;
  org.store.update((state) => {
    const current = state.goals.find((item) => item.id === goal.id);
    current.autonomyPolicy = null;
    current.autonomyUsage = { modelRuns: 0 };
    return state;
  });
  responses.push(delivery("brief.md", "Legacy approved delivery"));
  const result = await org.executeTask(work.id);
  assert.equal(result.status, "awaiting_review");
  org.acceptTask(work.id);
  const summary = org.summarizeGoal(goal.id);
  assert.equal(summary.executionStatus, "delivered");
  assert.equal(summary.finalReport, null);
});
