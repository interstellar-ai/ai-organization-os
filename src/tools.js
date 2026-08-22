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

  register(name, description, handler) {
    this.tools.set(name, { name, description, handler });
    return this;
  }

  list() {
    return [...this.tools.values()].map(({ name, description }) => ({ name, description }));
  }

  async execute(name, input, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.handler(input, context);
  }
}

export function createDefaultTools(organization) {
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
        persistence: "JSON file for local development",
        scheduler: "In-process interval scheduler",
        externalConnectors: [],
        limitations: ["No LLM provider", "No external publishing connector", "No production database", "No approval UI"]
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
      const content = `Next iteration for ${goal.title}: connect one approved external workflow after replacing the local placeholder boundary with a real connector and evidence record.`;
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
    }));
  return registry;
}
