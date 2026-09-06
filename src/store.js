import fs from "node:fs";
import path from "node:path";

export const EMPTY_STATE = {
  agents: [],
  goals: [],
  projects: [],
  tasks: [],
  memories: [],
  events: [],
  ceoMessages: [],
  assets: [],
  policies: [],
  accessRequests: [],
  staffingRequests: [],
  jobTemplates: [],
  integrationRequests: [],
  externalActions: []
};

export function normalizeState(input) {
  const state = { ...EMPTY_STATE, ...input };
  state.agents = Array.isArray(state.agents) ? state.agents : [];
  state.goals = Array.isArray(state.goals) ? state.goals : [];
  state.projects = Array.isArray(state.projects) ? state.projects : [];
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  state.memories = Array.isArray(state.memories) ? state.memories : [];
  state.events = Array.isArray(state.events) ? state.events : [];
  state.ceoMessages = Array.isArray(state.ceoMessages) ? state.ceoMessages.map((message) => ({
    suggestedAction: null,
    createdAt: null,
    ...message
  })) : [];
  state.assets = Array.isArray(state.assets) ? state.assets : [];
  state.policies = Array.isArray(state.policies) ? state.policies.map((policy) => {
    if (policy.name === "Public publishing requires explicit grant" && policy.effect === "deny") {
      return { ...policy, effect: "approval_required", actions: (policy.actions || []).filter((action) => action !== "delete") };
    }
    return policy;
  }) : [];
  state.accessRequests = Array.isArray(state.accessRequests) ? state.accessRequests : [];
  state.staffingRequests = Array.isArray(state.staffingRequests) ? state.staffingRequests : [];
  state.jobTemplates = Array.isArray(state.jobTemplates) ? state.jobTemplates : [];
  state.integrationRequests = Array.isArray(state.integrationRequests) ? state.integrationRequests : [];
  state.externalActions = Array.isArray(state.externalActions) ? state.externalActions : [];

  state.agents = state.agents.map((agent) => ({
    templateId: null,
    jobType: agent.role || "worker",
    department: "General",
    managerId: null,
    responsibilities: [],
    projectIds: [],
    ...agent
  }));

  state.accessRequests = state.accessRequests.map((request) => ({
    grantType: "once",
    durationMinutes: 60,
    usesRemaining: null,
    expiresAt: null,
    consumedAt: null,
    ...request
  }));

  state.tasks = state.tasks.map((task) => {
    const normalized = {
      acceptanceCriteria: [],
      evidence: [],
      attempts: 0,
      blockedReason: null,
      executor: task.toolName || null,
      accessScope: [],
      accessExpiresAt: null,
      requestSource: null,
      workType: task.toolName === "code.codex" ? "software_development" : null,
      deliverable: "",
      context: "",
      routing: null,
      nextAction: null,
      messages: [],
      executionHistory: [],
      projectId: null,
      taskKind: "work",
      planId: null,
      executionMode: null,
      reviewTargetTaskId: null,
      reviewRound: 0,
      autoRevisionCount: 0,
      autoRetryCount: 0,
      founderReviewRequired: false,
      nextAttemptAt: null,
      leaseId: null,
      leaseExpiresAt: null,
      ...task
    };
    const isLegacyPlaceholder = normalized.status === "completed"
      && !normalized.toolName
      && normalized.output?.message === "Task completed by the default agent runner"
      && normalized.evidence.length === 0;
    if (isLegacyPlaceholder) {
      normalized.status = "blocked";
      normalized.blockedReason = "Legacy placeholder completion. Rerun this workflow with a real executor.";
      normalized.legacyOutput = normalized.output;
      normalized.output = null;
    }
    return normalized;
  });

  state.goals = state.goals.map((goal) => {
    if (goal.executionStatus) return { autonomyPolicy: null, autonomyUsage: { modelRuns: 0 }, ...goal };
    const tasks = state.tasks.filter((task) => task.goalId === goal.id);
    const executionStatus = tasks.length === 0
      ? "not_started"
      : tasks.some((task) => ["blocked", "failed"].includes(task.status))
        ? "blocked"
        : tasks.every((task) => task.status === "completed")
          ? "awaiting_review"
          : "in_progress";
    return { autonomyPolicy: null, autonomyUsage: { modelRuns: 0 }, ...goal, executionStatus };
  });
  return state;
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.write(EMPTY_STATE);
  }

  read() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    return normalizeState(JSON.parse(raw));
  }

  write(state) {
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, this.filePath);
  }

  update(mutator) {
    const state = this.read();
    const result = mutator(state) || state;
    this.write(result);
    return result;
  }
}
