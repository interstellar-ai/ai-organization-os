import crypto from "node:crypto";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const text = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;
const short = (value, limit = 700) => String(value || "").trim().slice(0, limit);

function taskSummary(task, agents, goals, projects) {
  return { id: task.id, title: task.title, status: task.status, workType: task.workType,
    employee: agents.find((agent) => agent.id === task.assignedAgentId)?.name || "Unassigned",
    goal: goals.find((goal) => goal.id === task.goalId)?.title || null,
    project: projects.find((project) => project.id === task.projectId)?.title || null,
    blocker: short(task.blockedReason || task.error || task.nextAction, 700) || null,
    evidenceCount: task.evidence?.length || 0, updatedAt: task.updatedAt };
}

export class ExecutiveChat {
  constructor(organization, executor, improvementLoop = null) {
    this.organization = organization;
    this.executor = executor;
    this.improvementLoop = improvementLoop;
  }

  snapshot() {
    this.improvementLoop?.scan();
    const org = this.organization;
    const agents = org.list("agents");
    const goals = org.list("goals");
    const projects = org.list("projects");
    const tasks = org.list("tasks");
    const activeTasks = tasks.filter((task) => ["running", "pending", "blocked", "failed", "needs_input", "awaiting_review", "awaiting_quality_review"].includes(task.status));
    const approvals = [
      ...org.list("staffingRequests").filter((item) => item.status === "pending").map((item) => ({ type: "staffing", subject: item.proposedName, reason: short(item.reason), createdAt: item.createdAt })),
      ...org.list("accessRequests").filter((item) => item.status === "pending").map((item) => ({ type: "access", subject: item.action, reason: short(item.reason), createdAt: item.createdAt })),
      ...org.list("integrationRequests").filter((item) => item.status === "pending").map((item) => ({ type: "code_integration", subject: item.taskId, reason: short(item.risk), createdAt: item.createdAt })),
      ...org.list("externalActions").filter((item) => item.status === "pending").map((item) => ({ type: "external_action", subject: item.connectorType, reason: short(item.operation), createdAt: item.createdAt }))
    ];
    const externalReadiness = org.list("founderActions").slice(-20).map((item) => ({
      id: item.id,
      taskId: item.taskId,
      title: item.title,
      provider: item.recommendation?.provider || null,
      connectorType: item.recommendation?.connectorType || null,
      status: item.status,
      publicAccountUrl: item.status === "completed" ? item.completion?.publicAccountUrl || null : null,
      updatedAt: item.updatedAt
    }));
    const improvementSignals = org.list("improvementSignals")
      .filter((item) => ["open", "goal_proposed", "in_progress", "ready_for_verification"].includes(item.status))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))).slice(0, 20)
      .map(({ id, title, summary, category, severity, status, occurrenceCount, linkedGoalId, firstSeenAt, lastSeenAt }) =>
        ({ id, title, summary: short(summary), category, severity, status, occurrenceCount, linkedGoalId, firstSeenAt, lastSeenAt }));
    return {
      generatedAt: now(),
      organization: { employeeCount: agents.length, departments: [...new Set(agents.map((agent) => agent.department))].sort() },
      goals: [...goals].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))).slice(0, 20).map((goal) => {
        const summary = org.summarizeGoal(goal.id);
        return { id: goal.id, title: goal.title, status: summary.executionStatus, progress: summary.progress, nextAction: short(summary.nextAction), updatedAt: goal.updatedAt };
      }),
      projects: [...projects].sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt))).slice(0, 30).map((project) => ({ id: project.id, title: project.title, objective: short(project.objective), goal: goals.find((goal) => goal.id === project.goalId)?.title || null })),
      activeTasks: [...activeTasks].sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))).slice(0, 50).map((task) => taskSummary(task, agents, goals, projects)),
      pendingApprovals: approvals.slice(-30),
      externalReadiness,
      continuousImprovement: { summary: this.improvementLoop?.summary() || { total: improvementSignals.length }, signals: improvementSignals }
    };
  }

  conversation() {
    return { messages: this.organization.list("ceoMessages").slice(-100), snapshot: this.snapshot(), runtime: this.executor.status() };
  }

  async send(input = {}) {
    if (!text(input.message, 12000)) throw new Error("CEO message is required and must be under 12,000 characters");
    const org = this.organization;
    const ceo = org.list("agents").find((agent) => agent.jobType === "ai_ceo" && agent.capabilities.includes("iterate"));
    if (!ceo) throw new Error("An AI CEO with conversation capability is required");
    const snapshot = this.snapshot();
    const history = org.list("ceoMessages").slice(-12).map(({ role, content, createdAt }) => ({ role, content, createdAt }));
    const result = await this.executor.execute({ ceo, message: input.message.trim(), history, snapshot });
    const founderMessage = { id: id("ceo_message"), role: "founder", content: input.message.trim(), createdAt: now(), suggestedAction: null };
    const ceoMessage = { id: id("ceo_message"), role: "ceo", content: result.reply, createdAt: now(), snapshotAt: snapshot.generatedAt,
      suggestedAction: result.suggestedAction.type === "none" ? null : { ...result.suggestedAction, createdGoalId: null }, provider: result.provider, usage: result.usage };
    org.store.update((state) => {
      state.ceoMessages.push(founderMessage, ceoMessage);
      if (state.ceoMessages.length > 100) state.ceoMessages.splice(0, state.ceoMessages.length - 100);
      state.events.push({ id: id("event"), type: "ceo.message_recorded", createdAt: now(), payload: { founderMessageId: founderMessage.id, ceoMessageId: ceoMessage.id, suggestedAction: result.suggestedAction.type } });
      return state;
    });
    return { founderMessage, ceoMessage, snapshot };
  }

  createGoalFromSuggestion(messageId) {
    const message = this.organization.list("ceoMessages").find((item) => item.id === messageId && item.role === "ceo");
    if (!message?.suggestedAction || message.suggestedAction.type !== "propose_goal") throw new Error("CEO message has no goal suggestion");
    if (message.suggestedAction.createdGoalId) throw new Error("This goal suggestion has already been used");
    const goal = this.organization.createGoal({ title: message.suggestedAction.title, description: message.suggestedAction.description });
    this.organization.store.update((state) => {
      const current = state.ceoMessages.find((item) => item.id === messageId);
      if (current?.suggestedAction) current.suggestedAction.createdGoalId = goal.id;
      state.events.push({ id: id("event"), type: "ceo.goal_suggestion_confirmed", createdAt: now(), payload: { messageId, goalId: goal.id } });
      return state;
    });
    return goal;
  }
}
