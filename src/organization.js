import crypto from "node:crypto";
import net from "node:net";
import { recommendExternalRoute } from "./external-readiness.js";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
const ACCESS_ACTIONS = ["read", "create", "modify", "execute", "share", "send", "publish", "approve", "delete", "grant", "spend"];
export const WORK_TYPES = {
  review: {
    label: "Quality review", capability: "validate", preferredJobTypes: ["quality_reviewer", "technical_lead", "ai_ceo"], requiredExecutor: "Review executor"
  },
  general: {
    label: "General work",
    capability: "iterate",
    preferredJobTypes: ["ai_ceo", "project_manager", "operations_lead"],
    requiredExecutor: "General-purpose agent executor"
  },
  product_strategy: {
    label: "Product strategy",
    capability: "design",
    preferredJobTypes: ["product_manager", "ai_ceo"],
    requiredExecutor: "Product planning executor"
  },
  research: {
    label: "Research and analysis",
    capability: "research",
    preferredJobTypes: ["product_manager", "ai_ceo", "operations_lead"],
    requiredExecutor: "Research executor"
  },
  design: {
    label: "Design",
    capability: "design",
    preferredJobTypes: ["product_designer", "product_manager"],
    requiredExecutor: "Design executor"
  },
  software_development: {
    label: "Software development",
    capability: "build",
    preferredJobTypes: ["software_engineer", "technical_lead", "prototype_builder"],
    requiredExecutor: "code.codex"
  },
  content_marketing: {
    label: "Content and marketing",
    capability: "design",
    preferredJobTypes: ["operations_lead", "product_manager", "ai_ceo"],
    requiredExecutor: "Content and publishing executor"
  },
  sales: {
    label: "Sales",
    capability: "research",
    preferredJobTypes: ["operations_lead", "ai_ceo"],
    requiredExecutor: "Sales and CRM executor"
  },
  operations: {
    label: "Operations",
    capability: "iterate",
    preferredJobTypes: ["project_manager", "operations_lead", "ai_ceo"],
    requiredExecutor: "Operations executor"
  }
};

function classifyWorkType(value = "") {
  const text = ` ${String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  const rules = [
    ["software_development", ["code", "coding", "software", "developer", "website", "application", "frontend", "backend", "api", "database", "repository", "bug", "login", "test"]],
    ["design", ["design", "ui", "ux", "wireframe", "interface", "brand", "visual", "prototype"]],
    ["research", ["research", "analyse", "analyze", "analysis", "market", "competitor", "investigate", "study"]],
    ["sales", ["sales", "lead", "prospect", "customer", "crm", "pipeline"]],
    ["content_marketing", ["content", "article", "campaign", "marketing", "launch", "social", "copywriting"]],
    ["product_strategy", ["product", "feature", "roadmap", "requirement", "user story", "positioning"]],
    ["operations", ["operation", "operations", "process", "workflow", "schedule", "coordinate", "finance", "budget"]]
  ];
  return rules.find(([, keywords]) => keywords.some((keyword) => text.includes(` ${keyword} `)))?.[0] || "general";
}

function required(value, name) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function publicResultUrl(value, name = "public URL") {
  let url;
  try { url = new URL(required(value, name)); } catch { throw new Error(`${name} must be a valid URL`); }
  const host = url.hostname.toLowerCase();
  const privateLiteral = (() => {
    const normalized = host.replace(/^\[|\]$/g, "");
    if (net.isIPv4(normalized)) {
      const [a, b] = normalized.split(".").map(Number);
      return a === 0 || a === 10 || a === 127 || a >= 224
        || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
        || (a === 198 && [18, 19].includes(b));
    }
    return net.isIPv6(normalized) && (normalized === "::" || normalized === "::1" || /^(?:fc|fd|fe8|fe9|fea|feb)/.test(normalized));
  })();
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || host === "localhost" || host.endsWith(".local") || privateLiteral) {
    throw new Error(`${name} must use public HTTPS without credentials or a custom port`);
  }
  return url.toString();
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
      workspacePath: input.type === "source_code" && typeof input.workspacePath === "string"
        ? input.workspacePath.trim() || null
        : null,
      integrationTestCommand: input.type === "source_code" && Array.isArray(input.integrationTestCommand)
        ? input.integrationTestCommand.map((part) => String(part)).slice(0, 4)
        : null,
      integrationBaseRef: input.type === "source_code" && typeof input.integrationBaseRef === "string"
        ? input.integrationBaseRef.trim() || "main"
        : input.type === "source_code" ? "main" : null,
      connectorType: input.type === "external_connector" && typeof input.connectorType === "string" ? input.connectorType.trim() : null,
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
    const [entry] = this.effectiveAccess(agentId, assetId, { externalActionId: input.externalActionId || null });
    const permission = entry.actions.find((item) => item.action === action);
    if (!permission || permission.effect !== "allowed") throw new Error("Access is not allowed");
    const persistentAllow = permission.sources.some((source) => source.type === "policy" && source.effect === "allow");
    const grant = persistentAllow ? null : input.grantId
      ? permission.sources.find((source) => source.type === "temporary_grant" && source.id === input.grantId)
      : permission.sources.find((source) => source.type === "temporary_grant");
    if (input.grantId && !grant) throw new Error("Approved grant is no longer available");
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
    const event = this.recordEvent("access.used", { agentId, assetId, action, taskId: input.taskId || null, toolName: input.toolName || null, grantId: grant?.id || null });
    return { allowed: true, agentId, assetId, action, consumedGrantId: grant?.id || null, event };
  }

  effectiveAccess(agentId, assetId = null, context = {}) {
    const agent = this.list("agents").find((item) => item.id === agentId);
    if (!agent) throw new Error("Agent not found");
    const assets = this.list("assets").filter((asset) => !assetId || asset.id === assetId);
    if (assetId && !assets.length) throw new Error("Asset not found");
    const policies = this.list("policies");
    const approvedRequests = this.list("accessRequests").filter((request) =>
      request.requesterAgentId === agentId
      && request.status === "approved"
      && request.usesRemaining !== 0
      && (!request.externalActionId || request.externalActionId === context.externalActionId)
      && (!request.expiresAt || new Date(request.expiresAt).getTime() > Date.now())
    );
    return accessForAgent(agent, assets, policies, approvedRequests);
  }

  authorizedAssetCatalog(agentId, query = "") {
    const normalized = String(query || "").trim().toLowerCase();
    return this.effectiveAccess(agentId).flatMap(({ asset, actions }) => {
      const allowedActions = actions.filter((item) => item.effect === "allowed").map((item) => item.action);
      const requestableActions = actions.filter((item) => item.effect === "approval_required").map((item) => item.action);
      if (!allowedActions.length && !requestableActions.length) return [];
      const searchable = [asset.name, asset.type, asset.owner, asset.environment, asset.description].join(" ").toLowerCase();
      if (normalized && !searchable.includes(normalized)) return [];
      return [{
        id: asset.id,
        name: asset.name,
        type: asset.type,
        owner: asset.owner,
        sensitivity: asset.sensitivity,
        environment: asset.environment,
        externalImpact: asset.externalImpact,
        allowedActions,
        requestableActions
      }];
    });
  }

  authorizeToolCall(input = {}) {
    const decision = {
      agentId: input.agentId || null,
      taskId: input.taskId || null,
      assetId: input.assetId || null,
      action: String(input.action || "").toLowerCase(),
      toolName: input.toolName || null,
      grantId: input.grantId || null,
      externalActionId: null
    };
    let reason = null;
    const agent = this.list("agents").find((item) => item.id === decision.agentId);
    const task = this.list("tasks").find((item) => item.id === decision.taskId);
    const asset = this.list("assets").find((item) => item.id === decision.assetId);
    if (!agent) reason = "Unknown employee identity";
    else if (!task) reason = "Unknown task context";
    else if (!asset) reason = "Unknown or undiscoverable asset";
    else if (task.assignedAgentId !== agent.id) reason = "Task is assigned to another employee";
    else if (!["pending", "running"].includes(task.status)) reason = "Task is not active";
    else if (task.accessExpiresAt && new Date(task.accessExpiresAt).getTime() <= Date.now()) reason = "Task capability expired";
    else {
      const scoped = (task.accessScope || []).find((item) => item.assetId === asset.id && Array.isArray(item.actions) && item.actions.includes(decision.action));
      if (!scoped) reason = "Action is outside the task capability";
      else {
        decision.externalActionId = task.externalActionId || null;
        const [entry] = this.effectiveAccess(agent.id, asset.id, { externalActionId: decision.externalActionId });
        const permission = entry.actions.find((item) => item.action === decision.action);
        const persistentAllow = permission?.sources.some((source) => source.type === "policy" && source.effect === "allow");
        const eligibleGrant = permission?.sources.find((source) => {
          if (source.type !== "temporary_grant" || (decision.grantId && source.id !== decision.grantId)) return false;
          const request = this.list("accessRequests").find((item) => item.id === source.id);
          return request && (!request.externalActionId || request.externalActionId === task.externalActionId);
        });
        if (permission?.effect !== "allowed" || (!persistentAllow && !eligibleGrant)) {
          reason = permission?.effect === "denied" ? "Access policy denied the action" : "Additional approval is required";
        } else decision.grantId = persistentAllow ? null : eligibleGrant?.id || null;
      }
    }
    if (reason) {
      this.recordEvent("access.denied", { ...decision, reason });
      throw new Error("Tool authorization denied");
    }
    return { allowed: true, ...decision };
  }

  completeAuthorizedToolCall(decision) {
    const result = this.consumeAccess(decision);
    this.recordEvent("tool.authorized", decision);
    return result;
  }

  latestTasksForGoal(goalId) {
    const tasks = this.list("tasks").filter((task) => task.goalId === goalId);
    if (!tasks.length) return [];
    const latestCycle = Math.max(...tasks.map((task) => task.planCycle || 1));
    return tasks.filter((task) => (task.planCycle || 1) === latestCycle);
  }

  planGoal(goalId, { force = false } = {}) {
    if (this.getGoal(goalId).planningTaskId) throw new Error("This goal uses the CEO planning workflow");
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
        accessScope: [],
        accessExpiresAt: null,
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
    if (input.goalId) this.getGoal(input.goalId);
    if (input.assignedAgentId && !this.list("agents").some((agent) => agent.id === input.assignedAgentId)) throw new Error("Assigned employee not found");
    const accessExpiresAt = input.accessExpiresAt || null;
    if (accessExpiresAt && Number.isNaN(new Date(accessExpiresAt).getTime())) throw new Error("accessExpiresAt must be a valid timestamp");
    const accessScope = Array.isArray(input.accessScope) ? input.accessScope.map((entry) => {
      const assetId = required(entry.assetId, "accessScope.assetId");
      if (!this.list("assets").some((asset) => asset.id === assetId)) throw new Error("Access scope asset not found");
      const actions = Array.isArray(entry.actions) ? [...new Set(entry.actions.map((action) => String(action).toLowerCase()).filter((action) => ACCESS_ACTIONS.includes(action)))] : [];
      if (!actions.length) throw new Error("accessScope.actions are required");
      return { assetId, actions };
    }) : [];
    const task = {
      id: id("task"),
      goalId: input.goalId || null,
      projectId: input.projectId || null,
      taskKind: input.taskKind || "work",
      planId: input.planId || null,
      executionMode: input.executionMode || null,
      reviewTargetTaskId: input.reviewTargetTaskId || null,
      reviewRound: Number.isFinite(input.reviewRound) ? input.reviewRound : 0,
      autoRevisionCount: Number.isFinite(input.autoRevisionCount) ? input.autoRevisionCount : 0,
      autoRetryCount: Number.isFinite(input.autoRetryCount) ? input.autoRetryCount : 0,
      founderReviewRequired: Boolean(input.founderReviewRequired),
      nextAttemptAt: input.nextAttemptAt || null,
      planCycle: Number.isFinite(input.planCycle) ? input.planCycle : 1,
      title: required(input.title, "title"),
      description: input.description?.trim() || "",
      status: ["planned", "blocked"].includes(input.status) ? input.status : "pending",
      priority: Number.isFinite(input.priority) ? input.priority : 3,
      assignedAgentId: input.assignedAgentId || null,
      dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn : [],
      toolName: input.toolName || null,
      executor: input.toolName || null,
      input: input.input ?? {},
      accessScope,
      accessExpiresAt,
      acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : [],
      requestSource: input.requestSource || null,
      workType: input.workType || null,
      deliverable: input.deliverable?.trim() || "",
      context: input.context?.trim() || "",
      routing: input.routing || null,
      nextAction: input.nextAction?.trim() || null,
      messages: [],
      executionHistory: [],
      evidence: [],
      attempts: 0,
      output: null,
      error: null,
      blockedReason: input.blockedReason?.trim() || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.tasks.push(task);
      this.syncGoalStatus(state, task.goalId);
      return state;
    });
    this.recordEvent("task.created", { taskId: task.id, goalId: task.goalId });
    return task;
  }

  createCodingTask(input = {}) {
    const agent = this.list("agents").find((item) => item.id === input.assignedAgentId);
    if (!agent) throw new Error("Assigned employee not found");
    if (!agent.capabilities.some((capability) => capability.toLowerCase() === "build")) {
      throw new Error("Assigned employee does not have the build capability");
    }
    const asset = this.list("assets").find((item) => item.id === input.assetId);
    if (!asset || asset.type !== "source_code") throw new Error("Source-code asset not found");
    if (!asset.workspacePath) throw new Error("Source-code asset has no local workspace configured");
    const instructions = required(input.instructions, "instructions");
    return this.createTask({
      goalId: input.goalId || null,
      title: input.title?.trim() || `Implement: ${instructions.slice(0, 80)}`,
      description: input.description?.trim() || instructions,
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 3,
      assignedAgentId: agent.id,
      toolName: "code.codex",
      requestSource: input.requestSource || "direct_coding_task",
      workType: input.workType || "software_development",
      deliverable: input.deliverable || "A focused, tested code change",
      context: input.context || "",
      routing: input.routing || {
        mode: input.assignedAgentId ? "manual" : "automatic",
        requiredCapability: "build",
        requiredExecutor: "code.codex",
        executorStatus: "connected"
      },
      input: { assetId: asset.id, instructions },
      accessScope: [{ assetId: asset.id, actions: ["read", "modify", "execute"] }],
      accessExpiresAt: input.accessExpiresAt || new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
      acceptanceCriteria: Array.isArray(input.acceptanceCriteria) && input.acceptanceCriteria.length
        ? input.acceptanceCriteria.map((item) => String(item).trim()).filter(Boolean)
        : ["The requested change is implemented", "Relevant local tests pass", "Changed files and remaining limitations are reported"]
    });
  }

  createWorkRequest(input = {}, options = {}) {
    if (input.goalId && this.getGoal(input.goalId).approvedPlanId) throw new Error("This goal has an approved plan. Create independent work or a new goal for a scope change.");
    const instructions = required(input.instructions, "instructions");
    const requestedType = input.workType?.trim() || "auto";
    if (requestedType !== "auto" && !WORK_TYPES[requestedType]) throw new Error("Unknown work type");
    const workType = requestedType === "auto"
      ? classifyWorkType([input.title, instructions, input.deliverable, input.context].filter(Boolean).join(" "))
      : requestedType;
    const definition = WORK_TYPES[workType];
    const agents = this.list("agents");
    let agent = input.assignedAgentId ? agents.find((item) => item.id === input.assignedAgentId) : null;
    if (input.assignedAgentId && !agent) throw new Error("Assigned employee not found");
    if (!agent) {
      agent = definition.preferredJobTypes.map((jobType) => agents.find((item) => item.jobType === jobType && item.capabilities.includes(definition.capability))).find(Boolean)
        || agents.find((item) => item.capabilities.includes(definition.capability));
    }
    if (!agent) throw new Error("No employee is available to receive this work request");
    if (!agent.capabilities.includes(definition.capability)) throw new Error(`Assigned employee requires ${definition.capability} capability`);

    const routing = {
      mode: input.assignedAgentId ? "manual" : "automatic",
      requestedType,
      classifiedType: workType,
      typeLabel: definition.label,
      requiredCapability: definition.capability,
      requiredExecutor: definition.requiredExecutor,
      executorStatus: "not_connected"
    };
    const base = {
      goalId: input.goalId || null,
      title: input.title?.trim() || instructions.slice(0, 80),
      description: instructions,
      instructions,
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 3,
      assignedAgentId: agent.id,
      acceptanceCriteria: Array.isArray(input.acceptanceCriteria) ? input.acceptanceCriteria : [],
      requestSource: "founder_work_request",
      workType,
      deliverable: input.deliverable || "",
      context: input.context || "",
      routing
    };

    if (workType === "software_development") {
      const repositories = this.list("assets").filter((asset) => asset.type === "source_code" && asset.workspacePath);
      const asset = input.assetId
        ? repositories.find((item) => item.id === input.assetId)
        : repositories.length === 1 ? repositories[0] : null;
      const canExecute = Boolean(options.codexAvailable && asset);
      if (canExecute) {
        const task = this.createCodingTask({ ...base, assetId: asset.id, routing: { ...routing, executorStatus: "connected" } });
        this.recordEvent("work_request.routed", { taskId: task.id, workType, assignedAgentId: agent.id, executor: "code.codex" });
        return task;
      }
      const nextAction = asset
        ? "Connect and authenticate the Codex runtime before starting execution."
        : "Select a protected source-code asset before starting execution.";
      const task = this.createTask({
        ...base,
        status: "blocked",
        routing: { ...routing, executorStatus: asset ? "unavailable" : "needs_input" },
        blockedReason: nextAction,
        nextAction
      });
      this.recordEvent("work_request.routed", { taskId: task.id, workType, assignedAgentId: agent.id, executor: null });
      return task;
    }

    const execution = this.generalTaskBinding(options);
    const task = this.createTask({
      ...base,
      ...execution,
      routing: { ...routing, requiredExecutor: "agent.general", executorStatus: execution.toolName ? "connected" : "unavailable" }
    });
    this.recordEvent("work_request.routed", { taskId: task.id, workType, assignedAgentId: agent.id, executor: task.toolName });
    return task;
  }

  generalTaskBinding(options = {}) {
    const asset = this.list("assets").find((item) => item.type === "agent_runtime" && item.tags?.includes("general-executor"));
    const connected = Boolean(options.generalAvailable && asset && this.tools.list().some((tool) => tool.name === "agent.general"));
    const nextAction = connected ? null : "Connect the General Agent runtime and its protected service asset, then retry.";
    return { status: connected ? "pending" : "blocked", toolName: connected ? "agent.general" : null,
      input: asset ? { assetId: asset.id } : {},
      accessScope: asset ? [{ assetId: asset.id, actions: ["execute"] }] : [],
      accessExpiresAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
      nextAction, blockedReason: nextAction };
  }

  resumeGeneralTask(taskId, input = {}, options = {}) {
    const task = this.getTask(taskId);
    if (task.executionMode === "external") throw new Error("External work requires an approved connector; document retry cannot perform it");
    const controlledPlanDocument = Boolean(task.planId && task.taskKind === "work" && task.executionMode === "document"
      && this.getGoal(task.goalId).autonomyPolicy?.mode === "controlled");
    if (task.workType === "software_development" || (task.requestSource !== "founder_work_request" && !controlledPlanDocument)) {
      throw new Error("Only general work requests and controlled plan documents support this action");
    }
    if (!["blocked", "failed", "needs_input", "awaiting_review"].includes(task.status)) throw new Error("Task is not waiting for feedback or retry");
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (["needs_input", "awaiting_review"].includes(task.status) && !message) throw new Error("Feedback message is required");
    if (message.length > 20_000) throw new Error("Feedback is too long");
    const binding = this.generalTaskBinding(options);
    if (!binding.toolName) throw new Error(binding.nextAction);
    this.workflow?.supersedeBlockedReview(task.id);
    const previous = { attempt: task.attempts, status: task.status, output: task.output, evidence: task.evidence, error: task.error, endedAt: now() };
    const updated = this.updateTask(task.id, { ...binding, executor: binding.toolName, error: null, evidence: [],
      messages: [...(task.messages || []), ...(message ? [{ role: "founder", content: message, createdAt: now() }] : [])],
      executionHistory: [...(task.executionHistory || []), previous],
      routing: { ...task.routing, requiredExecutor: "agent.general", executorStatus: "connected" } });
    this.recordEvent("task.feedback", { taskId, hasMessage: Boolean(message) });
    return updated;
  }

  acceptTask(taskId) {
    const task = this.getTask(taskId);
    if (task.taskKind === "goal_planning") throw new Error("Use the goal plan approval action");
    const codeDelivery = task.toolName === "code.codex" && task.output;
    const externalDelivery = task.executionMode === "external" && this.list("externalActions").some((action) => action.id === task.externalActionId && action.status === "completed");
    if (codeDelivery && (!task.output.worktreeId || !task.input?.assetId)) throw new Error("Code delivery is missing its isolated worktree evidence");
    if (task.status !== "awaiting_review" || (!codeDelivery && !externalDelivery && (task.output?.outcome !== "delivered" || !task.output.artifacts?.length)) || !task.evidence?.length) {
      throw new Error("Task requires a delivered artifact before acceptance");
    }
    this.workflow?.supersedeBlockedReview(task.id);
    const updated = this.updateTask(taskId, { status: "completed", nextAction: null, acceptedAt: now() });
    this.recordEvent("task.accepted", { taskId, decidedBy: "Founder", evidenceCount: task.evidence.length });
    if (codeDelivery) this.requestCodeIntegration(taskId);
    if (task.planId) this.workflow?.queueFinalReport(task.goalId);
    return updated;
  }

  requestCodeIntegration(taskId) {
    const task = this.getTask(taskId);
    if (task.toolName !== "code.codex" || task.status !== "completed" || !task.output?.worktreeId || !task.input?.assetId) {
      throw new Error("Only an accepted code delivery can request integration");
    }
    const current = this.list("integrationRequests").find((item) => item.taskId === taskId && ["pending", "executing", "completed"].includes(item.status));
    if (current) return current;
    const request = { id: id("integration"), taskId, goalId: task.goalId, projectId: task.projectId, assetId: task.input.assetId,
      requestedByAgentId: task.assignedAgentId, targetBranch: "codex/integration", changedFiles: task.output.changedFiles || [],
      status: "pending", risk: "high", createdAt: now(), updatedAt: now(), result: null, error: null };
    this.store.update((state) => {
      state.integrationRequests.push(request);
      const storedTask = state.tasks.find((item) => item.id === taskId);
      Object.assign(storedTask, { integrationStatus: "awaiting_founder_approval", integrationRequestId: request.id,
        nextAction: "Founder approval is required before applying this delivery to codex/integration.", updatedAt: now() });
      state.events.push({ id: id("event"), type: "code.integration_requested", createdAt: now(), payload: { requestId: request.id, taskId, targetBranch: request.targetBranch } });
      return state;
    });
    return request;
  }

  async decideCodeIntegration(requestId, input = {}, executor) {
    const request = this.list("integrationRequests").find((item) => item.id === requestId);
    if (!request) throw new Error("Integration request not found");
    if (request.status !== "pending") throw new Error("Integration request is already decided");
    if (!executor) throw new Error("Code integration executor is unavailable");
    const decision = input.decision;
    const reason = required(input.reason, "decision reason");
    if (!["approved", "rejected"].includes(decision)) throw new Error("Decision must be approved or rejected");
    if (decision === "rejected") {
      this.store.update((state) => {
        const current = state.integrationRequests.find((item) => item.id === requestId);
        Object.assign(current, { status: "rejected", decidedBy: "Founder", decisionReason: reason, updatedAt: now() });
        const task = state.tasks.find((item) => item.id === request.taskId);
        Object.assign(task, { integrationStatus: "rejected", nextAction: "The code delivery remains isolated. Revise it or create a new integration request.", updatedAt: now() });
        state.events.push({ id: id("event"), type: "code.integration_rejected", createdAt: now(), payload: { requestId, taskId: request.taskId, reason } });
        return state;
      });
      return this.list("integrationRequests").find((item) => item.id === requestId);
    }
    this.store.update((state) => {
      const current = state.integrationRequests.find((item) => item.id === requestId);
      Object.assign(current, { status: "executing", decidedBy: "Founder", decisionReason: reason, updatedAt: now() });
      return state;
    });
    const task = this.getTask(request.taskId);
    const asset = this.list("assets").find((item) => item.id === request.assetId);
    try {
      const result = await executor.execute({ task, asset });
      this.store.update((state) => {
        const current = state.integrationRequests.find((item) => item.id === requestId);
        Object.assign(current, { status: "completed", result, updatedAt: now() });
        const storedTask = state.tasks.find((item) => item.id === request.taskId);
        Object.assign(storedTask, { integrationStatus: "integrated", integration: result, nextAction: null, updatedAt: now() });
        state.events.push({ id: id("event"), type: "code.integrated", createdAt: now(), payload: { requestId, taskId: request.taskId,
          branch: result.branch, integrationCommit: result.integrationCommit, testStatus: result.test.status } });
        return state;
      });
      if (task.planId) this.workflow?.queueFinalReport(task.goalId);
      return this.list("integrationRequests").find((item) => item.id === requestId);
    } catch (error) {
      this.store.update((state) => {
        const current = state.integrationRequests.find((item) => item.id === requestId);
        Object.assign(current, { status: "failed", error: error.message, updatedAt: now() });
        const storedTask = state.tasks.find((item) => item.id === request.taskId);
        Object.assign(storedTask, { integrationStatus: "failed", nextAction: "Integration failed safely. Review the conflict or test error before retrying.", updatedAt: now() });
        state.events.push({ id: id("event"), type: "code.integration_failed", createdAt: now(), payload: { requestId, taskId: request.taskId, error: error.message } });
        return state;
      });
      throw error;
    }
  }

  prepareReadyExternalTasks() {
    const snapshot = this.store.read();
    const candidates = snapshot.tasks.flatMap((task) => {
      if (task.executionMode !== "external" || !["blocked", "failed"].includes(task.status)) return [];
      if (task.externalReadiness?.provider) return [];
      const waiting = (task.dependsOn || []).some((dependencyId) => {
        const dependency = snapshot.tasks.find((item) => item.id === dependencyId);
        return !dependency || dependency.status !== "completed"
          || (dependency.toolName === "code.codex" && dependency.integrationStatus !== "integrated");
      });
      if (waiting) return [];
      if (snapshot.founderActions.some((item) => item.taskId === task.id && ["pending", "completed"].includes(item.status))) return [];
      if (snapshot.externalActions.some((item) => item.taskId === task.id && ["pending", "executing", "completed", "uncertain"].includes(item.status))) return [];
      const priorSetup = snapshot.founderActions.find((item) => item.goalId === task.goalId && item.status === "completed"
        && item.actionType === "external_account_setup");
      if (priorSetup && /\b(validate|verify|result|sale|revenue|outcome|performance)\b/i.test(`${task.title} ${task.description}`)) {
        return [{ task, inheritedSetup: priorSetup }];
      }
      const related = snapshot.tasks.filter((item) => item.goalId === task.goalId && item.taskKind === "work" && item.status === "completed");
      const recommendation = recommendExternalRoute(task, related);
      return recommendation ? [{ task, recommendation }] : [];
    });
    const created = [];
    for (const { task, recommendation, inheritedSetup } of candidates) {
      if (inheritedSetup) {
        this.store.update((state) => {
          const storedTask = state.tasks.find((item) => item.id === task.id);
          Object.assign(storedTask, { founderActionId: inheritedSetup.id, externalIntent: "outcome_verification",
            externalReadiness: { provider: inheritedSetup.recommendation.provider,
              publicAccountUrl: inheritedSetup.completion.publicAccountUrl, connectorReady: false, confirmedAt: inheritedSetup.completedAt },
            blockedReason: "The existing provider account is ready, but verified sales or outcome retrieval requires a scoped reporting adapter.",
            nextAction: "Connect a read-only provider reporting adapter. A public product page or Founder statement alone is not proof of a sale.",
            updatedAt: now() });
          state.events.push({ id: id("event"), type: "external.account_reused", createdAt: now(), payload: {
            founderActionId: inheritedSetup.id, taskId: task.id, provider: inheritedSetup.recommendation.provider,
            purpose: "outcome_verification"
          } });
          this.syncGoalStatus(state, storedTask.goalId);
          return state;
        });
        continue;
      }
      const timestamp = now();
      const action = {
        id: id("founder_action"), taskId: task.id, goalId: task.goalId, projectId: task.projectId,
        actionType: "external_account_setup", owner: "Founder", status: "pending",
        title: `Register and verify ${recommendation.provider}`, recommendation, completion: null,
        createdAt: timestamp, updatedAt: timestamp
      };
      let inserted = false;
      this.store.update((state) => {
        if (state.founderActions.some((item) => item.taskId === task.id && ["pending", "completed"].includes(item.status))) return state;
        state.founderActions.push(action);
        const storedTask = state.tasks.find((item) => item.id === task.id);
        if (storedTask) Object.assign(storedTask, {
          founderActionId: action.id,
          externalIntent: recommendation.connectorType,
          blockedReason: `Founder account registration and verification are required for ${recommendation.provider}.`,
          nextAction: `Complete the limited Founder setup checklist for ${recommendation.provider}; the AI organization retains channel analysis and publication preparation.`,
          updatedAt: now()
        });
        state.events.push({ id: id("event"), type: "founder.action_requested", createdAt: now(), payload: {
          founderActionId: action.id, taskId: task.id, actionType: action.actionType,
          provider: recommendation.provider, connectorType: recommendation.connectorType
        } });
        this.syncGoalStatus(state, storedTask?.goalId);
        inserted = true;
        return state;
      });
      if (inserted) created.push(action);
    }
    return created;
  }

  completeFounderAction(actionId, input = {}, connectors = null) {
    const action = this.list("founderActions").find((item) => item.id === actionId);
    if (!action) throw new Error("Founder action not found");
    if (action.status !== "pending") throw new Error("Founder action is already completed");
    if (input.registrationComplete !== true || input.identityAndTermsConfirmed !== true || input.paymentReady !== true) {
      throw new Error("Registration, required verification, terms and payment readiness must all be confirmed");
    }
    const publicAccountUrl = publicResultUrl(input.publicAccountUrl, "public account URL");
    const connectorReady = Boolean(connectors?.get(action.recommendation.connectorType).status().configured);
    this.store.update((state) => {
      const current = state.founderActions.find((item) => item.id === actionId);
      Object.assign(current, { status: "completed", completedAt: now(), updatedAt: now(), completion: {
        publicAccountUrl, registrationComplete: true, identityAndTermsConfirmed: true, paymentReady: true
      } });
      const task = state.tasks.find((item) => item.id === action.taskId);
      if (task) Object.assign(task, {
        externalReadiness: { provider: action.recommendation.provider, publicAccountUrl, connectorReady, confirmedAt: now() },
        blockedReason: connectorReady
          ? "The provider account is ready. The AI organization must prepare the exact external action."
          : "The provider account is ready, but no scoped provider adapter is connected. Use the auditable manual-result fallback or connect an adapter.",
        nextAction: connectorReady
          ? "Review the AI-prepared payload, then approve the exact external action."
          : "The platform lacks a connected automation adapter in this MVP. Record the public result after the Founder completes the platform action, or connect a scoped adapter.",
        updatedAt: now()
      });
      state.events.push({ id: id("event"), type: "founder.action_completed", createdAt: now(), payload: {
        founderActionId: actionId, taskId: action.taskId, provider: action.recommendation.provider, connectorReady
      } });
      this.syncGoalStatus(state, task?.goalId);
      return state;
    });
    return this.list("founderActions").find((item) => item.id === actionId);
  }

  recordManualExternalResult(taskId, input = {}) {
    const task = this.getTask(taskId);
    if (task.executionMode !== "external" || !["blocked", "failed"].includes(task.status)) throw new Error("Task is not waiting for an external result");
    if ((task.dependsOn || []).some((dependencyId) => {
      const dependency = this.getTask(dependencyId);
      return dependency.status !== "completed" || (dependency.toolName === "code.codex" && dependency.integrationStatus !== "integrated");
    })) throw new Error("Task dependencies must be accepted before recording an external result");
    const founderAction = this.list("founderActions").find((item) => item.id === task.founderActionId && item.status === "completed");
    if (!founderAction) throw new Error("Complete the required Founder account setup first");
    if (founderAction.recommendation.connectorType !== "publishing" || task.externalIntent === "outcome_verification") {
      throw new Error("Manual public-result evidence is available only for publication, not private messages, records, sales or outcome verification");
    }
    if (input.performedByFounder !== true || input.verifiedAtDestination !== true) {
      throw new Error("Founder performance and destination verification must both be confirmed");
    }
    const publicUrl = publicResultUrl(input.publicUrl, "published result URL");
    const provider = founderAction.recommendation.provider;
    const timestamp = now();
    const receiptId = id("manual_receipt");
    const content = [
      "# Manual External Action Record", "", `- Provider: ${provider}`, `- Public result: ${publicUrl}`,
      `- Recorded at: ${timestamp}`, `- Receipt: ${receiptId}`,
      "- Execution: Performed and verified by the Founder because no scoped provider adapter was connected.", "",
      "This record proves that the Founder reported and checked the destination. It does not independently prove sales, revenue or other business outcomes."
    ].join("\n");
    const artifact = { filename: task.deliverable?.endsWith(".md") ? task.deliverable : "external_action_record.md", content,
      bytes: Buffer.byteLength(content), sha256: crypto.createHash("sha256").update(content).digest("hex") };
    const externalAction = {
      id: id("action"), taskId, goalId: task.goalId, projectId: task.projectId, agentId: task.assignedAgentId,
      assetId: null, connectorType: "manual", operation: founderAction.recommendation.connectorType === "publishing" ? "publish" : "complete",
      payload: { provider, publicUrl }, preview: { provider, publicUrl }, risk: "high", status: "completed",
      createdAt: timestamp, updatedAt: timestamp, decidedAt: timestamp, decidedBy: "Founder",
      decisionReason: "Founder performed and verified the external action through the temporary manual fallback.",
      result: { summary: `${provider} accepted the Founder-performed external action.`, receiptId, url: publicUrl, manual: true, artifacts: [artifact] }, error: null
    };
    const evidence = [{ id: id("evidence"), type: "founder_external_receipt", createdAt: timestamp,
      summary: "The Founder reported and verified the external destination; no automated provider invocation occurred.",
      details: { actionId: externalAction.id, provider, receiptId, url: publicUrl, independentlyVerified: false } }];
    this.store.update((state) => {
      if (state.externalActions.some((item) => item.taskId === taskId && ["pending", "executing", "completed", "uncertain"].includes(item.status))) {
        throw new Error("An external result already exists for this task");
      }
      state.externalActions.push(externalAction);
      const storedTask = state.tasks.find((item) => item.id === taskId);
      Object.assign(storedTask, { status: "awaiting_review", externalActionId: externalAction.id,
        output: { outcome: "delivered", summary: externalAction.result.summary, questions: [],
          limitations: ["The action was performed manually and was not independently verified by a provider adapter."], artifacts: [artifact], externalReceipt: receiptId },
        evidence, error: null, blockedReason: null, founderReviewRequired: true,
        nextAction: "Review the public destination and accept this task before dependent work continues.", updatedAt: now() });
      state.events.push({ id: id("event"), type: "external.manual_result_recorded", createdAt: now(), payload: {
        actionId: externalAction.id, taskId, provider, receiptId
      } });
      this.syncGoalStatus(state, storedTask.goalId);
      return state;
    });
    return this.getTask(taskId);
  }

  requestExternalAction(taskId, input = {}, connectors) {
    const task = this.getTask(taskId);
    if (task.executionMode !== "external" || !["blocked", "failed"].includes(task.status)) throw new Error("Task is not waiting for an external connector");
    if (!task.assignedAgentId) throw new Error("External task requires an assigned employee");
    if (task.dependsOn.some((dependencyId) => {
      const dependency = this.getTask(dependencyId);
      return dependency.status !== "completed" || (dependency.toolName === "code.codex" && dependency.integrationStatus !== "integrated");
    })) throw new Error("Task dependencies must be accepted and code dependencies integrated before preparing an external action");
    const pendingFounderAction = this.list("founderActions").find((item) => item.taskId === taskId && item.status === "pending");
    if (pendingFounderAction) throw new Error(`Complete the Founder account setup for ${pendingFounderAction.recommendation.provider} first`);
    const connectorType = required(input.connectorType, "connector type");
    const connector = connectors.get(connectorType);
    const asset = this.list("assets").find((item) => item.id === input.assetId && item.type === "external_connector" && item.connectorType === connectorType);
    if (!asset) throw new Error("Matching connector asset not found");
    const operation = { web_research: "read", email: "send", crm: "create", publishing: "publish" }[connectorType];
    const [entry] = this.effectiveAccess(task.assignedAgentId, asset.id);
    const permission = entry.actions.find((item) => item.action === operation);
    if (!permission || ["denied", "not_granted"].includes(permission.effect)) throw new Error("Employee policy does not permit requesting this connector action");
    const preview = connector.preview(input.payload || {});
    const existing = this.list("externalActions").find((item) => item.taskId === taskId && ["pending", "executing", "completed", "uncertain"].includes(item.status));
    if (existing) return existing;
    const action = { id: id("action"), taskId, goalId: task.goalId, projectId: task.projectId, agentId: task.assignedAgentId,
      assetId: asset.id, connectorType, operation, payload: input.payload || {}, preview, risk: connectorType === "web_research" ? "medium" : "high",
      status: "pending", createdAt: now(), updatedAt: now(), result: null, error: null };
    this.store.update((state) => {
      state.externalActions.push(action);
      const storedTask = state.tasks.find((item) => item.id === taskId);
      Object.assign(storedTask, { externalActionId: action.id, nextAction: "Review the exact external action in Approvals.", updatedAt: now() });
      state.events.push({ id: id("event"), type: "external.action_requested", createdAt: now(), payload: { actionId: action.id, taskId,
        connectorType, operation, assetId: asset.id } });
      return state;
    });
    return action;
  }

  async decideExternalAction(actionId, input = {}, connectors) {
    const action = this.list("externalActions").find((item) => item.id === actionId);
    if (!action) throw new Error("External action not found");
    if (action.status !== "pending") throw new Error("External action is already decided");
    const decision = input.decision;
    const reason = required(input.reason, "decision reason");
    if (!["approved", "rejected"].includes(decision)) throw new Error("Decision must be approved or rejected");
    if (decision === "rejected") {
      this.store.update((state) => {
        const current = state.externalActions.find((item) => item.id === actionId);
        Object.assign(current, { status: "rejected", decidedBy: "Founder", decisionReason: reason, decidedAt: now(), updatedAt: now() });
        const task = state.tasks.find((item) => item.id === action.taskId);
        Object.assign(task, { status: "blocked", nextAction: "The proposed external action was rejected. Revise the task or action payload.", updatedAt: now() });
        state.events.push({ id: id("event"), type: "external.action_rejected", createdAt: now(), payload: { actionId, taskId: action.taskId, reason } });
        return state;
      });
      return this.list("externalActions").find((item) => item.id === actionId);
    }
    const connector = connectors.get(action.connectorType);
    if (!connector.status().configured) throw new Error(`${action.connectorType} connector is not configured`);
    const grantId = id("access");
    this.store.update((state) => {
      const current = state.externalActions.find((item) => item.id === actionId);
      Object.assign(current, { status: "executing", decidedBy: "Founder", decisionReason: reason, decidedAt: now(), updatedAt: now() });
      state.accessRequests.push({ id: grantId, requesterAgentId: action.agentId, assetId: action.assetId, action: action.operation,
        reason: `Exact external action ${action.id}: ${reason}`, duration: "one action", grantType: "once", durationMinutes: 60,
        risk: action.risk, status: "approved", decisionReason: reason, decidedBy: "Founder", decidedAt: now(), expiresAt: null,
        usesRemaining: 1, consumedAt: null, externalActionId: action.id, createdAt: now(), updatedAt: now() });
      const task = state.tasks.find((item) => item.id === action.taskId);
      Object.assign(task, { status: "running", attempts: (task.attempts || 0) + 1, toolName: `connector.${action.connectorType}`,
        executor: `connector.${action.connectorType}`, accessScope: [{ assetId: action.assetId, actions: [action.operation] }],
        accessExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), error: null, blockedReason: null, updatedAt: now() });
      state.events.push({ id: id("event"), type: "external.action_approved", createdAt: now(), payload: { actionId, taskId: action.taskId, grantId } });
      this.syncGoalStatus(state, task.goalId);
      return state;
    });
    const task = this.getTask(action.taskId);
    let invocationStarted = false;
    try {
      const authorization = this.authorizeToolCall({ agentId: action.agentId, taskId: task.id, assetId: action.assetId,
        action: action.operation, toolName: `connector.${action.connectorType}`, grantId });
      invocationStarted = true;
      const result = await connector.execute(action.payload, { idempotencyKey: action.id });
      this.completeAuthorizedToolCall(authorization);
      const artifacts = (result.artifacts || []).map((artifact) => ({ ...artifact, bytes: Buffer.byteLength(artifact.content, "utf8"),
        sha256: crypto.createHash("sha256").update(artifact.content).digest("hex") }));
      const evidence = [{ id: id("evidence"), type: "external_receipt", summary: result.summary,
        details: { actionId, connectorType: action.connectorType, receiptId: result.receiptId, url: result.url || null, sources: result.sources || [] }, createdAt: now() }];
      this.store.update((state) => {
        const current = state.externalActions.find((item) => item.id === actionId);
        Object.assign(current, { status: "completed", result: { ...result, artifacts }, updatedAt: now() });
        const storedTask = state.tasks.find((item) => item.id === action.taskId);
        Object.assign(storedTask, { status: "awaiting_review", output: { outcome: "delivered", summary: result.summary,
          questions: [], limitations: [], artifacts, externalReceipt: result.receiptId }, evidence, error: null,
          nextAction: "Review the external receipt and accept the task delivery.", updatedAt: now() });
        state.events.push({ id: id("event"), type: "external.action_completed", createdAt: now(), payload: { actionId,
          taskId: action.taskId, connectorType: action.connectorType, receiptId: result.receiptId } });
        this.syncGoalStatus(state, storedTask.goalId);
        return state;
      });
      return this.list("externalActions").find((item) => item.id === actionId);
    } catch (error) {
      const uncertain = invocationStarted && action.connectorType !== "web_research";
      this.store.update((state) => {
        const current = state.externalActions.find((item) => item.id === actionId);
        Object.assign(current, { status: uncertain ? "uncertain" : "failed", error: error.message, updatedAt: now() });
        const storedTask = state.tasks.find((item) => item.id === action.taskId);
        Object.assign(storedTask, { status: uncertain ? "awaiting_review" : "failed", error: error.message,
          nextAction: uncertain ? "The external outcome is uncertain. Verify the destination before any retry." : "The read-only research action failed and may be revised.", updatedAt: now() });
        state.events.push({ id: id("event"), type: uncertain ? "external.action_uncertain" : "external.action_failed", createdAt: now(),
          payload: { actionId, taskId: action.taskId, connectorType: action.connectorType, error: error.message } });
        this.syncGoalStatus(state, storedTask.goalId);
        return state;
      });
      throw error;
    }
  }

  recoverInterruptedExternalActions() {
    this.store.update((state) => {
      for (const action of state.externalActions.filter((item) => item.status === "executing")) {
        Object.assign(action, { status: "uncertain", error: "The service restarted before the external receipt was persisted.", updatedAt: now() });
        const task = state.tasks.find((item) => item.id === action.taskId);
        if (task) Object.assign(task, { status: "awaiting_review", error: action.error,
          nextAction: "Verify the external destination before deciding whether to retry.", updatedAt: now() });
        state.events.push({ id: id("event"), type: "external.action_uncertain", createdAt: now(), payload: { actionId: action.id,
          taskId: action.taskId, reason: "restart_before_receipt" } });
      }
      return state;
    });
  }

  recoverInterruptedTasks() {
    for (const task of this.list("tasks").filter((item) => item.status === "running")) {
      this.updateTask(task.id, { status: "pending", leaseId: null, leaseExpiresAt: null,
        error: "The previous worker stopped before recording a result. The durable queue will retry this idempotent work order." });
      this.recordEvent("task.lease_recovered", { taskId: task.id });
    }
  }

  recoverExpiredLeases() {
    let recovered = 0;
    this.store.update((state) => {
      const currentTime = Date.now();
      for (const task of state.tasks.filter((item) => item.status === "running" && item.leaseExpiresAt
        && new Date(item.leaseExpiresAt).getTime() <= currentTime)) {
        Object.assign(task, { status: "pending", leaseId: null, leaseExpiresAt: null,
          error: "The worker lease expired before a result was recorded. The task is safe to retry.", updatedAt: now() });
        state.events.push({ id: id("event"), type: "task.lease_expired", createdAt: now(), payload: { taskId: task.id } });
        this.syncGoalStatus(state, task.goalId);
        recovered += 1;
      }
      return state;
    });
    return recovered;
  }

  claimTask(taskId, leaseDurationMs = 30 * 60_000) {
    let claimed = null;
    let claimError = null;
    this.store.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) { claimError = "Task not found"; return state; }
      if (!["pending", "blocked", "failed"].includes(task.status)) { claimError = "Task is already running or requires review before another execution"; return state; }
      const currentTime = Date.now();
      const running = state.tasks.filter((item) => item.status === "running" && (!item.leaseExpiresAt || new Date(item.leaseExpiresAt).getTime() > currentTime));
      if (running.length >= 2 || running.some((item) => task.assignedAgentId && item.assignedAgentId === task.assignedAgentId)) {
        claimError = "Execution capacity is busy; wait for the current work to finish";
        return state;
      }
      const blockedDependency = task.dependsOn.find((dependencyId) => {
        const dependency = state.tasks.find((item) => item.id === dependencyId);
        return !dependency || dependency.status !== "completed"
          || (dependency.toolName === "code.codex" && dependency.integrationStatus !== "integrated");
      });
      if (blockedDependency) {
        Object.assign(task, { status: "blocked", blockedReason: `Dependency ${blockedDependency} is not completed.`, updatedAt: now() });
        claimError = "Task dependencies are not completed";
        return state;
      }
      if (!task.toolName) {
        Object.assign(task, { status: "blocked", blockedReason: "No executor is configured for this task.", updatedAt: now() });
        claimError = "Task has no executor configured";
        return state;
      }
      const leaseId = id("lease");
      Object.assign(task, { status: "running", attempts: (task.attempts || 0) + 1, executor: task.toolName,
        error: null, blockedReason: null, leaseId, leaseExpiresAt: new Date(currentTime + leaseDurationMs).toISOString(), updatedAt: now() });
      claimed = structuredClone(task);
      state.events.push({ id: id("event"), type: "task.claimed", createdAt: now(), payload: { taskId, leaseId, leaseExpiresAt: task.leaseExpiresAt } });
      this.syncGoalStatus(state, task.goalId);
      return state;
    });
    if (claimError) throw new Error(claimError);
    return claimed;
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
    if (goal.planningTaskId) {
      const planning = state.tasks.find((t) => t.id === goal.planningTaskId);
      const work = state.tasks.filter((t) => t.goalId === goalId && t.planId === goal.approvedPlanId && t.taskKind === "work");
      const report = goal.finalReportTaskId ? state.tasks.find((t) => t.id === goal.finalReportTaskId) : null;
      const deliveryComplete = work.length > 0 && work.every((t) => t.status === "completed"
        && (t.toolName !== "code.codex" || t.integrationStatus === "integrated"));
      goal.executionStatus = !goal.approvedPlanId ? planning?.status === "awaiting_review" ? "awaiting_plan_approval" : planning?.status === "needs_input" ? "needs_input" : ["pending", "running"].includes(planning?.status) ? "planning" : "blocked"
        : deliveryComplete ? !goal.autonomyPolicy ? "delivered" : report?.status === "completed" ? "delivered"
          : ["blocked", "failed"].includes(report?.status) || goal.finalReportStatus === "blocked" ? "blocked" : "reporting"
          : work.some((t) => ["blocked", "failed"].includes(t.status)) ? "blocked"
            : work.some((t) => ["awaiting_review", "awaiting_quality_review"].includes(t.status)) ? "awaiting_review" : "in_progress";
      goal.updatedAt = now();
      return;
    }
    const tasks = state.tasks.filter((task) => task.goalId === goalId);
    const latestCycle = tasks.length ? Math.max(...tasks.map((task) => task.planCycle || 1)) : 0;
    const latest = tasks.filter((task) => (task.planCycle || 1) === latestCycle);
    if (!latest.length) goal.executionStatus = "not_started";
    else if (latest.some((task) => ["blocked", "failed"].includes(task.status))) goal.executionStatus = "blocked";
    else if (latest.some((task) => task.status === "needs_input")) goal.executionStatus = "blocked";
    else if (latest.every((task) => ["completed", "awaiting_review"].includes(task.status))) goal.executionStatus = "awaiting_review";
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
    if (this.workflow && this.getGoal(goalId).planningTaskId) return this.workflow.summarizeGoal(goalId);
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

  async executeTask(taskId, options = {}) {
    const task = options.leaseId ? this.getTask(taskId) : this.claimTask(taskId);
    if (options.leaseId && (task.status !== "running" || task.leaseId !== options.leaseId)) throw new Error("Task lease is stale");
    const leaseId = options.leaseId || task.leaseId;
    try {
      const agent = this.list("agents").find((item) => item.id === task.assignedAgentId) || null;
      const output = await this.tools.execute(task.toolName, task.input, { task: this.getTask(task.id), agent, organization: this });
      const evidence = Array.isArray(output?.evidence) ? output.evidence : [];
      if (!evidence.length) throw new Error("Executor returned no evidence");
      const status = ["agent.general", "goal.plan"].includes(task.toolName)
        ? { delivered: task.taskKind === "goal_report" ? "completed" : task.toolName === "agent.general" && this.workflow?.shouldAutoReview(task) ? "awaiting_quality_review" : "awaiting_review", needs_input: "needs_input", blocked: "blocked" }[output.outcome]
        : task.toolName === "code.codex" ? "awaiting_review" : "completed";
      if (!status) throw new Error("Executor returned an unknown outcome");
      const leasedTask = this.getTask(taskId);
      if (leasedTask.status !== "running" || leasedTask.leaseId !== leaseId) {
        const error = new Error("Task lease is stale; executor output was discarded");
        error.code = "STALE_TASK_LEASE";
        throw error;
      }
      const nextAction = status === "awaiting_quality_review" ? "An independent quality review is queued."
        : status === "awaiting_review" ? "Review the delivered files, then accept or request changes."
        : status === "needs_input" ? "Answer the employee's questions to continue." : null;
      const completion = { status, output, evidence, error: null, nextAction, nextAttemptAt: null, autoRetryCount: 0,
        leaseId: null, leaseExpiresAt: null, blockedReason: status === "blocked" ? output.limitations.join(" ") : null };
      const result = task.toolName === "goal.plan" && this.workflow
        ? this.workflow.commitPlanningResult(taskId, leaseId, completion)
        : this.updateTask(taskId, completion);
      this.recordEvent(`task.${status}`, { taskId, evidenceCount: evidence.length });
      if (status === "awaiting_quality_review") this.workflow.queueQualityReview(result);
      if (task.toolName === "delivery.review") this.workflow.applyQualityReview(result);
      if (status === "needs_input") this.workflow?.tryResolveRoutineInput(result);
      if (task.taskKind === "goal_report") this.store.update((state) => {
        const goal = state.goals.find((g) => g.id === task.goalId);
        if (goal) goal.finalReportStatus = status;
        return state;
      });
      return result;
    } catch (error) {
      if (error.code === "STALE_TASK_LEASE") throw error;
      if (error.code === "AUTONOMY_BUDGET_EXHAUSTED") throw error;
      const current = this.getTask(taskId);
      const retry = this.workflow?.handleExecutionFailure(current, error);
      if (retry) return retry;
      const failed = this.updateTask(taskId, { status: "failed", error: error.message, founderReviewRequired: Boolean(task.planId), leaseId: null, leaseExpiresAt: null });
      this.workflow?.handlePermanentFailure(failed, error);
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
    this.organization.recoverExpiredLeases();
    this.organization.prepareReadyExternalTasks();
    const tasks = this.organization.list("tasks")
      .filter((task) => task.status === "pending" && (!task.nextAttemptAt || new Date(task.nextAttemptAt).getTime() <= Date.now()))
      .sort((a, b) => a.priority - b.priority);
    for (const task of tasks) {
      if (this.running.size >= 2) break;
      if (this.running.has(task.id)) continue;
      if (this.organization.list("tasks").some((item) => item.status === "running" && item.assignedAgentId && item.assignedAgentId === task.assignedAgentId)) continue;
      const state = this.organization.list("tasks");
      const ready = task.dependsOn.every((dependencyId) =>
        state.some((dependency) => dependency.id === dependencyId && dependency.status === "completed"
          && (dependency.toolName !== "code.codex" || dependency.integrationStatus === "integrated"))
      );
      if (!ready) continue;
      let claimed;
      try { claimed = this.organization.claimTask(task.id); } catch { continue; }
      this.running.add(task.id);
      this.organization.executeTask(task.id, { leaseId: claimed.leaseId })
        .catch(() => {})
        .finally(() => this.running.delete(task.id));
    }
  }
}
