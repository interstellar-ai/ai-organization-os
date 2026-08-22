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
    .register("memory.search", "Search organization memories by text", (input) =>
      organization.searchMemories(input?.query || "")
    )
    .register("memory.write", "Save a durable organization memory", (input) =>
      organization.writeMemory(input || {})
    )
    .register("task.list", "List tasks, optionally filtered by status", (input) =>
      organization.list("tasks").filter((task) => !input?.status || task.status === input.status)
    )
    .register("goal.list", "List current organization goals", () => organization.list("goals"))
    .register("echo", "Return input for connector and runtime testing", (input) => ({ ok: true, input }));
  return registry;
}
