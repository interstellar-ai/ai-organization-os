import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "./store.js";
import { SqliteStore } from "./sqlite-store.js";
import { Organization, Scheduler } from "./organization.js";
import { createDefaultTools } from "./tools.js";
import { CodexExecutor } from "./executors/codex.js";
import { CodeIntegrationExecutor } from "./executors/integration.js";
import { ConnectorRegistry } from "./executors/connectors.js";
import { GeneralAgentExecutor } from "./executors/general.js";
import { CeoChatExecutor } from "./executors/ceo-chat.js";
import { ExecutiveChat } from "./executive-chat.js";
import { GoalWorkflow } from "./goal-workflow.js";
import { ImprovementLoop } from "./improvement-loop.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(root, "..");
const port = Number(process.env.PORT || 3333);
const legacyStatePath = path.join(projectRoot, "data", "state.json");
const store = process.env.AI_ORG_STORE === "json"
  ? new JsonStore(legacyStatePath)
  : new SqliteStore(path.join(projectRoot, "data", "organization.sqlite"), { importJsonPath: legacyStatePath });
const organization = new Organization(store, null);
const codexExecutor = new CodexExecutor({ projectRoot });
const codeIntegrationExecutor = new CodeIntegrationExecutor({ projectRoot });
const connectors = new ConnectorRegistry();
await codexExecutor.checkAvailability();
const generalExecutor = new GeneralAgentExecutor({ runtime: codexExecutor });
const ceoChatExecutor = new CeoChatExecutor({ runtime: codexExecutor });
const tools = createDefaultTools(organization, { codexExecutor, generalExecutor });
organization.tools = tools;
const workflow = new GoalWorkflow(organization, generalExecutor, () => ({ generalAvailable: generalExecutor.status().available, codexAvailable: codexExecutor.status().available }));
workflow.registerTool();
const improvementLoop = new ImprovementLoop(organization);
improvementLoop.scan();
const executiveChat = new ExecutiveChat(organization, ceoChatExecutor, improvementLoop);
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
      content: "The Founder must approve the exact payload for high-impact external actions before a scoped connector can run.",
      tags: ["policy", "safety"],
      source: "seed"
    });
  }

  const ensureAsset = (definition) => organization.list("assets").find((asset) => asset.name === definition.name) || organization.createAsset(definition);
  ensureAsset({ name: "Product Knowledge Base", type: "document_collection", owner: "Product", sensitivity: "internal", environment: "workspace", description: "Approved product definitions and project knowledge." });
  const sourceCodeAsset = ensureAsset({ name: "Source Code Repository", type: "source_code", owner: "Engineering", sensitivity: "internal", environment: "development", workspacePath: ".", integrationTestCommand: ["npm", "test"], description: "Application source code in the assigned project scope." });
  if (!sourceCodeAsset.workspacePath || !sourceCodeAsset.integrationTestCommand) {
    store.update((state) => {
      const asset = state.assets.find((item) => item.id === sourceCodeAsset.id);
      if (asset) {
        asset.workspacePath ||= ".";
        asset.integrationTestCommand ||= ["npm", "test"];
      }
      return state;
    });
  }
  ensureAsset({ name: "Local Runtime State", type: "runtime_data", owner: "Operations", sensitivity: "confidential", environment: "development", description: "Local goals, tasks, memory and audit data. Never uploaded to Git." });
  ensureAsset({ name: "Public GitHub Repository", type: "publishing_destination", owner: "Founder", sensitivity: "public", environment: "external", externalImpact: "high", description: "Public source-code destination. Writes require explicit authorization." });
  ensureAsset({ name: "Web Research Connector", type: "external_connector", connectorType: "web_research", owner: "Research", sensitivity: "public", environment: "external", externalImpact: "medium", description: "Read explicit public HTTPS sources or use configured Brave Search." });
  ensureAsset({ name: "Email Connector", type: "external_connector", connectorType: "email", owner: "Founder", sensitivity: "confidential", environment: "external", externalImpact: "high", description: "Send an exact Founder-approved message through Resend." });
  ensureAsset({ name: "CRM Connector", type: "external_connector", connectorType: "crm", owner: "Sales", sensitivity: "confidential", environment: "external", externalImpact: "high", description: "Create exact Founder-approved HubSpot records." });
  ensureAsset({ name: "Publishing Connector", type: "external_connector", connectorType: "publishing", owner: "Founder", sensitivity: "public", environment: "external", externalImpact: "critical", description: "Publish exact Founder-approved content through a configured HTTPS webhook." });

  const ensurePolicy = (definition) => organization.list("policies").find((policy) => policy.name === definition.name) || organization.createPolicy(definition);
  ensureAsset({ name: "General Agent Service", type: "agent_runtime", owner: "Operations", environment: "development",
    tags: ["general-executor"], description: "Execute document work using the supplied brief. No organizational search or external actions." });
  for (const jobType of ["ai_ceo", "product_manager", "project_manager", "product_designer", "operations_lead", "quality_reviewer"]) {
    ensurePolicy({ name: `${jobType} uses General Agent Service`, employeeJobType: jobType, assetType: "agent_runtime",
      assetEnvironment: "development", actions: ["execute"], effect: "allow" });
  }
  ensurePolicy({ name: "Executive reads organization knowledge", employeeJobType: "ai_ceo", assetType: "document_collection", actions: ["read"], effect: "allow" });
  ensurePolicy({ name: "Product manages product knowledge", employeeJobType: "product_manager", assetType: "document_collection", actions: ["read", "create", "modify"], effect: "allow" });
  ensurePolicy({ name: "Engineering develops source code", employeeJobType: "software_engineer", assetType: "source_code", assetEnvironment: "development", actions: ["read", "modify", "execute"], effect: "allow" });
  ensurePolicy({ name: "Technical lead reviews source code", employeeJobType: "technical_lead", assetType: "source_code", actions: ["read", "modify", "execute", "approve"], effect: "allow" });
  ensurePolicy({ name: "Quality independently validates source code", employeeJobType: "quality_reviewer", assetType: "source_code", actions: ["read", "execute", "approve"], effect: "allow" });
  ensurePolicy({ name: "No employee deletes runtime state", employeeJobType: "*", assetType: "runtime_data", actions: ["delete"], effect: "deny" });
  ensurePolicy({ name: "Public publishing requires explicit grant", employeeJobType: "*", assetType: "publishing_destination", actions: ["publish", "modify"], effect: "approval_required" });
  ensurePolicy({ name: "External connectors require exact Founder approval", employeeJobType: "*", assetType: "external_connector", actions: ["read", "send", "create", "publish"], effect: "approval_required" });
}

seed();
store.update((state) => state);
organization.recoverInterruptedTasks();
organization.recoverInterruptedExternalActions();
scheduler.start();
const improvementTimer = setInterval(() => improvementLoop.scan(), 5000);
improvementTimer.unref();

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
    if (request.method === "POST") {
      const origin = request.headers.origin;
      if (origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) return json(response, 403, { error: "Origin is not allowed" });
      if (!request.headers["content-type"]?.startsWith("application/json")) return json(response, 415, { error: "JSON request body is required" });
    }
    if (request.method === "GET" && url.pathname === "/") return serveStatic(response, "index.html", "text/html; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/styles.css") return serveStatic(response, "styles.css", "text/css; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/app.js") return serveStatic(response, "app.js", "text/javascript; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/goal-ui.js") return serveStatic(response, "goal-ui.js", "text/javascript; charset=utf-8");
    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(response, 200, { ok: true, service: "ai-organization-os", version: "0.9.0", storage: store instanceof SqliteStore ? "sqlite-wal" : "json",
        scheduler: "durable-leased", toolCount: tools.list().length, codex: codexExecutor.status(), generalAgent: generalExecutor.status(), ceoChat: ceoChatExecutor.status(), connectors: connectors.list(), continuousImprovement: improvementLoop.summary() });
    }
    if (request.method === "GET" && url.pathname === "/api/codex/status") return json(response, 200, codexExecutor.status());
    if (request.method === "GET" && url.pathname === "/api/ceo/conversation") return json(response, 200, executiveChat.conversation());
    if (request.method === "GET" && parts[1] === "goals" && parts[3] === "summary") {
      return json(response, 200, organization.summarizeGoal(parts[2]));
    }
    if (request.method === "GET" && url.pathname === "/api/projects") return json(response, 200, organization.list("projects").map((p) => workflow.summarizeProject(p.id)));
    if (request.method === "GET" && url.pathname === "/api/assets/catalog") {
      return json(response, 200, organization.authorizedAssetCatalog(url.searchParams.get("agentId"), url.searchParams.get("q") || ""));
    }
    if (request.method === "GET" && parts[1] === "tasks" && parts[3] === "artifacts" && parts.length === 5) {
      const task = organization.getTask(parts[2]);
      if (!/^\d+$/.test(parts[4])) return json(response, 404, { error: "Artifact not found" });
      const artifact = task.output?.artifacts?.[Number(parts[4])];
      if (!artifact) return json(response, 404, { error: "Artifact not found" });
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff",
        "content-disposition": `attachment; filename="${artifact.filename}"`, "cache-control": "no-store" });
      return response.end(artifact.content);
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
    if (request.method === "GET" && url.pathname === "/api/staffing-requests") return json(response, 200, organization.list("staffingRequests"));
    if (request.method === "GET" && url.pathname === "/api/founder-actions") return json(response, 200, organization.list("founderActions"));
    if (request.method === "GET" && url.pathname === "/api/integration-requests") return json(response, 200, organization.list("integrationRequests"));
    if (request.method === "GET" && url.pathname === "/api/external-actions") return json(response, 200, organization.list("externalActions"));
    if (request.method === "GET" && url.pathname === "/api/connectors") return json(response, 200, connectors.list());
    if (request.method === "GET" && url.pathname === "/api/improvement-signals") return json(response, 200, improvementLoop.scan().signals);
    if (request.method === "GET" && url.pathname === "/api/job-templates") {
      return json(response, 200, organization.list("jobTemplates"));
    }
    if (request.method === "GET" && url.pathname === "/api/access/effective") {
      return json(response, 200, organization.effectiveAccess(url.searchParams.get("agentId"), url.searchParams.get("assetId")));
    }
    if (request.method === "GET" && url.pathname === "/api/tools") return json(response, 200, tools.list());
    if (request.method === "POST" && url.pathname === "/api/agents") return json(response, 201, organization.createAgent(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/ceo/conversation/messages") return json(response, 201, await executiveChat.send(await body(request)));
    if (request.method === "POST" && parts[1] === "ceo" && parts[2] === "conversation" && parts[3] === "messages" && parts[5] === "create-goal") {
      return json(response, 201, executiveChat.createGoalFromSuggestion(parts[4]));
    }
    if (request.method === "POST" && url.pathname === "/api/goals") return json(response, 201, organization.createGoal(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/improvement-signals") return json(response, 201, improvementLoop.report(await body(request)));
    if (request.method === "POST" && parts[1] === "improvement-signals" && parts[3] === "create-goal") {
      const result = improvementLoop.createGoal(parts[2]);
      return json(response, 201, { ...result, planningTask: workflow.startPlanning(result.goal.id, {}) });
    }
    if (request.method === "POST" && parts[1] === "improvement-signals" && parts[3] === "link-goal") return json(response, 200, improvementLoop.linkGoal(parts[2], await body(request)));
    if (request.method === "POST" && parts[1] === "improvement-signals" && parts[3] === "dismiss") return json(response, 200, improvementLoop.dismiss(parts[2], await body(request)));
    if (request.method === "POST" && parts[1] === "improvement-signals" && parts[3] === "resolve") return json(response, 200, improvementLoop.resolve(parts[2], await body(request)));
    if (request.method === "POST" && parts[1] === "goals" && ["plan", "replan"].includes(parts[3])) return json(response, 201, workflow.startPlanning(parts[2], await body(request)));
    if (request.method === "POST" && parts[1] === "goals" && parts[3] === "approve-plan") return json(response, 200, workflow.approvePlan(parts[2], await body(request)));
    if (request.method === "POST" && parts[1] === "goals" && parts[3] === "extend-budget") return json(response, 200, workflow.extendBudget(parts[2], await body(request)));
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "configure-code") return json(response, 200, workflow.configureCodeTask(parts[2], await body(request)));
    if (request.method === "POST" && url.pathname === "/api/tasks") {
      const input = await body(request);
      const reserved = ["planId", "projectId", "taskKind", "reviewTargetTaskId", "reviewRound", "autoRevisionCount", "autoRetryCount", "founderReviewRequired", "requestSource"];
      if (reserved.some((field) => Object.hasOwn(input, field))) return json(response, 400, { error: "System-managed task fields are not accepted by this endpoint" });
      return json(response, 201, organization.createTask(input));
    }
    if (request.method === "POST" && url.pathname === "/api/work-requests") {
      return json(response, 201, organization.createWorkRequest(await body(request), { codexAvailable: codexExecutor.status().available, generalAvailable: generalExecutor.status().available }));
    }
    if (request.method === "POST" && url.pathname === "/api/coding/tasks") {
      if (!codexExecutor.status().available) return json(response, 503, { error: `Codex executor unavailable: ${codexExecutor.status().reason}` });
      return json(response, 201, organization.createCodingTask(await body(request)));
    }
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "run") return json(response, 200, await organization.executeTask(parts[2]));
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "feedback") {
      return json(response, 200, organization.resumeGeneralTask(parts[2], await body(request), { generalAvailable: generalExecutor.status().available }));
    }
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "retry-routine-review") {
      return json(response, 200, workflow.retryRoutineReview(parts[2]));
    }
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "resolve-routine-stop") {
      return json(response, 200, workflow.resolveRoutineStop(parts[2]));
    }
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "accept") return json(response, 200, organization.acceptTask(parts[2]));
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "request-integration") return json(response, 201, organization.requestCodeIntegration(parts[2]));
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "configure-external") return json(response, 201, organization.requestExternalAction(parts[2], await body(request), connectors));
    if (request.method === "POST" && parts[1] === "tasks" && parts[3] === "manual-external-result") {
      return json(response, 200, organization.recordManualExternalResult(parts[2], await body(request)));
    }
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
    if (request.method === "POST" && parts[1] === "staffing-requests" && parts[3] === "decision") {
      return json(response, 200, workflow.decideStaffingRequest(parts[2], await body(request)));
    }
    if (request.method === "POST" && parts[1] === "founder-actions" && parts[3] === "complete") {
      return json(response, 200, organization.completeFounderAction(parts[2], await body(request), connectors));
    }
    if (request.method === "POST" && parts[1] === "founder-actions" && parts[3] === "unavailable") {
      return json(response, 200, organization.recordFounderRouteUnavailable(parts[2], await body(request)));
    }
    if (request.method === "POST" && parts[1] === "founder-actions" && parts[3] === "recover") {
      return json(response, 200, organization.recoverFounderRoute(parts[2]));
    }
    if (request.method === "POST" && parts[1] === "integration-requests" && parts[3] === "decision") {
      return json(response, 200, await organization.decideCodeIntegration(parts[2], await body(request), codeIntegrationExecutor));
    }
    if (request.method === "POST" && parts[1] === "external-actions" && parts[3] === "decision") {
      return json(response, 200, await organization.decideExternalAction(parts[2], await body(request), connectors));
    }
    if (request.method === "POST" && url.pathname === "/api/access/consume") return json(response, 200, organization.consumeAccess(await body(request)));
    if (request.method === "POST" && url.pathname === "/api/tools/execute") {
      const input = await body(request);
      if (["agent.general", "goal.plan", "delivery.review"].includes(input.name)) return json(response, 400, { error: "Use a work request or goal to execute this managed tool" });
      const task = input.taskId ? organization.getTask(input.taskId) : null;
      if (task?.planId) return json(response, 400, { error: "Approved plan tasks must execute through the scheduler" });
      const agent = input.agentId ? organization.list("agents").find((item) => item.id === input.agentId) || null : null;
      return json(response, 200, await tools.execute(input.name, input.input || {}, { organization, task, agent }));
    }
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    const status = /required|not found|dependencies|Unknown tool|executor|evidence|authorization|identity|access scope|budget|model runs|controlled autonomy|selected task|cumulative|improvement signal|improvement work/i.test(error.message) ? 400 : 500;
    return json(response, status, { error: error.message });
  }
}

const server = http.createServer((request, response) => {
  route(request, response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI Organization OS running at http://localhost:${port}`);
});

const shutdown = () => {
  clearInterval(improvementTimer);
  scheduler.stop();
  server.close(() => {
    store.close?.();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
