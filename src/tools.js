import crypto from "node:crypto";

const timestamp = () => new Date().toISOString();
const evidenceId = () => `evidence_${crypto.randomUUID().slice(0, 8)}`;

function evidence(type, summary, details = {}) {
  return { id: evidenceId(), type, summary, details, createdAt: timestamp() };
}

function goalForTask(organization, task) {
  return organization.getGoal(task.goalId);
}

export class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(name, description, handler, options = {}) {
    this.tools.set(name, { name, description, handler, options });
    return this;
  }

  list() {
    return [...this.tools.values()].map(({ name, description, options }) => ({
      name,
      description,
      requiresIdentity: Boolean(options.requiresIdentity || options.authorize),
      requiresTaskCapability: Boolean(options.authorize)
    }));
  }

  async execute(name, input, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    if (tool.options.requiresRunningTask) {
      const persisted = context.task && context.organization?.getTask(context.task.id);
      if (!persisted || persisted.status !== "running" || persisted.toolName !== name || persisted.assignedAgentId !== context.agent?.id
        || persisted.input.assetId !== input?.assetId) throw new Error("Tool requires its assigned running task");
    }
    if ((tool.options.requiresIdentity || tool.options.authorize) && !context.agent) {
      context.organization?.recordEvent("tool.denied", { toolName: name, reason: "Missing employee identity" });
      throw new Error("Tool identity required");
    }
    const authorizationRequests = tool.options.authorize
      ? tool.options.authorize(input || {}, context)
      : [];
    const decisions = (Array.isArray(authorizationRequests) ? authorizationRequests : [authorizationRequests]).map((request) =>
      context.organization.authorizeToolCall({
        ...request,
        agentId: context.agent.id,
        taskId: context.task?.id,
        toolName: name
      })
    );
    const output = await tool.handler(input, { ...context, authorization: decisions });
    for (const decision of decisions) context.organization.completeAuthorizedToolCall(decision);
    return output;
  }
}

export function createDefaultTools(organization, options = {}) {
  const registry = new ToolRegistry();
  registry
    .register("goal.analyze", "Analyze a goal's objective, constraints, and external-action boundary", (_input, { task }) => {
      const goal = goalForTask(organization, task);
      const text = `${goal.title} ${goal.description}`.toLowerCase();
      const externalActions = ["publish", "post", "send", "email", "buy", "sell", "deploy", "delete", "money", "revenue"]
        .filter((signal) => text.includes(signal));
      const findings = {
        objective: goal.description || goal.title,
        externalActionsDetected: externalActions,
        localMvpBoundary: "This run can analyze and validate locally; external actions need approved connectors.",
        successCriteria: goal.metrics.length ? goal.metrics : ["Define a measurable outcome before external execution."]
      };
      return {
        kind: "goal_analysis",
        summary: `Analyzed scope and constraints for ${goal.title}.`,
        findings,
        evidence: [evidence("goal_analysis", "Goal scope and external-action boundary were analyzed locally.", findings)]
      };
    })
    .register("solution.design", "Design an executable workflow from the current goal and agent roster", (_input, { task }) => {
      const goal = goalForTask(organization, task);
      const agents = organization.list("agents").map((agent) => ({
        name: agent.name,
        role: agent.role,
        capabilities: agent.capabilities
      }));
      const workflow = organization.latestTasksForGoal(goal.id).map((item) => ({
        title: item.title,
        executor: item.toolName,
        dependsOn: item.dependsOn
      }));
      return {
        kind: "workflow_design",
        summary: `Designed an executable workflow for ${goal.title}.`,
        design: { agents, tools: organization.tools.list(), workflow },
        evidence: [evidence("workflow_design", "Agent, tool, and dependency mappings were generated.", { agents, workflow })]
      };
    })
    .register("mvp.inspect", "Inspect the local MVP execution surface and its known limits", (_input, { task }) => {
      const goal = goalForTask(organization, task);
      const inspection = {
        goalId: goal.id,
        agentCount: organization.list("agents").length,
        toolCount: organization.tools.list().length,
        persistence: "Transactional local store selected by the host",
        scheduler: "Persisted task leases with an in-process dispatcher",
        externalConnectors: organization.list("assets").filter((asset) => asset.type === "external_connector").map((asset) => asset.connectorType),
        limitations: ["Single-node trusted runtime", "No multi-tenant authentication", "No distributed worker fleet", "No automatic deployment"]
      };
      return {
        kind: "mvp_inspection",
        summary: "Inspected the local MVP and recorded its execution limits.",
        inspection,
        evidence: [evidence("mvp_inspection", "Local agents, tools, persistence, scheduler, and limitations were inspected.", inspection)]
      };
    })
    .register("workflow.validate", "Validate task executors, dependencies, agents, and goal inputs", (_input, { task }) => {
      const goal = goalForTask(organization, task);
      const tasks = organization.latestTasksForGoal(goal.id);
      const agents = organization.list("agents");
      const taskIds = new Set(tasks.map((item) => item.id));
      const checks = [
        { name: "Goal has a title", passed: Boolean(goal.title) },
        { name: "Goal has a description", passed: Boolean(goal.description) },
        { name: "At least one agent is available", passed: agents.length > 0 },
        { name: "Every task has an executor", passed: tasks.every((item) => Boolean(item.toolName)) },
        { name: "Dependencies point to the current plan", passed: tasks.every((item) => item.dependsOn.every((dependencyId) => taskIds.has(dependencyId))) }
      ];
      const passed = checks.every((check) => check.passed);
      return {
        kind: "workflow_validation",
        summary: passed ? "Workflow validation passed." : "Workflow validation found issues.",
        passed,
        checks,
        evidence: [evidence("workflow_validation", `Validation ${passed ? "passed" : "found issues"}.`, { checks, passed })]
      };
    })
    .register("iteration.record", "Record the next iteration and its local evidence in organization memory", (_input, { task }) => {
      const goal = goalForTask(organization, task);
      const content = `Next iteration for ${goal.title}: evaluate current evidence, resolve blocked approvals, and add only the smallest scoped connector or execution capability required by the next verified outcome.`;
      const memory = organization.writeMemory({
        scope: `goal:${goal.id}`,
        content,
        tags: ["iteration", "mvp", "next-step"],
        source: task.id
      });
      return {
        kind: "iteration_record",
        summary: "Recorded the next iteration decision in organization memory.",
        memory,
        evidence: [evidence("iteration_record", "Next-step decision was written to durable local memory.", { memoryId: memory.id })]
      };
    })
    .register("memory.search", "Search organization memories by text", (input) => {
      const items = organization.searchMemories(input?.query || "");
      return {
        items,
        evidence: [evidence("memory_search", `Found ${items.length} matching memories.`, { query: input?.query || "" })]
      };
    })
    .register("memory.write", "Save a durable organization memory", (input) => {
      const memory = organization.writeMemory(input || {});
      return {
        memory,
        evidence: [evidence("memory_write", "Memory was saved to local organization storage.", { memoryId: memory.id })]
      };
    })
    .register("task.list", "List tasks, optionally filtered by status", (input) => {
      const items = organization.list("tasks").filter((task) => !input?.status || task.status === input.status);
      return {
        items,
        evidence: [evidence("task_list", `Listed ${items.length} tasks.`, { status: input?.status || null })]
      };
    })
    .register("goal.list", "List current organization goals", () => {
      const items = organization.list("goals");
      return {
        items,
        evidence: [evidence("goal_list", `Listed ${items.length} goals.`)]
      };
    })
    .register("echo", "Return input for connector and runtime testing", (input) => ({
      ok: true,
      input,
      evidence: [evidence("echo", "Echo tool executed successfully.", { input })]
    }))
    .register("asset.catalog", "Discover only assets visible or requestable to the current employee", (input, { agent }) => {
      const items = organization.authorizedAssetCatalog(agent.id, input?.query || "");
      return {
        items,
        evidence: [evidence("authorized_asset_catalog", `Found ${items.length} assets within the employee's discoverable scope.`, { query: input?.query || "", assetIds: items.map((item) => item.id) })]
      };
    }, { requiresIdentity: true })
    .register("asset.inspect", "Read protected asset metadata through policy and task-capability enforcement", (input) => {
      const asset = organization.list("assets").find((item) => item.id === input.assetId);
      return {
        asset: {
          id: asset.id,
          name: asset.name,
          type: asset.type,
          owner: asset.owner,
          sensitivity: asset.sensitivity,
          environment: asset.environment,
          description: asset.description
        },
        evidence: [evidence("authorized_asset_inspection", "Protected asset metadata was read through the tool gateway.", { assetId: asset.id })]
      };
    }, { authorize: (input) => ({ assetId: input.assetId, action: "read" }) });

  if (options.codexExecutor) {
    registry.register("code.codex", "Implement an assigned coding task with Codex in an isolated Git worktree", async (input, { task, agent }) => {
      const asset = organization.list("assets").find((item) => item.id === input.assetId);
      const handoffs = organization.workflow?.dependencyContext(task) || [];
      const codeDependencies = task.dependsOn.map((dep) => organization.getTask(dep)).filter((dep) => dep.executionMode === "code");
      if (codeDependencies.some((dep) => dep.integrationStatus !== "integrated")) throw new Error("Upstream code must be reviewed and integrated before dependent coding starts");
      organization.workflow?.requireModelRun(task);
      const result = await options.codexExecutor.execute({ task: { ...task, input: { ...task.input, ...(codeDependencies.length ? { baseRef: "codex/integration" } : {}) },
        context: [task.context, handoffs.length ? `Accepted dependency deliveries: ${JSON.stringify(handoffs)}` : ""].filter(Boolean).join("\n") }, agent, asset });
      return {
        ...result,
        evidence: [evidence("codex_execution", "Codex completed a sandboxed coding run and returned inspectable workspace evidence.", {
          provider: result.provider,
          sandbox: result.sandbox,
          networkAccess: result.networkAccess,
          transport: result.transport,
          worktreeId: result.worktreeId,
          changedFiles: result.changedFiles,
          eventCount: result.eventCount,
          usage: result.usage,
          restrictions: result.restrictions
        })]
      };
    }, {
      authorize: (input) => ["read", "modify", "execute"].map((action) => ({ assetId: input.assetId, action }))
    });
  }
  if (options.generalExecutor) {
    registry.register("agent.general", "Deliver documents or clarification from an assigned employee", async (_input, { task, agent }) => {
      const persisted = organization.getTask(task.id);
      const employee = organization.list("agents").find((item) => item.id === agent.id);
      if (!employee.capabilities.includes(persisted.routing?.requiredCapability)) throw new Error("Employee capability is required for this work");
      const dependencyDeliveries = organization.workflow?.dependencyContext(persisted) || [];
      organization.workflow?.requireModelRun(persisted);
      return options.generalExecutor.execute({ task: { ...persisted, dependencyDeliveries }, agent: employee });
    }, { requiresRunningTask: true, authorize: (input) => ({ assetId: input.assetId, action: "execute" }) });
  }
  return registry;
}
