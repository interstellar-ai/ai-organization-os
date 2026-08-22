import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./store.js";
import { Organization, Scheduler } from "./organization.js";
import { createDefaultTools } from "./tools.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3333);
const store = new JsonStore(path.join(root, "..", "data", "state.json"));
const organization = new Organization(store, null);
const tools = createDefaultTools(organization);
organization.tools = tools;
const scheduler = new Scheduler(organization);

function seed() {
  if (organization.list("agents").length > 0) return;
  organization.createAgent({
    name: "AI COO",
    role: "coo",
    description: "Coordinates goals, tasks and operational follow-through.",
    capabilities: ["research", "design", "validate", "iterate"]
  });
  organization.createAgent({
    name: "AI Builder",
    role: "worker",
    description: "Builds prototypes and technical deliverables.",
    capabilities: ["build"]
  });
  organization.writeMemory({
    scope: "organization",
    content: "Human founder approves high-impact external actions. MVP runs locally with JSON persistence.",
    tags: ["policy", "safety"],
    source: "seed"
  });
}

seed();
scheduler.start();

const json = (response, status, payload) => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
};

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function serveDashboard(response) {
  const file = fs.readFileSync(path.join(root, "..", "public", "index.html"));
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(file);
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && url.pathname === "/") return serveDashboard(response);
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(response, 200, { ok: true, service: "ai-organization-os", version: "0.1.0" });
    }
    if (request.method === "GET" && parts[1] && ["agents", "goals", "tasks", "memories"].includes(parts[1])) {
      const resource = parts[1];
      const items = resource === "memories"
        ? organization.searchMemories(url.searchParams.get("q") || "")
        : organization.list(resource).filter((item) => !url.searchParams.get("status") || item.status === url.searchParams.get("status"));
      return json(response, 200, items);
    }
    if (request.method === "GET" && url.pathname === "/api/tools") return json(response, 200, tools.list());
    if (request.method === "POST" && url.pathname === "/api/agents") return json(response, 201, organization.createAgent(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/goals") return json(response, 201, organization.createGoal(await body(request)));
    if (request.method === "POST" && parts[1] === "goals" && parts[3] === "plan") return json(response, 201, organization.planGoal(parts[2]));
    if (request.method === "POST" && url.pathname === "/api/tasks") return json(response, 201, organization.createTask(await body(request)));
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "run") return json(response, 200, await organization.executeTask(parts[2]));
    if (request.method === "POST" && url.pathname === "/api/memories") return json(response, 201, organization.writeMemory(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/tools/execute") {
      const input = await body(request);
      return json(response, 200, await tools.execute(input.name, input.input || {}, { organization }));
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    const status = /required|not found|dependencies|Unknown tool/i.test(error.message) ? 400 : 500;
    return json(response, status, { error: error.message });
  }
}

const server = http.createServer((request, response) => {
  route(request, response);
});

server.listen(port, () => {
  console.log(`AI Organization OS running at http://localhost:${port}`);
});

process.on("SIGINT", () => {
  scheduler.stop();
  server.close(() => process.exit(0));
});
