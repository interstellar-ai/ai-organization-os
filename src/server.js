import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./store.js";
import { Organization, Scheduler } from "./organization.js";
import { createDefaultTools } from "./tools.js";
import { CodexExecutor } from "./executors/codex.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");
const port = Number(process.env.PORT || 3333);
const store = new JsonStore(path.join(projectRoot, "data", "state.json"));
const organization = new Organization(store, null);
const codexExecutor = new CodexExecutor({ projectRoot });
await codexExecutor.checkAvailability();
const tools = createDefaultTools(organization, { codexExecutor });
organization.tools = tools;
const scheduler = new Scheduler(organization);

function seed() {
  const findAgent = (name) => organization.list("agents").find((agent) => agent.name === name);
  const ensureTemplate = (definition) => organization.list("jobTemplates").find((template) => template.jobType === definition.jobType) || organization.createJobTemplate(definition);
  const templateDefinitions = [
    { name: "AI CEO", jobType: "ai_ceo", department: "Executive", description: "Interprets Founder intent and coordinates the AI organization.", responsibilities: ["Clarify intent", "Coordinate departments", "Report to the Founder"], capabilities: ["research", "design", "validate", "iterate"] },
    { name: "Product Manager", jobType: "product_manager", department: "Product", description: "Defines user outcomes, product scope and acceptance criteria.", responsibilities: ["Product definition", "Requirements", "Acceptance criteria"], capabilities: ["research", "design"] },
    { name: "Project Manager", jobType: "project_manager", department: "Operations", description: "Plans milestones, assignments, dependencies and delivery risks.", responsibilities: ["Planning", "Scheduling", "Escalation"], capabilities: ["iterate", "validate"] },
    { name: "Technical Lead", jobType: "technical_lead", department: "Engineering", description: "Owns technical design and engineering coordination.", responsibilities: ["Architecture", "Technical planning", "Engineering review"], capabilities: ["build", "validate"] },
    { name: "Product Designer", jobType: "product_designer", department: "Design", description: "Designs user flows, information architecture and interface behavior.", responsibilities: ["User flows", "Interaction design", "Interface specification"], capabilities: ["design"] },
    { name: "Software Engineer", jobType: "software_engineer", department: "Engineering", description: "Implements approved product and technical designs.", responsibilities: ["Implementation", "Automated tests", "Technical evidence"], capabilities: ["build"] },
    { name: "Quality Reviewer", jobType: "quality_reviewer", department: "Quality", description: "Independently reviews artifacts, evidence and acceptance criteria.", responsibilities: ["Independent review", "Evidence validation", "Release recommendation"], capabilities: ["validate"] },
    { name: "Operations Lead", jobType: "operations_lead", department: "Operations", description: "Coordinates operational follow-through.", responsibilities: ["Operations coordination"], capabilities: ["research", "design", "validate", "iterate"] },
    { name: "Prototype Builder", jobType: "prototype_builder", department: "Engineering", description: "Builds small technical prototypes.", responsibilities: ["Prototype implementation"], capabilities: ["build"] }
  ];
  const templates = templateDefinitions.map(ensureTemplate);
  const templateFor = (jobType) => templates.find((template) => template.jobType === jobType);
  const ensureAgent = (definition) => findAgent(definition.name) || organization.createAgent({ ...definition, templateId: templateFor(definition.jobType)?.id });
  const ceo = ensureAgent({
    name: "AI CEO",
    role: "ai_ceo",
    jobType: "ai_ceo",
    department: "Executive",
    description: "Interprets Founder intent and coordinates the AI organization.",
    responsibilities: ["Clarify intent", "Set execution boundaries", "Coordinate departments", "Report to the Founder"],
    capabilities: ["research", "design", "validate", "iterate"]
  });
  const product = ensureAgent({
    name: "Product Manager",
    role: "product_manager",
    jobType: "product_manager",
    department: "Product",
    managerId: ceo.id,
    description: "Defines user outcomes, product scope and acceptance criteria.",
    responsibilities: ["Product definition", "Requirements", "Acceptance criteria"],
    capabilities: ["research", "design"]
  });
  const project = ensureAgent({
    name: "Project Manager",
    role: "project_manager",
    jobType: "project_manager",
    department: "Operations",
    managerId: ceo.id,
    description: "Plans milestones, assignments, dependencies and delivery risks.",
    responsibilities: ["Planning", "Scheduling", "Escalation", "Cross-team coordination"],
    capabilities: ["iterate", "validate"]
  });
  const technical = ensureAgent({
    name: "Technical Lead",
    role: "technical_lead",
    jobType: "technical_lead",
    department: "Engineering",
    managerId: ceo.id,
    description: "Owns technical design and engineering coordination.",
    responsibilities: ["Architecture", "Technical planning", "Engineering review"],
    capabilities: ["build", "validate"]
  });
  store.update((state) => {
    const legacyCoo = state.agents.find((agent) => agent.name === "AI COO");
    if (legacyCoo) Object.assign(legacyCoo, { jobType: "operations_lead", department: "Operations", managerId: ceo.id });
    const legacyBuilder = state.agents.find((agent) => agent.name === "AI Builder");
    if (legacyBuilder) Object.assign(legacyBuilder, { jobType: "prototype_builder", department: "Engineering", managerId: technical.id });
    for (const agent of state.agents) {
      const template = state.jobTemplates.find((item) => item.jobType === agent.jobType);
      if (template) agent.templateId = template.id;
    }
    return state;
  });
  ensureAgent({
    name: "Product Designer",
    role: "product_designer",
    jobType: "product_designer",
    department: "Design",
    managerId: product.id,
    description: "Designs user flows, information architecture and interface behavior.",
    responsibilities: ["User flows", "Interaction design", "Interface specification"],
    capabilities: ["design"]
  });
  ensureAgent({
    name: "Software Engineer",
    role: "software_engineer",
    jobType: "software_engineer",
    department: "Engineering",
    managerId: technical.id,
    description: "Implements approved product and technical designs.",
    responsibilities: ["Implementation", "Automated tests", "Technical evidence"],
    capabilities: ["build"]
  });
  ensureAgent({
    name: "Quality Reviewer",
    role: "quality_reviewer",
    jobType: "quality_reviewer",
    department: "Quality",
    managerId: ceo.id,
    description: "Independently reviews artifacts, evidence and acceptance criteria.",
    responsibilities: ["Independent review", "Evidence validation", "Release recommendation"],
    capabilities: ["validate"]
  });

  if (!organization.list("memories").some((memory) => memory.tags?.includes("safety"))) {
    organization.writeMemory({
      scope: "organization",
      content: "The Founder approves high-impact external actions. The local MVP does not perform external business actions.",
      tags: ["policy", "safety"],
      source: "seed"
    });
  }

  const ensureAsset = (definition) => organization.list("assets").find((asset) => asset.name === definition.name) || organization.createAsset(definition);
  ensureAsset({ name: "Product Knowledge Base", type: "document_collection", owner: "Product", sensitivity: "internal", environment: "workspace", description: "Approved product definitions and project knowledge." });
  const sourceCodeAsset = ensureAsset({ name: "Source Code Repository", type: "source_code", owner: "Engineering", sensitivity: "internal", environment: "development", workspacePath: ".", description: "Application source code in the assigned project scope." });
  if (!sourceCodeAsset.workspacePath) {
    store.update((state) => {
      const asset = state.assets.find((item) => item.id === sourceCodeAsset.id);
      if (asset) asset.workspacePath = ".";
      return state;
    });
  }
  ensureAsset({ name: "Local Runtime State", type: "runtime_data", owner: "Operations", sensitivity: "confidential", environment: "development", description: "Local goals, tasks, memory and audit data. Never uploaded to Git." });
  ensureAsset({ name: "Public GitHub Repository", type: "publishing_destination", owner: "Founder", sensitivity: "public", environment: "external", externalImpact: "high", description: "Public source-code destination. Writes require explicit authorization." });

  const ensurePolicy = (definition) => organization.list("policies").find((policy) => policy.name === definition.name) || organization.createPolicy(definition);
  ensurePolicy({ name: "Executive reads organization knowledge", employeeJobType: "ai_ceo", assetType: "document_collection", actions: ["read"], effect: "allow" });
  ensurePolicy({ name: "Product manages product knowledge", employeeJobType: "product_manager", assetType: "document_collection", actions: ["read", "create", "modify"], effect: "allow" });
  ensurePolicy({ name: "Engineering develops source code", employeeJobType: "software_engineer", assetType: "source_code", assetEnvironment: "development", actions: ["read", "modify", "execute"], effect: "allow" });
  ensurePolicy({ name: "Technical lead reviews source code", employeeJobType: "technical_lead", assetType: "source_code", actions: ["read", "modify", "execute", "approve"], effect: "allow" });
  ensurePolicy({ name: "Quality independently validates source code", employeeJobType: "quality_reviewer", assetType: "source_code", actions: ["read", "execute", "approve"], effect: "allow" });
  ensurePolicy({ name: "No employee deletes runtime state", employeeJobType: "*", assetType: "runtime_data", actions: ["delete"], effect: "deny" });
  ensurePolicy({ name: "Public publishing requires explicit grant", employeeJobType: "*", assetType: "publishing_destination", actions: ["publish", "modify"], effect: "approval_required" });
}

seed();
store.update((state) => state);
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

function serveStatic(response, name, contentType) {
  const file = fs.readFileSync(path.join(root, "..", "public", name));
  response.writeHead(200, { "content-type": contentType });
  response.end(file);
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && url.pathname === "/") return serveStatic(response, "index.html", "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/styles.css") return serveStatic(response, "styles.css", "text/css; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/app.js") return serveStatic(response, "app.js", "text/javascript; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(response, 200, { ok: true, service: "ai-organization-os", version: "0.5.0", scheduler: "running", toolCount: tools.list().length, codex: codexExecutor.status() });
    }
    if (request.method === "GET" && url.pathname === "/api/codex/status") return json(response, 200, codexExecutor.status());
    if (request.method === "GET" && parts[1] === "goals" && parts[3] === "summary") {
      return json(response, 200, organization.summarizeGoal(parts[2]));
    }
    if (request.method === "GET" && url.pathname === "/api/assets/catalog") {
      return json(response, 200, organization.authorizedAssetCatalog(url.searchParams.get("agentId"), url.searchParams.get("q") || ""));
    }
    if (request.method === "GET" && parts[1] && ["agents", "goals", "tasks", "memories", "assets", "policies"].includes(parts[1])) {
      const resource = parts[1];
      const items = resource === "memories"
        ? organization.searchMemories(url.searchParams.get("q") || "")
        : organization.list(resource).filter((item) => !url.searchParams.get("status") || item.status === url.searchParams.get("status"));
      return json(response, 200, items);
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      return json(response, 200, organization.list("events"));
    }
    if (request.method === "GET" && url.pathname === "/api/access-requests") {
      return json(response, 200, organization.list("accessRequests"));
    }
    if (request.method === "GET" && url.pathname === "/api/job-templates") {
      return json(response, 200, organization.list("jobTemplates"));
    }
    if (request.method === "GET" && url.pathname === "/api/access/effective") {
      return json(response, 200, organization.effectiveAccess(url.searchParams.get("agentId"), url.searchParams.get("assetId")));
    }
    if (request.method === "GET" && url.pathname === "/api/tools") return json(response, 200, tools.list());
    if (request.method === "POST" && url.pathname === "/api/agents") return json(response, 201, organization.createAgent(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/goals") return json(response, 201, organization.createGoal(await body(request)));
    if (request.method === "POST" && parts[1] === "goals" && parts[3] === "plan") return json(response, 201, organization.planGoal(parts[2]));
    if (request.method === "POST" && parts[1] === "goals" && parts[3] === "replan") return json(response, 201, organization.replanGoal(parts[2]));
    if (request.method === "POST" && url.pathname === "/api/tasks") return json(response, 201, organization.createTask(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/work-requests") {
      return json(response, 201, organization.createWorkRequest(await body(request), { codexAvailable: codexExecutor.status().available }));
    }
    if (request.method === "POST" && url.pathname === "/api/coding/tasks") {
      if (!codexExecutor.status().available) return json(response, 503, { error: `Codex executor unavailable: ${codexExecutor.status().reason}` });
      return json(response, 201, organization.createCodingTask(await body(request)));
    }
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "run") return json(response, 200, await organization.executeTask(parts[2]));
    if (request.method === "POST" && url.pathname === "/api/memories") return json(response, 201, organization.writeMemory(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/assets") return json(response, 201, organization.createAsset(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/job-templates/preview") {
      const input = await body(request);
      return json(response, 200, organization.previewAgentFromTemplate(input.templateId));
    }
    if (request.method === "POST" && url.pathname === "/api/job-templates") return json(response, 201, organization.createJobTemplate(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/policies/preview") return json(response, 200, organization.previewPolicy(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/policies") return json(response, 201, organization.createPolicy(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/access-requests") return json(response, 201, organization.createAccessRequest(await body(request)));
    if (request.method === "POST" && parts[1] === "access-requests" && parts[3] === "decision") {
      return json(response, 200, organization.decideAccessRequest(parts[2], await body(request)));
    }
    if (request.method === "POST" && url.pathname === "/api/access/consume") return json(response, 200, organization.consumeAccess(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/tools/execute") {
      const input = await body(request);
      const task = input.taskId ? organization.getTask(input.taskId) : null;
      const agent = input.agentId ? organization.list("agents").find((item) => item.id === input.agentId) || null : null;
      return json(response, 200, await tools.execute(input.name, input.input || {}, { organization, task, agent }));
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    const status = /required|not found|dependencies|Unknown tool|executor|evidence|authorization|identity|access scope/i.test(error.message) ? 400 : 500;
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
