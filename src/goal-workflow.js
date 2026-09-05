import crypto from "node:crypto";
import { Organization, WORK_TYPES } from "./organization.js";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;
const text = (value, limit = 6000) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const strings = (value) => Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every((v) => text(v, 2000));

// Model output describes work, never permissions, tools, filesystem paths, or state.
export function validateGoalPlan(value, employees) {
  const invalid = (reason) => { throw new Error(`Invalid goal plan: ${reason}`); };
  if (!value || !text(value.summary) || !strings(value.successCriteria) || !Array.isArray(value.assumptions)
    || value.assumptions.length > 10 || !value.assumptions.every((v) => text(v, 2000))) invalid("summary and success criteria are required");
  if (!Array.isArray(value.projects) || value.projects.length > 5 || !Array.isArray(value.tasks) || !value.tasks.length || value.tasks.length > 16) invalid("use at most five projects and sixteen tasks");
  const keys = new Set();
  const key = (v) => {
    if (typeof v !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(v) || keys.has(v)) invalid("unique simple keys are required");
    keys.add(v);
    return v;
  };
  const projects = value.projects.map((p) => {
    if (!p || !text(p.title, 180) || !text(p.objective) || !strings(p.successCriteria)) invalid("invalid project");
    return { key: key(p.key), title: p.title, objective: p.objective, successCriteria: p.successCriteria };
  });
  const tasks = value.tasks.map((t) => {
    if (!t || !text(t.title, 180) || !text(t.instructions, 12000) || !text(t.deliverable, 2000) || !strings(t.acceptanceCriteria)) invalid("invalid task");
    const definition = Object.hasOwn(WORK_TYPES, t.workType) && WORK_TYPES[t.workType];
    const employee = employees.find((e) => e.id === t.assignedAgentId);
    if (!definition || !employee?.capabilities.includes(definition.capability)) invalid("unknown employee or incompatible capability");
    if (!["document", "code", "external"].includes(t.executionMode)) invalid("invalid execution mode");
    if ((t.executionMode === "code") !== (t.workType === "software_development")) invalid("software work must use code mode");
    if (t.projectKey !== null && !projects.some((p) => p.key === t.projectKey)) invalid("unknown project");
    if (projects.length && t.projectKey === null) invalid("project tasks must belong to a project");
    if (!Array.isArray(t.dependsOn) || t.dependsOn.length > 15 || new Set(t.dependsOn).size !== t.dependsOn.length) invalid("invalid dependencies");
    return { key: key(t.key), projectKey: t.projectKey, title: t.title, workType: t.workType, executionMode: t.executionMode,
      assignedAgentId: t.assignedAgentId, instructions: t.instructions, deliverable: t.deliverable,
      acceptanceCriteria: t.acceptanceCriteria, dependsOn: [...t.dependsOn] };
  });
  for (const p of projects) if (!tasks.some((t) => t.projectKey === p.key)) invalid("empty project");
  const visiting = new Set();
  const visited = new Set();
  const visit = (k) => {
    const t = tasks.find((item) => item.key === k);
    if (!t) invalid("unknown dependency");
    if (visiting.has(k)) invalid("cyclic dependency");
    if (visited.has(k)) return;
    visiting.add(k);
    t.dependsOn.forEach(visit);
    visiting.delete(k);
    visited.add(k);
  };
  tasks.forEach((t) => visit(t.key));
  for (const t of tasks.filter((t) => t.workType === "review")) {
    if (t.dependsOn.some((k) => tasks.find((item) => item.key === k).assignedAgentId === t.assignedAgentId)) invalid("reviewer must differ from the author of its dependencies");
  }
  return { summary: value.summary, successCriteria: value.successCriteria, assumptions: value.assumptions, projects, tasks };
}

function progress(tasks) {
  const completed = tasks.filter((t) => t.status === "completed").length;
  const status = !tasks.length ? "not_started" : completed === tasks.length ? "delivered"
    : tasks.some((t) => ["blocked", "failed"].includes(t.status)) ? "blocked"
      : tasks.some((t) => t.status === "needs_input") ? "needs_input"
        : tasks.some((t) => t.status === "awaiting_review") ? "awaiting_review" : "in_progress";
  return { status, total: tasks.length, completed, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}

export class GoalWorkflow {
  constructor(organization, executor, runtimeOptions = () => ({})) {
    this.organization = organization;
    this.executor = executor;
    this.runtimeOptions = runtimeOptions;
    organization.workflow = this;
  }

  registerTool() {
    this.organization.tools.register("goal.plan", "Propose a structured project and task plan for Founder approval",
      (_input, { task, agent }) => this.executePlanning(task, agent),
      { requiresRunningTask: true, authorize: (input) => ({ assetId: input.assetId, action: "execute" }) });
  }

  startPlanning(goalId, input = {}) {
    const org = this.organization;
    const goal = org.getGoal(goalId);
    if (goal.approvedPlanId) throw new Error("An approved plan already exists; create a new goal for a scope change");
    const old = goal.planningTaskId && org.getTask(goal.planningTaskId);
    if (old && ["pending", "running"].includes(old.status)) return old;
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (message.length > 20000) throw new Error("Planning feedback is too long");
    if (old && ["needs_input", "awaiting_review"].includes(old.status) && !message) throw new Error("Planning feedback is required");
    if (org.latestTasksForGoal(goalId).some((t) => t.taskKind !== "goal_planning" && ["pending", "running"].includes(t.status))) throw new Error("Finish active legacy work before planning this goal");
    const employee = org.list("agents").find((a) => a.jobType === "ai_ceo" && a.capabilities.includes("iterate"));
    if (!employee) throw new Error("An AI CEO with planning capability is required");
    const binding = org.generalTaskBinding(this.runtimeOptions());
    const fields = { ...binding, toolName: binding.toolName ? "goal.plan" : null, assignedAgentId: employee.id,
      taskKind: "goal_planning", requestSource: "goal_planning", goalId,
      title: `Plan: ${goal.title}`, description: goal.description || goal.title,
      workType: "general", routing: { requiredCapability: "iterate" },
      acceptanceCriteria: ["A validated plan or explicit clarification is returned"] };
    const task = old ? org.updateTask(old.id, { ...fields, executor: fields.toolName, error: null, evidence: [],
      messages: [...old.messages, ...(message ? [{ role: "founder", content: message, createdAt: now() }] : [])],
      executionHistory: [...old.executionHistory, { attempt: old.attempts, status: old.status, output: old.output, evidence: old.evidence, error: old.error, endedAt: now() }] }) : org.createTask(fields);
    org.store.update((state) => {
      Object.assign(state.goals.find((g) => g.id === goalId), { planningTaskId: task.id, updatedAt: now() });
      return state;
    });
    org.recordEvent("goal.planning_requested", { goalId, taskId: task.id });
    return task;
  }

  async executePlanning(task, agent) {
    const org = this.organization;
    const goal = org.getGoal(task.goalId);
    if (goal.planningTaskId !== task.id || goal.approvedPlanId || agent.jobType !== "ai_ceo") throw new Error("Planning task identity is invalid");
    const employees = org.list("agents").map(({ id, name, jobType, capabilities }) => ({ id, name, jobType, capabilities }));
    const schemaExample = { summary: "Plan rationale", successCriteria: ["Measurable goal outcome"], assumptions: ["Explicit assumption"],
      projects: [{ key: "project_one", title: "A bounded project", objective: "What this project achieves", successCriteria: ["Project acceptance condition"] }],
      tasks: [{ key: "task_one", projectKey: "project_one", title: "Produce a concrete deliverable", workType: "product_strategy", executionMode: "document",
        assignedAgentId: "an exact employee id from the roster", instructions: "Concrete work instructions", deliverable: "Named output",
        acceptanceCriteria: ["Checkable criterion"], dependsOn: [] }] };
    const instructions = [
      "Act as the AI CEO planning this goal, not executing the downstream tasks.",
      "If essential scope, success criteria or constraints are missing, use needs_input and ask concise questions. Do not ask unnecessary questions when the brief is executable.",
      "Otherwise deliver exactly one plan.json artifact using the following JSON structure. The host validates and materializes this only after Founder approval.",
      "Use zero projects and null projectKey for simple work. Use 1-5 meaningful projects and at most 16 tasks for larger goals. Every project must contain tasks. Avoid unnecessary decomposition.",
      "Choose actual employees from the roster with a compatible capability for each workType. Use unique simple keys and an acyclic dependsOn list of task keys, including cross-project dependencies when necessary.",
      "Document mode can write product briefs, textual designs, analysis of supplied context, content or sales drafts and operations plans. It cannot browse, publish or contact people.",
      "Code mode is only for software_development. A Founder must select its protected repository. Code changes remain in isolated worktrees; applying them and chaining code changes is not automated.",
      "Use external mode for essential unavailable actions such as live research, image generation, sending, publishing or deployment; these tasks will remain blocked. Do not replace the business goal with merely writing a plan and claim it achieved.",
      "Use dependencies to pass necessary accepted artifacts between employees. Plan confirmation explicitly authorizes those handoffs within this goal, not access to other organizational data.",
      "Include explicit assumptions, realistic deliverables, acceptance criteria and a final review task when appropriate. Do not invent budgets, deadlines, sources, credentials, permissions or employees.",
      JSON.stringify(schemaExample),
      JSON.stringify({ goal: { title: goal.title, description: goal.description, metrics: goal.metrics }, employees,
        workTypes: Object.fromEntries(Object.entries(WORK_TYPES).map(([k, v]) => [k, { capability: v.capability }])) })
    ].join("\n");
    const output = await this.executor.execute({ task: { ...task, description: instructions }, agent });
    if (output.outcome !== "delivered") return { ...output, kind: "goal_plan" };
    if (output.artifacts.length !== 1 || output.artifacts[0].filename !== "plan.json") throw new Error("Planner must return exactly one plan.json artifact");
    const plan = validateGoalPlan(JSON.parse(output.artifacts[0].content), employees);
    return { ...output, kind: "goal_plan", plan, proposalId: id("proposal") };
  }

  approvePlan(goalId, input = {}) {
    const org = this.organization;
    const goal = org.getGoal(goalId);
    if (!text(input.proposalId, 100)) throw new Error("Proposal identity is required");
    if (goal.approvedPlanId) {
      if (goal.approvedPlanId !== input.proposalId) throw new Error("A different plan is already approved");
      return this.summarizeGoal(goalId);
    }
    const planning = goal.planningTaskId && org.getTask(goal.planningTaskId);
    if (planning?.status !== "awaiting_review" || planning.output?.proposalId !== input.proposalId || !planning.evidence.length) throw new Error("Plan is not ready or proposal is stale");
    const plan = validateGoalPlan(planning.output.plan, org.list("agents"));
    // Prepare all changes on an isolated copy. Validation failure writes nothing.
    let draft = org.store.read();
    const stagedStore = { read: () => structuredClone(draft), update: (fn) => { draft = fn(structuredClone(draft)); return draft; } };
    const staged = new Organization(stagedStore, org.tools);
    const projectIds = new Map(plan.projects.map((p) => [p.key, id("project")]));
    const taskIds = new Map();
    const runtime = this.runtimeOptions();
    for (const proposed of plan.tasks) {
      let task;
      const common = { goalId, title: proposed.title, instructions: proposed.instructions, workType: proposed.workType,
        assignedAgentId: proposed.assignedAgentId, deliverable: proposed.deliverable, acceptanceCriteria: proposed.acceptanceCriteria,
        context: `Goal: ${goal.title}\n${goal.description}\nAssumptions: ${plan.assumptions.join("; ")}`, priority: goal.priority };
      const assetId = input.codeAssets?.[proposed.key];
      if (proposed.executionMode === "external" || (proposed.executionMode === "code" && !assetId)) {
        const reason = proposed.executionMode === "external" ? "An approved external connector is required. This action has not been performed."
          : "Select a protected source-code asset in the project task before starting code work.";
        task = staged.createTask({ ...common, description: common.instructions, status: "blocked", requestSource: "founder_work_request", blockedReason: reason, nextAction: reason });
      } else {
        if (proposed.executionMode === "code" && !staged.list("assets").some((a) => a.id === assetId && a.type === "source_code" && a.workspacePath)) throw new Error("Selected source-code asset is invalid");
        task = staged.createWorkRequest({ ...common, ...(assetId ? { assetId } : {}) }, runtime);
      }
      staged.updateTask(task.id, { projectId: projectIds.get(proposed.projectKey) || null, planId: input.proposalId,
        planKey: proposed.key, executionMode: proposed.executionMode,
        routing: { ...task.routing, requiredCapability: WORK_TYPES[proposed.workType].capability } });
      taskIds.set(proposed.key, task.id);
    }
    for (const proposed of plan.tasks) staged.updateTask(taskIds.get(proposed.key), { dependsOn: proposed.dependsOn.map((k) => taskIds.get(k)) });
    const projectManager = staged.list("agents").find((a) => a.jobType === "project_manager")?.id || planning.assignedAgentId;
    draft.projects.push(...plan.projects.map((p) => ({ id: projectIds.get(p.key), goalId, planId: input.proposalId,
      title: p.title, objective: p.objective, successCriteria: p.successCriteria, ownerAgentId: projectManager, createdAt: now() })));
    Object.assign(draft.tasks.find((t) => t.id === planning.id), { status: "completed", acceptedAt: now(), nextAction: null });
    Object.assign(draft.goals.find((g) => g.id === goalId), { approvedPlanId: input.proposalId, approvedAt: now(),
      approvedSuccessCriteria: plan.successCriteria, outcomeStatus: "unverified", updatedAt: now() });
    draft.events.push({ id: id("event"), type: "goal.plan_approved", createdAt: now(), payload: { goalId, proposalId: input.proposalId,
      projectCount: plan.projects.length, taskCount: plan.tasks.length, artifactHandoffsApproved: true } });
    org.syncGoalStatus(draft, goalId);
    org.store.update(() => draft);
    return this.summarizeGoal(goalId);
  }

  configureCodeTask(taskId, input) {
    const org = this.organization;
    const task = org.getTask(taskId);
    if (!task.planId || task.executionMode !== "code" || !["blocked", "failed"].includes(task.status)) throw new Error("Task is not waiting for a code workspace");
    if (org.getGoal(task.goalId).approvedPlanId !== task.planId) throw new Error("Approved plan is required");
    if (!this.runtimeOptions().codexAvailable) throw new Error("Codex runtime is unavailable");
    const asset = org.list("assets").find((a) => a.id === input.assetId && a.type === "source_code" && a.workspacePath);
    if (!asset) throw new Error("A configured source-code asset is required");
    if (task.dependsOn.some((dep) => org.getTask(dep).executionMode === "code")) throw new Error("Apply upstream code to a reviewed workspace before code chaining; automatic code chaining is not available");
    const result = org.updateTask(taskId, { status: "pending", toolName: "code.codex", executor: "code.codex",
      input: { assetId: asset.id, instructions: task.description }, accessScope: [{ assetId: asset.id, actions: ["read", "modify", "execute"] }],
      accessExpiresAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(), error: null, blockedReason: null, nextAction: null });
    org.recordEvent("task.code_configured", { taskId, assetId: asset.id });
    return result;
  }

  dependencyContext(task) {
    if (!task.planId) return [];
    const org = this.organization;
    const goal = org.getGoal(task.goalId);
    if (goal.approvedPlanId !== task.planId) throw new Error("Task has no approved goal plan");
    const deliveries = task.dependsOn.map((dependencyId) => {
      const dep = org.getTask(dependencyId);
      if (dep.goalId !== task.goalId || dep.planId !== task.planId || dep.status !== "completed") throw new Error("Unapproved dependency handoff");
      return { taskId: dep.id, title: dep.title, summary: dep.output?.summary, artifacts: dep.output?.artifacts || [],
        limitations: dep.output?.limitations || [], evidence: dep.evidence };
    });
    if (deliveries.length) org.recordEvent("task.artifacts_handed_off", { taskId: task.id, goalId: goal.id, planId: task.planId,
      recipientAgentId: task.assignedAgentId, dependencies: deliveries.map((d) => ({ taskId: d.taskId,
        artifacts: d.artifacts.map((a) => ({ filename: a.filename, sha256: a.sha256 })) })) });
    return deliveries;
  }

  summarizeProject(projectId) {
    const project = this.organization.list("projects").find((p) => p.id === projectId);
    if (!project) throw new Error("Project not found");
    const tasks = this.organization.list("tasks").filter((t) => t.projectId === projectId);
    return { ...project, progress: progress(tasks), tasks };
  }

  summarizeGoal(goalId) {
    const org = this.organization;
    const goal = org.getGoal(goalId);
    const planningTask = org.getTask(goal.planningTaskId);
    const tasks = org.list("tasks").filter((t) => t.goalId === goalId && t.planId && t.planId === goal.approvedPlanId);
    const delivery = progress(tasks);
    const executionStatus = goal.approvedPlanId ? delivery.status : planningTask.status === "awaiting_review" ? "awaiting_plan_approval"
      : planningTask.status === "needs_input" ? "needs_input" : ["pending", "running"].includes(planningTask.status) ? "planning" : "blocked";
    return { ...goal, planningTask, executionStatus, progress: { ...delivery, counts: tasks.reduce((all, t) => ({ ...all, [t.status]: (all[t.status] || 0) + 1 }), {}) },
      tasks, projects: org.list("projects").filter((p) => p.goalId === goalId).map((p) => this.summarizeProject(p.id)),
      evidence: tasks.flatMap((t) => t.evidence || []), nextAction: !goal.approvedPlanId ? "Review the CEO proposal or answer its questions."
        : delivery.status === "delivered" ? "All planned deliveries are accepted. Verify the business outcome separately."
          : "Review waiting deliveries to unlock dependent tasks; resolve any blocked work." };
  }
}
