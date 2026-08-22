import crypto from "node:crypto";

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

function required(value, name) {
  if (!value || typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

export class Organization {
  constructor(store, tools) {
    this.store = store;
    this.tools = tools;
  }

  list(resource) {
    return this.store.read()[resource] ?? [];
  }

  createAgent(input = {}) {
    const timestamp = now();
    const agent = {
      id: id("agent"),
      name: required(input.name, "name"),
      role: input.role?.trim() || "worker",
      description: input.description?.trim() || "",
      capabilities: Array.isArray(input.capabilities) ? input.capabilities : [],
      status: "idle",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.agents.push(agent);
      return state;
    });
    return agent;
  }

  createGoal(input = {}) {
    const timestamp = now();
    const goal = {
      id: id("goal"),
      title: required(input.title, "title"),
      description: input.description?.trim() || "",
      status: "active",
      priority: Number.isFinite(input.priority) ? input.priority : 3,
      metrics: input.metrics ?? [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.goals.push(goal);
      return state;
    });
    return goal;
  }

  planGoal(goalId) {
    const state = this.store.read();
    const goal = state.goals.find((item) => item.id === goalId);
    if (!goal) throw new Error("Goal not found");

    const templates = [
      ["research", "Research the market, users and constraints"],
      ["design", "Turn the research into a practical solution design"],
      ["build", "Build the smallest testable version"],
      ["validate", "Validate the result against the goal and collect evidence"],
      ["iterate", "Summarize learnings and propose the next iteration"]
    ];
    const agents = state.agents;
    const created = templates.map(([capability, title], index) => {
      const assigned = agents.find((agent) =>
        agent.capabilities.some((item) => item.toLowerCase() === capability)
      ) ?? agents.find((agent) => agent.role === "coo") ?? agents[0];
      return {
        id: id("task"),
        goalId,
        title,
        description: `${title} for goal: ${goal.title}. ${goal.description}`.trim(),
        status: "pending",
        priority: Math.max(1, goal.priority + index),
        assignedAgentId: assigned?.id ?? null,
        dependsOn: index === 0 ? [] : [],
        toolName: null,
        input: {},
        output: null,
        error: null,
        createdAt: now(),
        updatedAt: now()
      };
    });
    for (let index = 1; index < created.length; index += 1) {
      created[index].dependsOn = [created[index - 1].id];
    }
    this.store.update((current) => {
      current.tasks.push(...created);
      return current;
    });
    return created;
  }

  createTask(input = {}) {
    const timestamp = now();
    const task = {
      id: id("task"),
      goalId: input.goalId || null,
      title: required(input.title, "title"),
      description: input.description?.trim() || "",
      status: "pending",
      priority: Number.isFinite(input.priority) ? input.priority : 3,
      assignedAgentId: input.assignedAgentId || null,
      dependsOn: Array.isArray(input.dependsOn) ? input.dependsOn : [],
      toolName: input.toolName || null,
      input: input.input ?? {},
      output: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.store.update((state) => {
      state.tasks.push(task);
      return state;
    });
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
    return memory;
  }

  updateTask(taskId, patch) {
    let updated;
    this.store.update((state) => {
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("Task not found");
      Object.assign(task, patch, { updatedAt: now() });
      updated = task;
      return state;
    });
    return updated;
  }

  async executeTask(taskId) {
    const state = this.store.read();
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error("Task not found");
    const blocked = task.dependsOn.some((dependencyId) => {
      const dependency = state.tasks.find((item) => item.id === dependencyId);
      return !dependency || dependency.status !== "completed";
    });
    if (blocked) throw new Error("Task dependencies are not completed");

    this.updateTask(taskId, { status: "running", error: null });
    try {
      const output = task.toolName
        ? await this.tools.execute(task.toolName, task.input, { task, organization: this })
        : { message: "Task completed by the default agent runner", task: task.title };
      return this.updateTask(taskId, { status: "completed", output });
    } catch (error) {
      this.updateTask(taskId, { status: "failed", error: error.message });
      throw error;
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
