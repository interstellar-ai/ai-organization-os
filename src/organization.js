import crypto from "node:crypto";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const ACCESS_ACTIONS = ["read", "create", "modify", "execute", "share", "publish", "approve", "delete", "grant", "spend"];

function required(value, name) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function taskCounts(tasks) {
  return tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    return counts;
  }, {});
}

function policyMatches(policy, agent, asset) {
  return ["*", agent.jobType, agent.role].includes(policy.employeeJobType)
    && ["*", agent.department].includes(policy.employeeDepartment)
    && ["*", asset.type].includes(policy.assetType)
    && ["*", asset.environment].includes(policy.assetEnvironment);
}

function accessForAgent(agent, assets, policies, approvedRequests = []) {
  return assets.map((asset) => {
    const matched = policies.filter((policy) => policyMatches(policy, agent, asset));
    const actions = ACCESS_ACTIONS.map((action) => {
      const sources = matched.filter((policy) => policy.actions.includes(action));
      const temporary = approvedRequests.filter((request) => request.assetId === asset.id && request.action === action);
      const denied = sources.some((policy) => policy.effect === "deny");
      const allowed = !denied && (sources.some((policy) => policy.effect === "allow") || temporary.length > 0);
      const approvalRequired = !denied && !allowed && sources.some((policy) => policy.effect === "approval_required");
      return {
        action,
        effect: denied ? "denied" : allowed ? "allowed" : approvalRequired ? "approval_required" : "not_granted",
        sources: [
          ...sources.map((policy) => ({ type: "policy", id: policy.id, name: policy.name, effect: policy.effect })),
          ...temporary.map((request) => ({ type: "temporary_grant", id: request.id, name: request.grantType === "once" ? "One use" : `Until ${request.expiresAt}`, effect: "allow", usesRemaining: request.usesRemaining, expiresAt: request.expiresAt }))
        ]
      };
    });
    return { asset, actions };
  });
}

export class Organization {
  constructor(store, tools) {
    this.store = store;
    this.tools = tools;
  }

  list(resource) {
    return this.store.read()[resource] ?? [];
  }

  getGoal(goalId) {
    const goal = this.list("goals").find((item) => item.id === goalId);
    if (!goal) throw new Error("Goal not found");
    return goal;
  }

  getTask(taskId) {
    const task = this.list("tasks").find((item) => item.id === taskId);
    if (!task) throw new Error("Task not found");
    return task;
  }

  recordEvent(type, payload = {}) {
    const event = { id: id("event"), type, payload, createdAt: now() };
    this.store.update((state) => {
      state.events.push(event);
      return state;
    });
    return event;
  }

  createAgent(input = {}) {
    const template = input.templateId
      ? this.list("jobTemplates").find((item) => item.id === input.templateId)
      : null;
    if (input.templateId && !template) throw new Error("Job template not found");
    if (input.managerId && !this.list("agents").some((item) => item.id === input.managerId)) throw new Error("Manager not found");
    const timestamp = now();
    const agent = {
      id: id("agent"),
      name: required(input.name, "name"),
      templateId: template?.id || null,
      role: input.role?.trim() || template?.jobType || "worker",
      jobType: input.jobType?.trim() || input.role?.trim() || template?.jobType || "worker",
      department: input.department?.trim() || template?.department || "General",
      managerId: input.managerId || null,
      description: input.description?.trim() || template?.description || "",
      responsibilities: Array.isArray(input.responsibilities) ? input.responsibilities : template?.responsibilities || [],
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : template?.capabilities || [],
      projectIds: Array.isArray(input.projectIds) ? input.projectIds : [],
      status: "idle",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.agents.push(agent);
      return state;
    });
    this.recordEvent("agent.created", { agentId: agent.id, name: agent.name });
    return agent;
  }

  previewAgentFromTemplate(templateId) {
    const template = this.list("jobTemplates").find((item) => item.id === templateId);
    if (!template) throw new Error("Job template not found");
    const candidate = {
      role: template.jobType,
      jobType: template.jobType,
      department: template.department
    };
    const access = accessForAgent(candidate, this.list("assets"), this.list("policies"));
    const matchedPolicies = this.list("policies").filter((policy) =>
      ["*", candidate.jobType, candidate.role].includes(policy.employeeJobType)
      && ["*", candidate.department].includes(policy.employeeDepartment)
    );
    return {
      template,
      matchedPolicies: matchedPolicies.map(({ id: policyId, name, effect, actions, assetType, assetEnvironment }) => ({ policyId, name, effect, actions, assetType, assetEnvironment })),
      access,
      summary: access.reduce((counts, item) => {
        for (const permission of item.actions) counts[permission.effect] = (counts[permission.effect] || 0) + 1;
        return counts;
      }, { allowed: 0, approval_required: 0, denied: 0, not_granted: 0 })
    };
  }

  createJobTemplate(input = {}) {
    const timestamp = now();
    const jobType = required(input.jobType, "jobType");
    if (this.list("jobTemplates").some((item) => item.jobType === jobType)) throw new Error("Job template already exists");
    const template = {
      id: id("template"),
      name: required(input.name, "name"),
      jobType,
      department: input.department?.trim() || "General",
      description: input.description?.trim() || "",
      responsibilities: Array.isArray(input.responsibilities) ? input.responsibilities : [],
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.jobTemplates.push(template);
      return state;
    });
    this.recordEvent("job_template.created", { templateId: template.id, jobType: template.jobType });
    return template;
  }

  createGoal(input = {}) {
    const timestamp = now();
    const goal = {
      id: id("goal"),
      title: required(input.title, "title"),
      description: input.description?.trim() || "",
      status: "active",
      executionStatus: "not_started",
      priority: Number.isFinite(input.priority) ? input.priority : 3,
      metrics: Array.isArray(input.metrics) ? input.metrics : [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.goals.push(goal);
      return state;
    });
    this.recordEvent("goal.created", { goalId: goal.id, title: goal.title });
    return goal;
  }

  createAsset(input = {}) {
    const timestamp = now();
    const asset = {
      id: id("asset"),
      name: required(input.name, "name"),
      type: required(input.type, "type"),
      owner: input.owner?.trim() || "Organization",
      projectId: input.projectId || null,
      sensitivity: input.sensitivity?.trim() || "internal",
      environment: input.environment?.trim() || "workspace",
      externalImpact: input.externalImpact?.trim() || "none",
      description: input.description?.trim() || "",
      tags: Array.isArray(input.tags) ? input.tags : [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.assets.push(asset);
      return state;
    });
    this.recordEvent("asset.created", { assetId: asset.id, type: asset.type, sensitivity: asset.sensitivity });
    return asset;
  }

  createPolicy(input = {}) {
    const actions = Array.isArray(input.actions)
      ? input.actions.map((action) => String(action).toLowerCase()).filter((action) => ACCESS_ACTIONS.includes(action))
      : [];
    if (!actions.length) throw new Error("actions are required");
    const timestamp = now();
    const policy = {
      id: id("policy"),
      name: required(input.name, "name"),
      employeeJobType: input.employeeJobType?.trim() || "*",
      employeeDepartment: input.employeeDepartment?.trim() || "*",
      assetType: input.assetType?.trim() || "*",
      assetEnvironment: input.assetEnvironment?.trim() || "*",
      effect: ["deny", "approval_required"].includes(input.effect) ? input.effect : "allow",
      actions,
      description: input.description?.trim() || "",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.policies.push(policy);
      return state;
    });
    this.recordEvent("policy.created", { policyId: policy.id, effect: policy.effect, actions });
    return policy;
  }

  previewPolicy(input = {}) {
    const actions = Array.isArray(input.actions)
      ? input.actions.map((action) => String(action).toLowerCase()).filter((action) => ACCESS_ACTIONS.includes(action))
      : [];
    if (!actions.length) throw new Error("actions are required");
    const candidate = {
      employeeJobType: input.employeeJobType?.trim() || "*",
      employeeDepartment: input.employeeDepartment?.trim() || "*",
      assetType: input.assetType?.trim() || "*",
      assetEnvironment: input.assetEnvironment?.trim() || "*",
      effect: ["deny", "approval_required"].includes(input.effect) ? input.effect : "allow",
      actions
    };
    const agents = this.list("agents").filter((agent) =>
      ["*", agent.jobType, agent.role].includes(candidate.employeeJobType)
      && ["*", agent.department].includes(candidate.employeeDepartment)
    );
    const assets = this.list("assets").filter((asset) =>
      ["*", asset.type].includes(candidate.assetType)
      && ["*", asset.environment].includes(candidate.assetEnvironment)
    );
    const conflicts = this.list("policies").filter((policy) =>
      policy.effect !== candidate.effect
      && policy.actions.some((action) => candidate.actions.includes(action))
      && agents.some((agent) => ["*", agent.jobType, agent.role].includes(policy.employeeJobType) && ["*", agent.department].includes(policy.employeeDepartment))
      && assets.some((asset) => ["*", asset.type].includes(policy.assetType) && ["*", asset.environment].includes(policy.assetEnvironment))
    );
    return {
      candidate,
      matchedAgents: agents.map(({ id: agentId, name, jobType, department }) => ({ agentId, name, jobType, department })),
      matchedAssets: assets.map(({ id: assetId, name, type, environment, sensitivity }) => ({ assetId, name, type, environment, sensitivity })),
      affectedPermissionCount: agents.length * assets.length * actions.length,
      conflicts: conflicts.map(({ id: policyId, name, effect, actions: policyActions }) => ({ policyId, name, effect, actions: policyActions.filter((action) => actions.includes(action)) }))
    };
  }

  createAccessRequest(input = {}) {
    const agent = this.list("agents").find((item) => item.id === input.requesterAgentId);
    if (!agent) throw new Error("Agent not found");
    const asset = this.list("assets").find((item) => item.id === input.assetId);
    if (!asset) throw new Error("Asset not found");
    const action = required(input.action, "action").toLowerCase();
    if (!ACCESS_ACTIONS.includes(action)) throw new Error("Unknown access action");
    const timestamp = now();
    const request = {
      id: id("access"),
      requesterAgentId: agent.id,
      assetId: asset.id,
      action,
      reason: required(input.reason, "reason"),
      duration: input.duration?.trim() || "one task",
      grantType: input.grantType === "time_bound" ? "time_bound" : "once",
      durationMinutes: Number.isFinite(Number(input.durationMinutes)) ? Math.max(1, Number(input.durationMinutes)) : 60,
      risk: input.risk?.trim() || "medium",
      status: "pending",
      decisionReason: null,
      decidedBy: null,
      decidedAt: null,
      expiresAt: input.expiresAt || null,
      usesRemaining: null,
      consumedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.accessRequests.push(request);
      return state;
    });
    this.recordEvent("access.requested", { requestId: request.id, requesterAgentId: agent.id, assetId: asset.id, action });
    return request;
  }

  decideAccessRequest(requestId, input = {}) {
    const decision = input.decision === "approved" ? "approved" : input.decision === "rejected" ? "rejected" : null;
    if (!decision) throw new Error("decision must be approved or rejected");
    let updated;
    this.store.update((state) => {
      const request = state.accessRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("Access request not found");
      if (request.status !== "pending") throw new Error("Access request is already decided");
      Object.assign(request, {
        status: decision,
        decisionReason: input.reason?.trim() || "",
        decidedBy: input.decidedBy?.trim() || "Founder",
        decidedAt: now(),
        grantType: decision === "approved" && input.grantType === "time_bound" ? "time_bound" : request.grantType,
        usesRemaining: decision === "approved" && (input.grantType || request.grantType) !== "time_bound" ? 1 : null,
        expiresAt: decision === "approved" && (input.grantType || request.grantType) === "time_bound"
          ? new Date(Date.now() + (Number(input.durationMinutes || request.durationMinutes || 60) * 60_000)).toISOString()
          : request.expiresAt,
        updatedAt: now()
      });
      updated = request;
      return state;
    });
    this.recordEvent(`access.${decision}`, { requestId, decidedBy: updated.decidedBy });
    return updated;
  }

  consumeAccess(input = {}) {
    const agentId = required(input.agentId, "agentId");
    const assetId = required(input.assetId, "assetId");
    const action = required(input.action, "action").toLowerCase();
    const [entry] = this.effectiveAccess(agentId, assetId);
    const permission = entry.actions.find((item) => item.action === action);
    if (!permission || permission.effect !== "allowed") throw new Error("Access is not allowed");
    const persistentAllow = permission.sources.some((source) => source.type === "policy" && source.effect === "allow");
    const grant = persistentAllow ? null : permission.sources.find((source) => source.type === "temporary_grant");
    if (grant) {
      this.store.update((state) => {
        const request = state.accessRequests.find((item) => item.id === grant.id);
        if (request?.usesRemaining === 1) {
          request.usesRemaining = 0;
          request.status = "consumed";
          request.consumedAt = now();
          request.updatedAt = now();
        }
        return state;
      });
    }
    const event = this.recordEvent("access.used", { agentId, assetId, action, grantId: grant?.id || null });
    return { allowed: true, agentId, assetId, action, consumedGrantId: grant?.id || null, event };
  }

  effectiveAccess(agentId, assetId = null) {
    const agent = this.list("agents").find((item) => item.id === agentId);
    if (!agent) throw new Error("Agent not found");
    const assets = this.list("assets").filter((asset) => !assetId || asset.id === assetId);
    if (assetId && !assets.length) throw new Error("Asset not found");
    const policies = this.list("policies");
    const approvedRequests = this.list("accessRequests").filter((request) =>
      request.requesterAgentId === agentId
      && request.status === "approved"
      && request.usesRemaining !== 0
      && (!request.expiresAt || new Date(request.expiresAt).getTime() > Date.now())
    );
    return accessForAgent(agent, assets, policies, approvedRequests);
  }

  latestTasksForGoal(goalId) {
    const tasks = this.list("tasks").filter((task) => task.goalId === goalId);
    if (!tasks.length) return [];
    const latestCycle = Math.max(...tasks.map((task) => task.planCycle || 1));
    return tasks.filter((task) => (task.planCycle || 1) === latestCycle);
  }

  planGoal(goalId, { force = false } = {}) {
    const goal = this.getGoal(goalId);
    const existing = this.list("tasks").filter((task) => task.goalId === goalId);
    if (existing.length && !force) return this.latestTasksForGoal(goalId);

    const cycle = existing.length
      ? Math.max(...existing.map((task) => task.planCycle || 1)) + 1
      : 1;
    const templates = [
      {
        capability: "research",
        title: "Analyze goal scope and constraints",
        toolName: "goal.analyze",
        acceptanceCriteria: ["The objective is explicit", "Constraints and external actions are identified"]
      },
      {
        capability: "design",
        title: "Design an executable workflow",
        toolName: "solution.design",
        acceptanceCriteria: ["Agents and tools are mapped to the goal", "The next execution boundary is clear"]
      },
      {
        capability: "build",
        title: "Inspect the smallest testable version",
        toolName: "mvp.inspect",
        acceptanceCriteria: ["The local execution surface is checked", "Available tools and limitations are recorded"]
      },
      {
        capability: "validate",
        title: "Validate the workflow and evidence",
        toolName: "workflow.validate",
        acceptanceCriteria: ["Required fields and dependencies pass validation", "Unverified work is explicitly reported"]
      },
      {
        capability: "iterate",
        title: "Record next iteration decisions",
        toolName: "iteration.record",
        acceptanceCriteria: ["Learnings are saved to memory", "The next practical step is stated"]
      }
    ];
    const agents = this.list("agents");
    const created = templates.map((template, index) => {
      const assigned = agents.find((agent) =>
        agent.capabilities.some((item) => item.toLowerCase() === template.capability)
      ) ?? agents.find((agent) => agent.role === "coo") ?? agents[0];
      const timestamp = now();
      return {
        id: id("task"),
        goalId,
        planCycle: cycle,
        title: template.title,
        description: `${template.title} for goal: ${goal.title}. ${goal.description}`.trim(),
        status: "pending",
        priority: Math.max(1, goal.priority + index),
        assignedAgentId: assigned?.id ?? null,
        dependsOn: [],
        toolName: template.toolName,
        executor: template.toolName,
        input: { goalId },
        acceptanceCriteria: template.acceptanceCriteria,
        evidence: [],
        attempts: 0,
        output: null,
        error: null,
        blockedReason: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });
    for (let index = 1; index < created.length; index += 1) {
      created[index].dependsOn = [created[index - 1].id];
    }
    this.store.update((state) => {
      state.tasks.push(...created);
      const currentGoal = state.goals.find((item) => item.id === goalId);
      if (currentGoal) {
        currentGoal.executionStatus = "in_progress";
        currentGoal.updatedAt = now();
      }
      return state;
    });
    this.recordEvent("goal.planned", { goalId, cycle, taskIds: created.map((task) => task.id) });
    return created;
  }

  replanGoal(goalId) {
    return this.planGoal(goalId, { force: true });
  }

  createTask(input = {}) {
    const timestamp = now();
    const task = {
      id: id("task"),
      goalId: input.goalId || null,
      planCycle: Number.isFinite(input.planCycle) ? input.planCycle : 1,
      title: required(input.title, "title"),
      description: input.description?.trim() || "",
      status: "pending",
      priority: Number.isFinite(input.priority) ? input.priority : 3,
      assignedAgentId: input.assignedAgentId || null,
      dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn : [],
      toolName: input.toolName || null,
      executor: input.toolName || null,
      input: input.input ?? {},
      acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : [],
      evidence: [],
      attempts: 0,
      output: null,
      error: null,
      blockedReason: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.tasks.push(task);
      return state;
    });
    this.recordEvent("task.created", { taskId: task.id, goalId: task.goalId });
    return task;
  }

  searchMemories(query = "") {
    const normalized = query.trim().toLowerCase();
    return this.list("memories").filter((memory) => {
      if (!normalized) return true;
      return [memory.content, memory.scope, ...(memory.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }

  writeMemory(input = {}) {
    const memory = {
      id: id("memory"),
      scope: input.scope?.trim() || "organization",
      content: required(input.content, "content"),
      tags: Array.isArray(input.tags) ? input.tags : [],
      source: input.source?.trim() || "manual",
      createdAt: now()
    };
    this.store.update((state) => {
      state.memories.push(memory);
      return state;
    });
    this.recordEvent("memory.created", { memoryId: memory.id, scope: memory.scope });
    return memory;
  }

  syncGoalStatus(state, goalId) {
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) return;
    const tasks = state.tasks.filter((task) => task.goalId === goalId);
    const latestCycle = tasks.length ? Math.max(...tasks.map((task) => task.planCycle || 1)) : 0;
    const latest = tasks.filter((task) => (task.planCycle || 1) === latestCycle);
    if (!latest.length) goal.executionStatus = "not_started";
    else if (latest.some((task) => ["blocked", "failed"].includes(task.status))) goal.executionStatus = "blocked";
    else if (latest.every((task) => task.status === "completed")) goal.executionStatus = "awaiting_review";
    else goal.executionStatus = "in_progress";
    goal.updatedAt = now();
  }

  updateTask(taskId, patch) {
    let updated;
    this.store.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("Task not found");
      Object.assign(task, patch, { updatedAt: now() });
      this.syncGoalStatus(state, task.goalId);
      updated = task;
      return state;
    });
    return updated;
  }

  summarizeGoal(goalId) {
    const goal = this.getGoal(goalId);
    const tasks = this.latestTasksForGoal(goalId);
    const counts = taskCounts(tasks);
    const evidence = tasks.flatMap((task) => task.evidence || []);
    const total = tasks.length;
    const completed = counts.completed || 0;
    return {
      ...goal,
      progress: {
        total,
        completed,
        percent: total ? Math.round((completed / total) * 100) : 0,
        counts
      },
      tasks,
      evidence,
      nextAction: goal.executionStatus === "awaiting_review"
        ? "Review the evidence and approve the next external action."
        : goal.executionStatus === "blocked"
          ? "Resolve the blocked task before continuing."
          : "Let the scheduler continue executing ready tasks."
    };
  }

  async executeTask(taskId) {
    const task = this.getTask(taskId);
    const state = this.store.read();
    const blockedDependency = task.dependsOn.find((dependencyId) => {
      const dependency = state.tasks.find((item) => item.id === dependencyId);
      return !dependency || dependency.status !== "completed";
    });
    if (blockedDependency) {
      this.updateTask(taskId, {
        status: "blocked",
        blockedReason: `Dependency ${blockedDependency} is not completed.`
      });
      throw new Error("Task dependencies are not completed");
    }
    if (!task.toolName) {
      this.updateTask(taskId, {
        status: "blocked",
        blockedReason: "No executor is configured for this task."
      });
      throw new Error("Task has no executor configured");
    }

    this.updateTask(taskId, {
      status: "running",
      attempts: (task.attempts || 0) + 1,
      executor: task.toolName,
      error: null,
      blockedReason: null
    });
    try {
      const output = await this.tools.execute(task.toolName, task.input, { task, organization: this });
      const evidence = Array.isArray(output?.evidence) ? output.evidence : [];
      if (!evidence.length) throw new Error("Executor returned no evidence");
      const result = this.updateTask(taskId, { status: "completed", output, evidence, error: null });
      this.recordEvent("task.completed", { taskId, evidenceCount: evidence.length });
      return result;
    } catch (error) {
      const failed = this.updateTask(taskId, { status: "failed", error: error.message });
      this.recordEvent("task.failed", { taskId, error: error.message });
      throw Object.assign(error, { task: failed });
    }
  }
}

export class Scheduler {
  constructor(organization, intervalMs = 1000) {
    this.organization = organization;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.running = new Set();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    const tasks = this.organization.list("tasks")
      .filter((task) => task.status === "pending")
      .sort((a, b) => a.priority - b.priority);
    for (const task of tasks) {
      if (this.running.has(task.id)) continue;
      const state = this.organization.list("tasks");
      const ready = task.dependsOn.every((dependencyId) =>
        state.some((dependency) => dependency.id === dependencyId && dependency.status === "completed")
      );
      if (!ready) continue;
      this.running.add(task.id);
      this.organization.executeTask(task.id)
        .catch(() => {})
        .finally(() => this.running.delete(task.id));
    }
  }
}
