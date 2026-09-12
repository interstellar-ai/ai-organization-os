import crypto from "node:crypto";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const severities = new Set(["low", "medium", "high", "critical"]);
const categories = new Set(["founder_report", "execution_failure", "capability_gap", "quality_failure", "integration_failure", "external_uncertainty"]);
const activeStatuses = new Set(["open", "goal_proposed", "in_progress", "ready_for_verification"]);

function required(value, name, limit = 6000) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) throw new Error(`${name} is required and must be under ${limit.toLocaleString()} characters`);
  return value.trim();
}

function safeText(value, limit = 1200) {
  return String(value || "")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]")
    .replace(/\b(api[_-]?key|access[_-]?token|password|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .trim()
    .slice(0, limit);
}

function fingerprint(candidate) {
  return crypto.createHash("sha256").update([candidate.sourceType, candidate.sourceId, candidate.category].join(":"), "utf8").digest("hex");
}

function dependenciesReady(task, tasks) {
  return (task.dependsOn || []).every((dependencyId) => {
    const dependency = tasks.find((item) => item.id === dependencyId);
    return dependency?.status === "completed" && (dependency.toolName !== "code.codex" || dependency.integrationStatus === "integrated");
  });
}

function expectedControlGate(reason) {
  return /select a protected source-code asset|founder approval is required|answer the employee|waiting for .*dependenc|model-run budget|controlled autonomy consent|legacy placeholder completion/i.test(reason);
}

function capabilityGap(reason) {
  return /executor|connector|adapter|not configured|not available|unavailable|implementation|runtime|repository/i.test(reason);
}

function taskCandidate(task, tasks) {
  const reason = safeText(task.error || task.blockedReason || task.nextAction);
  const reviewedTask = task.reviewTargetTaskId && tasks.find((item) => item.id === task.reviewTargetTaskId);
  if (task.taskKind === "quality_review" && reviewedTask?.status === "completed") return null;
  if (task.status === "failed") return {
    sourceType: "task", sourceId: task.id, sourceRevision: `${task.updatedAt}:${task.status}:${reason}`,
    goalId: task.goalId || null, taskId: task.id, category: "execution_failure",
    severity: ["software_development", "external"].includes(task.workType) || task.executionMode === "external" ? "high" : "medium",
    title: `Execution failure: ${safeText(task.title, 160)}`, summary: reason || "A task failed without a recorded diagnostic."
  };
  if (task.status === "blocked" && dependenciesReady(task, tasks) && reason && !expectedControlGate(reason) && capabilityGap(reason)) return {
    sourceType: "task", sourceId: task.id, sourceRevision: `${task.updatedAt}:${task.status}:${reason}`,
    goalId: task.goalId || null, taskId: task.id, category: "capability_gap",
    severity: task.executionMode === "external" || task.workType === "software_development" ? "high" : "medium",
    title: `Capability gap: ${safeText(task.title, 160)}`, summary: reason
  };
  const verdict = task.taskKind === "quality_review" && task.output?.review?.verdict;
  if (["revise", "escalate"].includes(verdict)) return {
    sourceType: "quality_review", sourceId: task.id, sourceRevision: `${task.updatedAt}:${verdict}:${safeText(task.output.review.summary)}`,
    goalId: task.goalId || null, taskId: task.reviewTargetTaskId || task.id, category: "quality_failure",
    severity: verdict === "escalate" ? "high" : "medium",
    title: `Quality finding: ${safeText(task.title, 160)}`, summary: safeText(task.output.review.summary)
  };
  return null;
}

function integrationCandidate(request, tasks) {
  if (request.status !== "failed") return null;
  const task = tasks.find((item) => item.id === request.taskId);
  const reason = safeText(request.error || request.result?.summary || "Code integration failed.");
  return {
    sourceType: "integration_request", sourceId: request.id, sourceRevision: `${request.updatedAt || request.decidedAt}:${request.status}:${reason}`,
    goalId: request.goalId || task?.goalId || null, taskId: request.taskId || null, category: "integration_failure", severity: "high",
    title: `Integration failure: ${safeText(task?.title || request.taskId, 160)}`, summary: reason
  };
}

function externalCandidate(action, tasks) {
  if (action.status !== "uncertain") return null;
  const task = tasks.find((item) => item.id === action.taskId);
  const reason = safeText(action.error || action.result?.summary || "An external action has an uncertain outcome.");
  return {
    sourceType: "external_action", sourceId: action.id, sourceRevision: `${action.updatedAt || action.decidedAt}:${action.status}:${reason}`,
    goalId: action.goalId || task?.goalId || null, taskId: action.taskId || null, category: "external_uncertainty", severity: "critical",
    title: `Uncertain external result: ${safeText(task?.title || action.connectorType, 160)}`, summary: reason
  };
}

function score(signal) {
  return ({ critical: 400, high: 300, medium: 200, low: 100 }[signal.severity] || 0) + Math.min(signal.occurrenceCount || 1, 20);
}

export class ImprovementLoop {
  constructor(organization) {
    this.organization = organization;
  }

  scan() {
    const tasks = this.organization.list("tasks");
    const candidates = [
      ...tasks.map((task) => taskCandidate(task, tasks)),
      ...this.organization.list("integrationRequests").map((request) => integrationCandidate(request, tasks)),
      ...this.organization.list("externalActions").map((action) => externalCandidate(action, tasks))
    ].filter(Boolean);
    const currentSignals = this.organization.list("improvementSignals");
    const goals = this.organization.list("goals");
    const linkedStatus = (signal) => {
      const goal = goals.find((item) => item.id === signal.linkedGoalId);
      if (!goal) return signal.status;
      if (goal.executionStatus === "delivered") return "ready_for_verification";
      if (goal.approvedPlanId || ["planning", "awaiting_plan_approval", "in_progress", "reporting"].includes(goal.executionStatus)) return "in_progress";
      return signal.status;
    };
    const hasCandidateChange = candidates.some((candidate) => {
      const existing = currentSignals.find((signal) => signal.fingerprint === fingerprint(candidate));
      return !existing || existing.sourceRevision !== candidate.sourceRevision;
    });
    const hasLinkedStatusChange = currentSignals.some((signal) => signal.linkedGoalId
      && ["goal_proposed", "in_progress"].includes(signal.status) && linkedStatus(signal) !== signal.status);
    const candidateFingerprints = new Set(candidates.map(fingerprint));
    const sourceIds = new Set([
      ...tasks.map((item) => item.id),
      ...this.organization.list("integrationRequests").map((item) => item.id),
      ...this.organization.list("externalActions").map((item) => item.id)
    ]);
    const hasInactiveSource = currentSignals.some((signal) => signal.status === "open" && signal.sourceType !== "founder_report"
      && sourceIds.has(signal.sourceId) && !candidateFingerprints.has(signal.fingerprint));
    if (!hasCandidateChange && !hasLinkedStatusChange && !hasInactiveSource) return { created: [], signals: this.list(), summary: this.summary() };
    const timestamp = now();
    const created = [];
    this.organization.store.update((state) => {
      state.improvementSignals ||= [];
      for (const candidate of candidates) {
        const key = fingerprint(candidate);
        const existing = state.improvementSignals.find((signal) => signal.fingerprint === key);
        if (existing) {
          if (existing.sourceRevision !== candidate.sourceRevision) {
            existing.sourceRevision = candidate.sourceRevision;
            existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
            existing.lastSeenAt = timestamp;
            existing.summary = candidate.summary;
            existing.severity = candidate.severity;
            if (existing.status === "superseded") existing.status = "open";
            existing.updatedAt = timestamp;
          }
          continue;
        }
        const signal = { id: id("improvement"), fingerprint: key, ...candidate, status: "open", occurrenceCount: 1,
          linkedGoalId: null, decisionReason: null, verificationEvidence: null, firstSeenAt: timestamp, lastSeenAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
        state.improvementSignals.push(signal);
        state.events.push({ id: id("event"), type: "improvement.detected", createdAt: timestamp,
          payload: { signalId: signal.id, category: signal.category, severity: signal.severity, sourceType: signal.sourceType, sourceId: signal.sourceId } });
        created.push(signal);
      }
      for (const signal of state.improvementSignals.filter((item) => item.linkedGoalId && ["goal_proposed", "in_progress"].includes(item.status))) {
        const goal = state.goals.find((item) => item.id === signal.linkedGoalId);
        if (!goal) continue;
        const nextStatus = goal.executionStatus === "delivered" ? "ready_for_verification"
          : goal.approvedPlanId || ["planning", "awaiting_plan_approval", "in_progress", "reporting"].includes(goal.executionStatus) ? "in_progress" : signal.status;
        if (nextStatus !== signal.status) Object.assign(signal, { status: nextStatus, updatedAt: timestamp });
      }
      for (const signal of state.improvementSignals.filter((item) => item.status === "open" && item.sourceType !== "founder_report")) {
        if (sourceIds.has(signal.sourceId) && !candidateFingerprints.has(signal.fingerprint)) Object.assign(signal, {
          status: "superseded", decisionReason: "The source record no longer presents this active deficiency.", updatedAt: timestamp
        });
      }
      return state;
    });
    return { created, signals: this.list(), summary: this.summary() };
  }

  list() {
    return this.organization.list("improvementSignals").slice().sort((left, right) => {
      const leftActive = activeStatuses.has(left.status) ? 1 : 0;
      const rightActive = activeStatuses.has(right.status) ? 1 : 0;
      return rightActive - leftActive || score(right) - score(left) || String(right.updatedAt).localeCompare(String(left.updatedAt));
    });
  }

  summary() {
    const signals = this.organization.list("improvementSignals");
    const active = signals.filter((signal) => activeStatuses.has(signal.status));
    return {
      total: signals.length,
      open: active.filter((signal) => signal.status === "open").length,
      inProgress: active.filter((signal) => ["goal_proposed", "in_progress"].includes(signal.status)).length,
      readyForVerification: active.filter((signal) => signal.status === "ready_for_verification").length,
      highPriority: active.filter((signal) => ["high", "critical"].includes(signal.severity)).length
    };
  }

  report(input = {}) {
    const timestamp = now();
    const title = safeText(required(input.title, "title", 180), 180);
    const summary = safeText(required(input.description, "description", 6000));
    const severity = severities.has(input.severity) ? input.severity : "medium";
    const category = categories.has(input.category) ? input.category : "founder_report";
    if (input.goalId) this.organization.getGoal(input.goalId);
    if (input.taskId && !this.organization.list("tasks").some((item) => item.id === input.taskId)) throw new Error("Task not found");
    const sourceId = id("founder_report");
    const candidate = { sourceType: "founder_report", sourceId, sourceRevision: timestamp, goalId: input.goalId || null,
      taskId: input.taskId || null, category, severity, title, summary };
    const signal = { id: id("improvement"), fingerprint: fingerprint(candidate), ...candidate, status: "open", occurrenceCount: 1,
      linkedGoalId: null, decisionReason: null, verificationEvidence: null, firstSeenAt: timestamp, lastSeenAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
    this.organization.store.update((state) => {
      state.improvementSignals.push(signal);
      state.events.push({ id: id("event"), type: "improvement.reported", createdAt: timestamp,
        payload: { signalId: signal.id, category: signal.category, severity: signal.severity, reportedBy: "Founder" } });
      return state;
    });
    return signal;
  }

  get(signalId) {
    const signal = this.organization.list("improvementSignals").find((item) => item.id === signalId);
    if (!signal) throw new Error("Improvement signal not found");
    return signal;
  }

  createGoal(signalId) {
    const signal = this.get(signalId);
    if (signal.linkedGoalId || signal.status !== "open") throw new Error("Improvement signal already has a decision or linked goal");
    const goal = this.organization.createGoal({
      title: `Improve: ${signal.title}`.slice(0, 180),
      description: [
        "Diagnose and correct this observed organizational deficiency.",
        `Observed issue: ${signal.summary}`,
        `Category: ${signal.category}. Severity: ${signal.severity}. Occurrences: ${signal.occurrenceCount}.`,
        "Produce checkable acceptance criteria, use a protected repository for software changes, add regression tests, require independent review, and preserve existing permission, integration, publication, deployment, and external-action gates.",
        "Do not claim resolution until evidence verifies the result."
      ].join("\n")
    });
    const timestamp = now();
    this.organization.store.update((state) => {
      const current = state.improvementSignals.find((item) => item.id === signalId);
      Object.assign(current, { status: "goal_proposed", linkedGoalId: goal.id, decisionReason: "Founder created a controlled improvement goal.", updatedAt: timestamp });
      state.events.push({ id: id("event"), type: "improvement.goal_created", createdAt: timestamp,
        payload: { signalId, goalId: goal.id, confirmedBy: "Founder" } });
      return state;
    });
    return { signal: this.get(signalId), goal };
  }

  linkGoal(signalId, input = {}) {
    const goalId = required(input.goalId, "goalId", 100);
    const goal = this.organization.getGoal(goalId);
    const signal = this.get(signalId);
    if (signal.linkedGoalId || signal.status !== "open") throw new Error("Improvement signal already has a decision or linked goal");
    const status = goal.executionStatus === "delivered" ? "ready_for_verification"
      : goal.approvedPlanId || ["planning", "awaiting_plan_approval", "in_progress", "reporting"].includes(goal.executionStatus) ? "in_progress" : "goal_proposed";
    const timestamp = now();
    this.organization.store.update((state) => {
      const current = state.improvementSignals.find((item) => item.id === signalId);
      Object.assign(current, { status, linkedGoalId: goal.id, decisionReason: "Founder linked an existing controlled goal.", updatedAt: timestamp });
      state.events.push({ id: id("event"), type: "improvement.goal_linked", createdAt: timestamp,
        payload: { signalId, goalId: goal.id, confirmedBy: "Founder" } });
      return state;
    });
    return { signal: this.get(signalId), goal };
  }

  dismiss(signalId, input = {}) {
    const reason = required(input.reason, "reason", 1000);
    const timestamp = now();
    this.organization.store.update((state) => {
      const signal = state.improvementSignals.find((item) => item.id === signalId);
      if (!signal) throw new Error("Improvement signal not found");
      if (signal.status !== "open") throw new Error("Only an open improvement signal can be dismissed");
      Object.assign(signal, { status: "dismissed", decisionReason: reason, updatedAt: timestamp });
      state.events.push({ id: id("event"), type: "improvement.dismissed", createdAt: timestamp, payload: { signalId, decidedBy: "Founder", reason } });
      return state;
    });
    return this.get(signalId);
  }

  resolve(signalId, input = {}) {
    const evidence = required(input.evidence, "verification evidence", 3000);
    const timestamp = now();
    this.organization.store.update((state) => {
      const signal = state.improvementSignals.find((item) => item.id === signalId);
      if (!signal) throw new Error("Improvement signal not found");
      if (!["open", "ready_for_verification"].includes(signal.status)) throw new Error("Improvement work must finish before resolution can be verified");
      Object.assign(signal, { status: "resolved", verificationEvidence: evidence, decisionReason: "Founder verified the outcome.", updatedAt: timestamp });
      state.events.push({ id: id("event"), type: "improvement.resolved", createdAt: timestamp, payload: { signalId, verifiedBy: "Founder" } });
      return state;
    });
    return this.get(signalId);
  }
}
