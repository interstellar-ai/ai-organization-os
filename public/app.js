import { createGoalUI } from "./goal-ui.js";

const state = {
  health: null,
  agents: [],
  goals: [],
  projects: [],
  goalSummaries: [],
  tasks: [],
  memories: [],
  events: [],
  assets: [],
  policies: [],
  jobTemplates: [],
  accessRequests: [],
  staffingRequests: [],
  integrationRequests: [],
  externalActions: [],
  connectors: [],
  employeeView: "directory",
  accessTab: "employees",
  selectedAssetId: null,
  ceoConversation: null
};
let selectedWorkTaskId = null;
let deliveryVersion = "";

const pageTitles = {
  home: "Founder Command Center",
  goals: "Goals",
  projects: "Projects",
  employees: "Employees",
  access: "Access Control",
  approvals: "Approvals",
  knowledge: "Knowledge",
  reports: "Reports",
  audit: "Audit Trail",
  settings: "Organization Settings"
};

const api = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
})[character]);

const titleize = (value) => String(value || "—")
  .replaceAll("_", " ")
  .replace(/\b\w/g, (character) => character.toUpperCase())
  .replace(/\b(Ai|Ceo|Coo|Qa|Api|Ui|Ux)\b/g, (token) => token.toUpperCase());

const initials = (value) => String(value || "AI").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
const formatTime = (value) => value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "—";
const truncate = (value, length = 130) => String(value || "").length > length ? `${String(value).slice(0, length - 1)}…` : String(value || "");
const agentById = (id) => state.agents.find((agent) => agent.id === id);
const assetById = (id) => state.assets.find((asset) => asset.id === id);
const goalUI = createGoalUI({ state, api, escapeHtml, titleize, agentById, showPage, refreshData, toast });

function toast(message, error = false) {
  const element = document.querySelector("#toast");
  element.textContent = message;
  element.classList.toggle("error", error);
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3200);
}

function empty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setSidebarOpen(open) {
  const sidebar = document.querySelector("#sidebar");
  const backdrop = document.querySelector("#sidebarBackdrop");
  const menuButton = document.querySelector("#menuButton");
  sidebar.classList.toggle("open", open);
  backdrop.classList.toggle("open", open);
  backdrop.setAttribute("aria-hidden", String(!open));
  menuButton.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("sidebar-open", open);
}

function showPage(page) {
  document.querySelectorAll("[data-page-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.pagePanel === page));
  document.querySelectorAll("[data-page]").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  document.querySelector("#pageTitle").textContent = pageTitles[page] || titleize(page);
  setSidebarOpen(false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function metric(label, value, note) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function goalCard(goal) {
  return `<article class="goal-card" data-page-link="goals">
    <div class="goal-top"><h4>${escapeHtml(goal.title)}</h4><span class="status ${escapeHtml(goal.executionStatus)}">${escapeHtml(titleize(goal.executionStatus))}</span></div>
    <p>${escapeHtml(truncate(goal.description || "No description provided."))}</p>
    <div class="progress"><i style="width:${goal.progress.percent}%"></i></div>
    <div class="goal-meta"><span>${goal.progress.completed}/${goal.progress.total} tasks verified</span><span>${goal.evidence.length} evidence records</span></div>
  </article>`;
}

function renderCeoConversation() {
  const container = document.querySelector("#ceoConversation");
  const conversation = state.ceoConversation;
  if (!conversation) {
    container.innerHTML = empty("Loading CEO conversation…");
    return;
  }
  const messages = conversation.messages || [];
  const runtime = conversation.runtime || state.health?.ceoChat;
  const unavailable = runtime && !runtime.available;
  container.innerHTML = `${messages.length ? messages.map((message) => {
    const ceo = message.role === "ceo";
    const action = message.suggestedAction;
    const used = action?.createdGoalId;
    return `<article class="ceo-message ${ceo ? "ceo" : "founder"}"><div class="speaker ${ceo ? "ceo" : "founder"}">${ceo ? "C" : "F"}</div><div class="ceo-message-body"><div class="ceo-message-meta"><strong>${ceo ? "AI CEO" : "Founder"}</strong><span>${escapeHtml(formatTime(message.createdAt))}</span></div><p>${escapeHtml(message.content)}</p>${ceo && message.snapshotAt ? `<small>Based on the organization snapshot at ${escapeHtml(formatTime(message.snapshotAt))}.</small>` : ""}${action?.type === "propose_goal" ? `<div class="ceo-suggestion"><strong>Suggested goal: ${escapeHtml(action.title)}</strong><p>${escapeHtml(action.description)}</p>${used ? `<span>Goal created</span>` : `<button type="button" class="secondary-button" data-ceo-create-goal="${escapeHtml(message.id)}">Create goal and request CEO plan</button>`}</div>` : ""}</div></article>`;
  }).join("") : `<div class="ceo-empty"><div class="speaker ceo">C</div><div><strong>Your executive conversation is ready.</strong><p>Ask for progress, discuss a decision, or explore a new idea. The CEO will only suggest work; you remain the person who confirms it.</p></div></div>`}${unavailable ? `<p class="notice">CEO conversation is unavailable: ${escapeHtml(runtime.reason || "runtime not ready")}</p>` : ""}`;
  document.querySelector("#ceoChatSendButton").disabled = Boolean(unavailable);
}

function renderHome() {
  renderCeoConversation();
  const pending = [
    ...state.staffingRequests.filter((request) => request.status === "pending"),
    ...state.accessRequests.filter((request) => request.status === "pending"),
    ...state.integrationRequests.filter((request) => request.status === "pending"),
    ...state.externalActions.filter((request) => request.status === "pending")
  ];
  const blocked = state.tasks.filter((task) => ["blocked", "failed", "needs_input", "awaiting_review"].includes(task.status));
  const reviews = state.goalSummaries.filter((goal) => goal.executionStatus === "awaiting_review");
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const evidence = state.tasks.reduce((total, task) => total + (task.evidence?.length || 0), 0);

  document.querySelector("#metricGrid").innerHTML = [
    metric("AI employees", state.agents.length, `${new Set(state.agents.map((agent) => agent.department)).size} departments represented`),
    metric("Active goals", state.goals.filter((goal) => goal.status === "active").length, `${reviews.length} awaiting Founder review`),
    metric("Verified tasks", completed, `${evidence} evidence records attached`),
    metric("Pending approvals", pending.length, pending.length ? "Founder decision required" : "No decisions waiting")
  ].join("");

  const attention = [
    ...state.staffingRequests.filter((request) => request.status === "pending").map((request) => ({ signal: "red", title: `CEO proposes hiring ${request.proposedName}`, note: state.jobTemplates.find((template) => template.id === request.templateId)?.name || "Job template", action: "Review" })),
    ...state.accessRequests.filter((request) => request.status === "pending").map((request) => ({ signal: "red", title: `${agentById(request.requesterAgentId)?.name || "Employee"} requests ${request.action}`, note: assetById(request.assetId)?.name || "Unknown asset", action: "Approval" })),
    ...state.integrationRequests.filter((request) => request.status === "pending").map((request) => ({ signal: "red", title: "Code integration requires approval", note: `${request.changedFiles.length} changed files → ${request.targetBranch}`, action: "Review" })),
    ...state.externalActions.filter((request) => request.status === "pending").map((request) => ({ signal: "red", title: `${titleize(request.connectorType)} action requires approval`, note: state.tasks.find((task) => task.id === request.taskId)?.title || "External work", action: "Review" })),
    ...blocked.slice(0, 3).map((task) => ({ signal: "red", title: task.title, note: task.blockedReason || task.error || task.nextAction || "Execution needs attention", action: task.status === "awaiting_review" ? "Review" : task.status === "needs_input" ? "Reply" : "Blocked" })),
    ...reviews.slice(0, 3).map((goal) => ({ signal: "", title: goal.title, note: `${goal.progress.completed} tasks completed with evidence`, action: "Review" }))
  ].slice(0, 6);
  document.querySelector("#attentionList").innerHTML = attention.length
    ? attention.map((item) => `<div class="attention-item"><i class="attention-signal ${item.signal}"></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.note)}</span></div><b>${escapeHtml(item.action)}</b></div>`).join("")
    : `<div class="attention-item"><i class="attention-signal green"></i><div><strong>No urgent decisions</strong><span>The organization has no pending approval or blocked workflow.</span></div><b>Clear</b></div>`;
  document.querySelector("#homeGoalList").innerHTML = state.goalSummaries.length
    ? state.goalSummaries.slice().reverse().slice(0, 4).map(goalCard).join("")
    : empty("No goals yet. Start by talking with the AI CEO above.");
}

function renderGoals() { goalUI.renderGoals(); }

function renderProjects() {
  const codex = state.health?.codex || { available: false, reason: "Codex status is unavailable" };
  const statusBadge = document.querySelector("#codexStatusBadge");
  statusBadge.textContent = codex.available ? "AI employees ready" : "AI runtime unavailable";
  statusBadge.classList.toggle("warning", !codex.available);
  document.querySelector("#executorRuntimeNotice").innerHTML = codex.available
    ? `<strong>Work, review and controlled action</strong><span>Employees can deliver documents and isolated code changes. Accepted code can enter a tested integration branch after approval. Research, email, CRM and publishing use separately configured connectors and exact-payload approval.</span>`
    : `<strong>General intake is ready; execution is limited</strong><span>Requests can be classified and assigned, but model-backed work remains blocked until an approved executor is connected. ${escapeHtml(codex.reason || "Codex is not available.")}</span>`;

  const employees = [...state.agents].sort((left, right) => left.department.localeCompare(right.department) || left.name.localeCompare(right.name));
  const repositories = state.assets.filter((asset) => asset.type === "source_code" && asset.workspacePath);
  const agentSelect = document.querySelector("#workAgentSelect");
  const assetSelect = document.querySelector("#workAssetSelect");
  const goalSelect = document.querySelector("#workGoalSelect");
  const selectedAgent = agentSelect.value;
  const selectedAsset = assetSelect.value;
  const selectedGoal = goalSelect.value;
  agentSelect.innerHTML = `<option value="">Auto assign</option>${employees.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)} · ${escapeHtml(agent.department)}</option>`).join("")}`;
  assetSelect.innerHTML = `<option value="">Auto select when unambiguous</option>${repositories.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)}</option>`).join("")}`;
  goalSelect.innerHTML = `<option value="">No related goal</option>${state.goals.map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.title)}</option>`).join("")}`;
  if (employees.some((agent) => agent.id === selectedAgent)) agentSelect.value = selectedAgent;
  if (repositories.some((asset) => asset.id === selectedAsset)) assetSelect.value = selectedAsset;
  if (state.goals.some((goal) => goal.id === selectedGoal)) goalSelect.value = selectedGoal;

  const workRequests = state.tasks.filter((task) => task.requestSource === "founder_work_request" || task.toolName === "code.codex").slice().reverse();
  document.querySelector("#workRequestList").innerHTML = workRequests.length ? workRequests.map((task) => {
    const agent = agentById(task.assignedAgentId);
    const goal = state.goals.find((item) => item.id === task.goalId);
    const changedFiles = task.output?.changedFiles || [];
    const result = ["completed", "awaiting_review", "needs_input"].includes(task.status)
      ? task.output?.summary || "The assigned executor completed this work order."
      : task.error || task.blockedReason || task.nextAction || (task.status === "running" ? "The assigned employee is working with an approved executor." : "Waiting for the scheduler.");
    const typeLabel = task.routing?.typeLabel || (task.workType ? titleize(task.workType) : "Software development");
    const executor = task.executor || task.routing?.requiredExecutor || "Executor not selected";
    return `<article class="project-card"><div class="goal-top"><div><span class="section-kicker">${escapeHtml(typeLabel)}</span><h3>${escapeHtml(task.title)}</h3></div><span class="status ${escapeHtml(task.status)}">${escapeHtml(titleize(task.status))}</span></div><p>${escapeHtml(result)}</p>${task.deliverable ? `<div class="work-deliverable"><span>Expected deliverable</span><strong>${escapeHtml(task.deliverable)}</strong></div>` : ""}<div class="goal-meta"><span>${escapeHtml(agent?.name || "Unassigned")}</span><span>${escapeHtml(goal?.title || "Independent work")}</span><span>${escapeHtml(executor)}</span><span>${task.evidence?.length || 0} evidence records</span></div>${changedFiles.length ? `<div class="memory-tags">${changedFiles.map((file) => `<span class="tag">${escapeHtml(file)}</span>`).join("")}</div>` : ""}<div class="brief-actions"><button class="secondary-button" data-work-task="${escapeHtml(task.id)}">Open work and delivery</button></div></article>`;
  }).join("") : empty("No Founder work request has been created yet.");

  goalUI.renderProjects();
  renderWorkDelivery();
}

function renderWorkDelivery() {
  const task = state.tasks.find((item) => item.id === selectedWorkTaskId);
  document.querySelector("#workDeliveryPanel").classList.toggle("hidden", !task);
  if (!task) { deliveryVersion = ""; return; }
  const version = JSON.stringify({ task, integration: state.integrationRequests.filter((item) => item.taskId === task.id),
    external: state.externalActions.filter((item) => item.taskId === task.id), connectors: state.connectors });
  if (version === deliveryVersion) return;
  deliveryVersion = version;
  const output = task.output || {};
  const list = (title, items = []) => items.length ? `<h4>${title}</h4><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  const files = (artifacts = [], download = false) => artifacts.map((artifact, index) => `<details class="delivery-file"><summary>${escapeHtml(artifact.filename)}${download ? ` · ${artifact.bytes} bytes` : ""}</summary><pre>${escapeHtml(artifact.content)}</pre>${download ? `<a class="text-button" href="/api/tasks/${encodeURIComponent(task.id)}/artifacts/${index}" download>Download file</a>` : ""}</details>`).join("");
  document.querySelector("#workDeliveryContent").innerHTML = `<h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(output.summary || task.description)}</p><p>${escapeHtml(task.error || task.blockedReason || task.nextAction || "")}</p>${list("Questions from the employee", output.questions)}${list("Limitations", output.limitations)}${files(output.artifacts, true)}${(task.messages || []).map((message) => `<blockquote><strong>${message.role === "quality_reviewer" ? "Independent reviewer" : "Founder"}</strong><p>${escapeHtml(message.content)}</p></blockquote>`).join("")}<details><summary>Execution history (${task.executionHistory?.length || 0})</summary>${(task.executionHistory || []).map((run) => `<h4>Attempt ${run.attempt} · ${escapeHtml(titleize(run.status))}</h4><p>${escapeHtml(run.output?.summary || run.error || "No delivery")}</p>${files(run.output?.artifacts)}`).join("")}</details>`;
  const canReply = task.taskKind !== "goal_planning" && task.executionMode !== "external" && task.workType !== "software_development" && ["blocked", "failed", "needs_input", "awaiting_review"].includes(task.status);
  const canAcceptCode = task.workType === "software_development" && task.status === "awaiting_review";
  document.querySelector("#workFeedbackForm").classList.toggle("hidden", !canReply && !canAcceptCode);
  document.querySelector("#workFeedbackMessage").closest("label").classList.toggle("hidden", !canReply);
  document.querySelector("#sendWorkFeedback").classList.toggle("hidden", !canReply);
  document.querySelector("#acceptWorkButton").classList.toggle("hidden", task.status !== "awaiting_review");
  if (task.executionMode === "code" || task.workType === "software_development") {
    const assets = state.assets.filter((a) => a.type === "source_code" && a.workspacePath);
    const integration = state.integrationRequests.find((item) => item.id === task.integrationRequestId)
      || state.integrationRequests.find((item) => item.taskId === task.id);
    const integrationNotice = integration
      ? `<section class="action-preview"><div class="goal-top"><strong>Code integration · ${escapeHtml(titleize(integration.status))}</strong><span class="status ${escapeHtml(integration.status)}">${escapeHtml(titleize(integration.status))}</span></div><p>Target: ${escapeHtml(integration.targetBranch)}. This workflow never pushes, merges into main or deploys.</p>${integration.result ? `<p>Tests: ${escapeHtml(titleize(integration.result.test?.status))} · Commit ${escapeHtml(integration.result.integrationCommit?.slice(0, 12))}</p>` : ""}${integration.error ? `<p>${escapeHtml(integration.error)}</p>` : ""}${["failed", "rejected"].includes(integration.status) ? `<form data-request-integration="${escapeHtml(task.id)}"><button class="secondary-button" type="submit">Create a new integration request</button></form>` : ""}</section>`
      : "";
    document.querySelector("#workDeliveryContent").insertAdjacentHTML("beforeend", `<p class="notice">Code changes remain in an isolated worktree until you accept the delivery and separately approve integration. Successful integration targets codex/integration only.</p>${list("Changed files", task.output?.changedFiles)}${integrationNotice}${["blocked", "failed"].includes(task.status) ? `<form data-configure-code="${escapeHtml(task.id)}"><label>Protected codebase<select name="assetId" required><option value="">Select explicitly</option>${assets.map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join("")}</select></label><button type="submit" class="secondary-button">Use this codebase and queue task</button></form>` : ""}`);
  }
  if (task.executionMode === "external") renderExternalConfiguration(task);
  if (task.dependsOn?.length) document.querySelector("#workDeliveryContent").insertAdjacentHTML("beforeend", list("Depends on accepted work", task.dependsOn.map((id) => { const dep = state.tasks.find((t) => t.id === id); return `${dep?.title || "Missing task"}: ${titleize(dep?.status)}`; })));
  document.querySelector("#sendWorkFeedback").textContent = ["blocked", "failed"].includes(task.status) ? "Retry with this brief" : "Send and continue";
}

function renderExternalConfiguration(task) {
  const panel = document.querySelector("#workDeliveryContent");
  const current = state.externalActions.find((item) => item.id === task.externalActionId)
    || state.externalActions.find((item) => item.taskId === task.id && !["rejected", "failed"].includes(item.status));
  if (current) {
    panel.insertAdjacentHTML("beforeend", `<section class="action-preview"><div class="goal-top"><strong>${escapeHtml(titleize(current.connectorType))} action</strong><span class="status ${escapeHtml(current.status)}">${escapeHtml(titleize(current.status))}</span></div><pre>${escapeHtml(JSON.stringify(current.preview, null, 2))}</pre><p>${escapeHtml(current.result?.summary || current.error || task.nextAction || "Waiting for a Founder decision.")}</p></section>`);
    return;
  }
  if (!["blocked", "failed"].includes(task.status)) return;
  const asset = (type) => state.assets.find((item) => item.type === "external_connector" && item.connectorType === type);
  const status = (type) => state.connectors.find((item) => item.type === type);
  const badge = (type) => status(type)?.configured ? "Ready" : "Needs server configuration";
  panel.insertAdjacentHTML("beforeend", `<section class="external-config"><h4>Choose an external tool</h4><p>Submitting creates an exact action preview. Nothing is sent until you approve that preview in Approvals.</p>
    ${asset("web_research") ? `<details><summary>Live web research · ${escapeHtml(badge("web_research"))}</summary><form data-configure-external="${escapeHtml(task.id)}" data-connector="web_research"><input type="hidden" name="assetId" value="${escapeHtml(asset("web_research").id)}" /><label>Research question<input name="query" placeholder="What should the employee investigate?" /></label><label>Public source URLs<textarea name="urls" placeholder="One HTTPS URL per line. Optional when web search is configured."></textarea></label><button class="secondary-button" type="submit">Prepare research action</button></form></details>` : ""}
    ${asset("email") ? `<details><summary>Email · ${escapeHtml(badge("email"))}</summary><form data-configure-external="${escapeHtml(task.id)}" data-connector="email"><input type="hidden" name="assetId" value="${escapeHtml(asset("email").id)}" /><label>Recipient<input name="to" type="email" required /></label><label>Subject<input name="subject" required /></label><label>Message<textarea name="text" required></textarea></label><button class="secondary-button" type="submit">Prepare email approval</button></form></details>` : ""}
    ${asset("crm") ? `<details><summary>CRM record · ${escapeHtml(badge("crm"))}</summary><form data-configure-external="${escapeHtml(task.id)}" data-connector="crm"><input type="hidden" name="assetId" value="${escapeHtml(asset("crm").id)}" /><label>Record type<select name="objectType"><option value="contacts">Contact</option><option value="companies">Company</option><option value="deals">Deal</option></select></label><label>Primary name<input name="primaryName" required placeholder="Person, company or deal name" /></label><label>Email, if applicable<input name="email" type="email" /></label><button class="secondary-button" type="submit">Prepare CRM approval</button></form></details>` : ""}
    ${asset("publishing") ? `<details><summary>Publishing · ${escapeHtml(badge("publishing"))}</summary><form data-configure-external="${escapeHtml(task.id)}" data-connector="publishing"><input type="hidden" name="assetId" value="${escapeHtml(asset("publishing").id)}" /><label>Destination<input name="destination" required placeholder="Approved channel or site" /></label><label>Title<input name="title" /></label><label>Content<textarea name="content" required></textarea></label><button class="secondary-button" type="submit">Prepare publishing approval</button></form></details>` : ""}
  </section>`);
}

function employeeStatus(agent) {
  const tasks = state.tasks.filter((task) => task.assignedAgentId === agent.id);
  if (tasks.some((task) => ["blocked", "failed"].includes(task.status))) return "blocked";
  if (tasks.some((task) => task.status === "needs_input")) return "needs_input";
  if (tasks.some((task) => ["planned", "pending", "running"].includes(task.status))) return "working";
  if (tasks.some((task) => task.status === "awaiting_review")) return "awaiting_review";
  return agent.status || "available";
}

function employeeWork(agent) {
  const active = state.tasks.find((task) => task.assignedAgentId === agent.id && ["running", "pending", "planned", "blocked", "failed", "needs_input", "awaiting_review"].includes(task.status));
  const recent = state.tasks.filter((task) => task.assignedAgentId === agent.id && task.status === "completed").at(-1);
  return active?.title || recent?.title || "Available for assignment";
}

function employeeCard(agent) {
  return `<article class="employee-card" data-agent-id="${escapeHtml(agent.id)}"><div class="employee-top"><div class="employee-avatar">${escapeHtml(initials(agent.name))}</div><div><h3>${escapeHtml(agent.name)}</h3><div class="employee-role">${escapeHtml(titleize(agent.jobType))}</div></div><span class="status ${escapeHtml(employeeStatus(agent))}">${escapeHtml(titleize(employeeStatus(agent)))}</span></div><p>${escapeHtml(agent.description || "No role charter provided.")}</p><div class="employee-work"><span>Current or latest work</span><strong>${escapeHtml(employeeWork(agent))}</strong></div><div class="employee-meta"><span>${escapeHtml(agent.department)}</span><span>${agent.capabilities?.length || 0} capabilities</span></div></article>`;
}

function renderEmployees() {
  const query = document.querySelector("#employeeSearch").value.trim().toLowerCase();
  const department = document.querySelector("#departmentFilter").value;
  const departments = [...new Set(state.agents.map((agent) => agent.department).filter(Boolean))].sort();
  const departmentSelect = document.querySelector("#departmentFilter");
  const previous = departmentSelect.value;
  departmentSelect.innerHTML = `<option value="">All departments</option>${departments.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("")}`;
  departmentSelect.value = departments.includes(previous) ? previous : "";
  const filtered = state.agents.filter((agent) => (!departmentSelect.value || agent.department === departmentSelect.value) && (!query || [agent.name, agent.jobType, agent.department, agent.description].join(" ").toLowerCase().includes(query)));
  document.querySelector("#employeeDirectory").innerHTML = filtered.length ? filtered.map(employeeCard).join("") : empty("No employees match the current filters.");

  const roots = state.agents.filter((agent) => !agent.managerId || !agentById(agent.managerId));
  const depth = (agent) => {
    let current = agent;
    let value = 1;
    const seen = new Set();
    while (current.managerId && agentById(current.managerId) && !seen.has(current.managerId)) {
      seen.add(current.managerId);
      current = agentById(current.managerId);
      value += 1;
    }
    return value;
  };
  const maxDepth = Math.max(1, ...state.agents.map(depth));
  const levels = [`<div class="org-level"><div class="org-node"><strong>Founder</strong><span>Direction · boundaries · approval</span></div></div>`];
  for (let level = 1; level <= maxDepth; level += 1) {
    const agents = state.agents.filter((agent) => depth(agent) === level);
    if (agents.length) levels.push(`<div class="org-level">${agents.map((agent) => `<div class="org-node" data-agent-id="${escapeHtml(agent.id)}"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(titleize(agent.jobType))} · ${escapeHtml(agent.department)}</span></div>`).join("")}</div>`);
  }
  document.querySelector("#organizationChart").innerHTML = levels.join("");
  document.querySelector("#employeeDirectory").classList.toggle("hidden", state.employeeView !== "directory");
  document.querySelector("#organizationChart").classList.toggle("hidden", state.employeeView !== "organization");
  populateHireSelectors();
}

function populateHireSelectors() {
  const templateSelect = document.querySelector("#hireTemplateSelect");
  const managerSelect = document.querySelector("#hireManagerSelect");
  const previousTemplate = templateSelect.value;
  const previousManager = managerSelect.value;
  templateSelect.innerHTML = `<option value="">Choose a job template</option>${state.jobTemplates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)} · ${escapeHtml(template.department)}</option>`).join("")}`;
  managerSelect.innerHTML = `<option value="">Founder</option>${state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)} · ${escapeHtml(titleize(agent.jobType))}</option>`).join("")}`;
  templateSelect.value = state.jobTemplates.some((template) => template.id === previousTemplate) ? previousTemplate : "";
  managerSelect.value = state.agents.some((agent) => agent.id === previousManager) ? previousManager : "";
}

async function renderHirePreview() {
  const templateId = document.querySelector("#hireTemplateSelect").value;
  const previewElement = document.querySelector("#hirePreview");
  if (!templateId) {
    previewElement.innerHTML = empty("Choose a job template to preview the employee role and default access.");
    return;
  }
  previewElement.innerHTML = empty("Calculating inherited role and access…");
  try {
    const preview = await api("/api/job-templates/preview", { method: "POST", body: JSON.stringify({ templateId }) });
    const template = preview.template;
    const affectedAssets = preview.access.filter((entry) => entry.actions.some((permission) => permission.effect !== "not_granted"));
    previewElement.innerHTML = `<div class="hire-preview-header"><div><span class="section-kicker">EMPLOYEE PREVIEW</span><h3>${escapeHtml(template.name)}</h3><p>${escapeHtml(template.description || "Reusable employee role definition.")}</p></div><span class="status">${escapeHtml(template.department)}</span></div><div class="detail-grid"><div class="detail-field"><span>Job type</span><strong>${escapeHtml(titleize(template.jobType))}</strong></div><div class="detail-field"><span>Role source</span><strong>Inherited from template</strong></div></div><div class="preview-section"><h4>Responsibilities</h4>${template.responsibilities?.length ? `<ul>${template.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>No responsibilities configured.</p>`}</div><div class="preview-section"><h4>Capabilities</h4><div class="action-list">${(template.capabilities || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "None"}</div></div><div class="access-summary"><div><strong>${preview.summary.allowed}</strong><span>Allowed</span></div><div><strong>${preview.summary.approval_required}</strong><span>Need approval</span></div><div><strong>${preview.summary.denied}</strong><span>Denied</span></div><div><strong>${preview.matchedPolicies.length}</strong><span>Policy rules</span></div></div><div class="preview-section"><h4>Default access by asset</h4>${affectedAssets.length ? affectedAssets.map((entry) => `<div class="preview-access-row"><span>${escapeHtml(entry.asset.name)}</span><div>${entry.actions.filter((permission) => permission.effect !== "not_granted").map((permission) => `<b class="action-chip ${escapeHtml(permission.effect)}">${escapeHtml(permission.action)}</b>`).join("")}</div></div>`).join("") : `<p>No policy grants or restrictions match this role. Access will be denied by default.</p>`}</div>`;
  } catch (error) {
    previewElement.innerHTML = empty(error.message);
  }
}

function openHireForm(templateId = "") {
  showPage("employees");
  const form = document.querySelector("#hireEmployeeForm");
  form.classList.remove("hidden");
  populateHireSelectors();
  document.querySelector("#hireTemplateSelect").value = state.jobTemplates.some((template) => template.id === templateId) ? templateId : "";
  renderHirePreview();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openEmployee(agentId) {
  const agent = agentById(agentId);
  if (!agent) return;
  const manager = agentById(agent.managerId);
  const tasks = state.tasks.filter((task) => task.assignedAgentId === agent.id);
  const completed = tasks.filter((task) => task.status === "completed");
  const evidence = completed.reduce((count, task) => count + (task.evidence?.length || 0), 0);
  const template = state.jobTemplates.find((item) => item.id === agent.templateId);
  document.querySelector("#employeeDetail").innerHTML = `<div class="drawer-profile"><div class="employee-avatar">${escapeHtml(initials(agent.name))}</div><div><h2>${escapeHtml(agent.name)}</h2><div class="employee-role">${escapeHtml(titleize(agent.jobType))}</div><div class="employee-meta"><span>${escapeHtml(agent.department)}</span><span>${escapeHtml(titleize(employeeStatus(agent)))}</span></div></div></div><div class="drawer-section"><h4>Role source</h4><div class="setting-row"><span>Job template</span><strong>${escapeHtml(template?.name || "Custom role")}</strong></div><p>${template ? "Role, department, responsibilities and capabilities were inherited when this employee was hired." : "This employee was created without a job template."}</p></div><div class="drawer-section"><h4>Role charter</h4><p>${escapeHtml(agent.description || "No role charter provided.")}</p></div><div class="drawer-section"><h4>Organization</h4><div class="detail-grid"><div class="detail-field"><span>Reports to</span><strong>${escapeHtml(manager?.name || "Founder")}</strong></div><div class="detail-field"><span>Department</span><strong>${escapeHtml(agent.department)}</strong></div><div class="detail-field"><span>Completed work</span><strong>${completed.length}</strong></div><div class="detail-field"><span>Evidence</span><strong>${evidence}</strong></div></div></div><div class="drawer-section"><h4>Responsibilities</h4>${agent.responsibilities?.length ? `<ul>${agent.responsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>No responsibilities recorded.</p>`}</div><div class="drawer-section"><h4>Capabilities</h4><div class="action-list">${(agent.capabilities || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("") || "None"}</div></div><div class="drawer-section"><h4>Current or latest work</h4><p>${escapeHtml(employeeWork(agent))}</p></div><button class="secondary-button" data-open-access="${escapeHtml(agent.id)}">View effective access</button>`;
  const drawer = document.querySelector("#employeeDrawer");
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
}

function closeDrawer() {
  const drawer = document.querySelector("#employeeDrawer");
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
}

function populateAccessSelectors() {
  const accessSelect = document.querySelector("#accessEmployeeSelect");
  const previousEmployee = accessSelect.value;
  const employeeOptions = state.agents.map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)} · ${escapeHtml(titleize(agent.jobType))}</option>`).join("");
  accessSelect.innerHTML = employeeOptions;
  accessSelect.value = state.agents.some((agent) => agent.id === previousEmployee) ? previousEmployee : state.agents[0]?.id || "";
  document.querySelector("#requestAgentSelect").innerHTML = employeeOptions;
  document.querySelector("#requestAssetSelect").innerHTML = state.assets.map((asset) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.name)} · ${escapeHtml(titleize(asset.sensitivity))}</option>`).join("");
}

async function renderEffectiveAccess() {
  const select = document.querySelector("#accessEmployeeSelect");
  const agent = agentById(select.value);
  if (!agent) {
    document.querySelector("#effectiveAccessList").innerHTML = empty("Create an employee to inspect access.");
    return;
  }
  const template = state.jobTemplates.find((item) => item.id === agent.templateId);
  document.querySelector("#accessEmployeeSummary").innerHTML = `<div class="access-employee-profile"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(titleize(agent.jobType))} · ${escapeHtml(agent.department)}</span><span>${template ? `Inherited from ${escapeHtml(template.name)}` : "No linked job template"}</span></div>`;
  try {
    const access = await api(`/api/access/effective?agentId=${encodeURIComponent(agent.id)}`);
    document.querySelector("#effectiveAccessList").innerHTML = access.length ? access.map((item) => `<article class="access-asset-card"><div class="access-asset-head"><div><h3>${escapeHtml(item.asset.name)}</h3><span>${escapeHtml(titleize(item.asset.type))} · ${escapeHtml(titleize(item.asset.sensitivity))}</span></div><span>${escapeHtml(titleize(item.asset.environment))}</span></div><div class="action-grid">${item.actions.map((permission) => `<div class="action-chip ${escapeHtml(permission.effect)}" title="${escapeHtml(permission.sources.map((source) => source.name).join(", ") || "No matching grant")}">${escapeHtml(permission.action)}</div>`).join("")}</div></article>`).join("") : empty("No assets are registered.");
  } catch (error) {
    document.querySelector("#effectiveAccessList").innerHTML = empty(error.message);
  }
}

function renderAssetList() {
  if (!state.selectedAssetId || !assetById(state.selectedAssetId)) state.selectedAssetId = state.assets[0]?.id || null;
  document.querySelector("#assetList").innerHTML = state.assets.length ? state.assets.map((asset) => `<button class="asset-item ${asset.id === state.selectedAssetId ? "active" : ""}" data-asset-id="${escapeHtml(asset.id)}"><strong>${escapeHtml(asset.name)}</strong><span>${escapeHtml(titleize(asset.type))} · ${escapeHtml(titleize(asset.sensitivity))}</span></button>`).join("") : empty("No assets registered.");
  renderAssetDetail();
}

async function renderAssetDetail() {
  const asset = assetById(state.selectedAssetId);
  if (!asset) {
    document.querySelector("#assetDetail").innerHTML = empty("Select or register an asset.");
    return;
  }
  const relevantPolicies = state.policies.filter((policy) => ["*", asset.type].includes(policy.assetType) && ["*", asset.environment].includes(policy.assetEnvironment));
  const accessRows = await Promise.all(state.agents.map(async (agent) => {
    const [entry] = await api(`/api/access/effective?agentId=${encodeURIComponent(agent.id)}&assetId=${encodeURIComponent(asset.id)}`);
    const allowed = entry.actions.filter((action) => action.effect === "allowed").map((action) => action.action);
    return allowed.length ? { agent, allowed } : null;
  })).catch(() => []);
  const visible = accessRows.filter(Boolean);
  document.querySelector("#assetDetail").innerHTML = `<div class="asset-title"><div><span class="section-kicker">PROTECTED ASSET</span><h3>${escapeHtml(asset.name)}</h3></div><span class="status ${asset.externalImpact === "high" || asset.externalImpact === "critical" ? "pending" : "completed"}">${escapeHtml(titleize(asset.externalImpact))} impact</span></div><p>${escapeHtml(asset.description || "No description provided.")}</p><div class="detail-grid"><div class="detail-field"><span>Type</span><strong>${escapeHtml(titleize(asset.type))}</strong></div><div class="detail-field"><span>Owner</span><strong>${escapeHtml(asset.owner)}</strong></div><div class="detail-field"><span>Sensitivity</span><strong>${escapeHtml(asset.sensitivity)}</strong></div><div class="detail-field"><span>Environment</span><strong>${escapeHtml(asset.environment)}</strong></div></div><div class="drawer-section"><h4>Matching policies</h4>${relevantPolicies.length ? `<div class="action-list">${relevantPolicies.map((policy) => `<span>${escapeHtml(policy.name)}</span>`).join("")}</div>` : `<p>No policy matches this asset.</p>`}</div><div class="drawer-section"><h4>Employees with effective access</h4>${visible.length ? visible.map((item) => `<div class="setting-row"><span>${escapeHtml(item.agent.name)}</span><strong>${escapeHtml(item.allowed.join(", "))}</strong></div>`).join("") : `<p>No employee currently has an allowed action.</p>`}</div>`;
}

function renderPolicies() {
  document.querySelector("#policyList").innerHTML = state.policies.length ? state.policies.map((policy) => `<article class="policy-card"><div class="goal-top"><h3>${escapeHtml(policy.name)}</h3><span class="effect ${escapeHtml(policy.effect)}">${escapeHtml(policy.effect)}</span></div><div class="policy-rule"><div class="rule-box"><span>Employee</span><strong>${escapeHtml(titleize(policy.employeeJobType))}</strong></div><span>→</span><div class="rule-box"><span>Asset</span><strong>${escapeHtml(titleize(policy.assetType))}</strong></div></div><div class="action-list">${policy.actions.map((action) => `<span>${escapeHtml(action)}</span>`).join("")}</div><p>${escapeHtml(titleize(policy.assetEnvironment))} environment · deny overrides allow</p></article>`).join("") : empty("No access policies are configured.");
}

function renderTemplates() {
  document.querySelector("#templateList").innerHTML = state.jobTemplates.length ? state.jobTemplates.map((template) => {
    const employees = state.agents.filter((agent) => agent.templateId === template.id || agent.jobType === template.jobType);
    const policies = state.policies.filter((policy) => ["*", template.jobType].includes(policy.employeeJobType) && ["*", template.department].includes(policy.employeeDepartment));
    return `<article class="template-card"><div class="goal-top"><div><span class="section-kicker">${escapeHtml(template.department)}</span><h3>${escapeHtml(template.name)}</h3></div><span class="status">${escapeHtml(titleize(template.jobType))}</span></div><p>${escapeHtml(template.description || "Reusable employee role definition.")}</p><div class="action-list">${(template.capabilities || []).map((capability) => `<span>${escapeHtml(capability)}</span>`).join("") || "No capabilities"}</div><div class="template-footer"><div class="template-count">${employees.length} linked employees · ${policies.length} matching policy rules</div><button class="secondary-button" data-hire-template="${escapeHtml(template.id)}">Hire from template</button></div></article>`;
  }).join("") : empty("No job templates are configured.");
}

function renderAccess() {
  populateAccessSelectors();
  renderEffectiveAccess();
  renderAssetList();
  renderPolicies();
  renderTemplates();
}

function renderApprovals() {
  const staffingItems = state.staffingRequests.slice().reverse();
  const accessItems = state.accessRequests.slice().reverse();
  const integrations = state.integrationRequests.slice().reverse();
  const externalActions = state.externalActions.slice().reverse();
  const pending = [...staffingItems, ...accessItems, ...integrations, ...externalActions].filter((request) => request.status === "pending").length;
  const navCount = document.querySelector("#approvalNavCount");
  navCount.textContent = pending;
  navCount.classList.toggle("hidden", pending === 0);
  const staffingCards = staffingItems.map((request) => {
    const template = state.jobTemplates.find((item) => item.id === request.templateId);
    const manager = agentById(request.managerAgentId);
    const goal = state.goals.find((item) => item.id === request.goalId);
    const created = agentById(request.createdAgentId);
    return `<article class="approval-card"><div class="approval-top"><div><span class="section-kicker">STAFFING PROPOSAL</span><h3>Hire ${escapeHtml(request.proposedName)}</h3></div><span class="status ${escapeHtml(request.status)}">${escapeHtml(titleize(request.status))}</span></div><p>${escapeHtml(request.reason)}</p><div class="approval-context"><div class="detail-field"><span>Job template</span><strong>${escapeHtml(template?.name || "Unavailable")}</strong></div><div class="detail-field"><span>Reports to</span><strong>${escapeHtml(manager?.name || "Unavailable")}</strong></div><div class="detail-field"><span>Goal</span><strong>${escapeHtml(goal?.title || "Unavailable")}</strong></div><div class="detail-field"><span>Expected work</span><strong>${escapeHtml(request.expectedWorkTypes.map(titleize).join(", "))}</strong></div></div><p>Capabilities: ${escapeHtml(template?.capabilities?.map(titleize).join(", ") || "Unavailable")}</p><p class="notice">Approval creates one employee from this existing template and asks the CEO to replan after all staffing decisions. Existing policies calculate default access; this decision creates no temporary or project-specific permission grant.</p>${created ? `<p>Created employee: <strong>${escapeHtml(created.name)}</strong></p>` : ""}${request.status === "pending" ? decisionForm("staffing", request.id) : decisionNote(request)}</article>`;
  });
  const accessCards = accessItems.map((request) => {
    const agent = agentById(request.requesterAgentId);
    const asset = assetById(request.assetId);
    const grantDetail = request.status === "consumed" ? "One-use grant consumed" : request.expiresAt ? `Expires ${formatTime(request.expiresAt)}` : request.usesRemaining === 1 ? "One use remaining" : titleize(request.grantType);
    return `<article class="approval-card"><div class="approval-top"><div><span class="section-kicker">ACCESS REQUEST</span><h3>${escapeHtml(agent?.name || "Unknown employee")} requests ${escapeHtml(request.action)}</h3></div><span class="status ${escapeHtml(request.status)}">${escapeHtml(titleize(request.status))}</span></div><p>${escapeHtml(request.reason)}</p><div class="approval-context"><div class="detail-field"><span>Asset</span><strong>${escapeHtml(asset?.name || "Unknown")}</strong></div><div class="detail-field"><span>Risk</span><strong>${escapeHtml(request.risk)}</strong></div><div class="detail-field"><span>Grant</span><strong>${escapeHtml(grantDetail)}</strong></div><div class="detail-field"><span>Requested</span><strong>${escapeHtml(formatTime(request.createdAt))}</strong></div></div>${request.status === "pending" ? `<div class="approval-actions"><button class="reject-button" data-access-decision="rejected" data-request-id="${escapeHtml(request.id)}">Reject</button><button class="secondary-button" data-access-decision="approved" data-grant-type="time_bound" data-request-id="${escapeHtml(request.id)}">Approve 1 hour</button><button class="primary-button" data-access-decision="approved" data-grant-type="once" data-request-id="${escapeHtml(request.id)}">Approve once</button></div>` : `<div class="goal-meta"><span>Decided by ${escapeHtml(request.decidedBy || "—")}</span><span>${escapeHtml(request.decisionReason || "No decision note")}</span></div>`}</article>`;
  });
  const integrationCards = integrations.map((request) => {
    const task = state.tasks.find((item) => item.id === request.taskId);
    return `<article class="approval-card"><div class="approval-top"><div><span class="section-kicker">CODE INTEGRATION</span><h3>${escapeHtml(task?.title || "Code delivery")}</h3></div><span class="status ${escapeHtml(request.status)}">${escapeHtml(titleize(request.status))}</span></div><p>Apply reviewed files to the isolated ${escapeHtml(request.targetBranch)} branch and run the configured test command. This does not push, merge main or deploy.</p><div class="approval-context"><div class="detail-field"><span>Files</span><strong>${request.changedFiles.length}</strong></div><div class="detail-field"><span>Risk</span><strong>${escapeHtml(request.risk)}</strong></div><div class="detail-field"><span>Target</span><strong>${escapeHtml(request.targetBranch)}</strong></div><div class="detail-field"><span>Requested</span><strong>${escapeHtml(formatTime(request.createdAt))}</strong></div></div>${request.changedFiles.length ? `<div class="memory-tags">${request.changedFiles.map((file) => `<span class="tag">${escapeHtml(file)}</span>`).join("")}</div>` : ""}${request.error ? `<p>${escapeHtml(request.error)}</p>` : ""}${request.result ? `<p>Integration commit ${escapeHtml(request.result.integrationCommit?.slice(0, 12))} · tests ${escapeHtml(titleize(request.result.test?.status))}</p>` : ""}${request.status === "pending" ? decisionForm("integration", request.id) : decisionNote(request)}</article>`;
  });
  const externalCards = externalActions.map((action) => {
    const task = state.tasks.find((item) => item.id === action.taskId);
    const connector = state.connectors.find((item) => item.type === action.connectorType);
    return `<article class="approval-card"><div class="approval-top"><div><span class="section-kicker">EXTERNAL ACTION</span><h3>${escapeHtml(task?.title || titleize(action.connectorType))}</h3></div><span class="status ${escapeHtml(action.status)}">${escapeHtml(titleize(action.status))}</span></div><p>Approve only if this exact payload and destination are correct. ${action.connectorType === "web_research" ? "This action reads public sources." : "This action may change an external system."}</p><div class="approval-context"><div class="detail-field"><span>Connector</span><strong>${escapeHtml(titleize(action.connectorType))}</strong></div><div class="detail-field"><span>Operation</span><strong>${escapeHtml(action.operation)}</strong></div><div class="detail-field"><span>Risk</span><strong>${escapeHtml(action.risk)}</strong></div><div class="detail-field"><span>Runtime</span><strong>${connector?.configured ? "Ready" : "Not configured"}</strong></div></div><details open><summary>Exact action payload</summary><pre>${escapeHtml(JSON.stringify(action.payload, null, 2))}</pre></details>${action.error ? `<p>${escapeHtml(action.error)}</p>` : ""}${action.result ? `<p>${escapeHtml(action.result.summary)} · receipt ${escapeHtml(action.result.receiptId)}</p>` : ""}${action.status === "pending" ? decisionForm("external", action.id, !connector?.configured) : decisionNote(action)}</article>`;
  });
  const cards = [...staffingCards, ...externalCards, ...integrationCards, ...accessCards];
  document.querySelector("#approvalList").innerHTML = cards.length ? cards.join("") : empty("No approval requests have been created.");
}

function decisionForm(type, id, approvalDisabled = false) {
  const staffing = type === "staffing";
  return `<form class="approval-decision-form" data-decision-type="${escapeHtml(type)}" data-decision-id="${escapeHtml(id)}"><label>Founder decision note<input name="reason" required maxlength="1000" placeholder="Why you approve or reject this ${staffing ? "hire" : "exact action"}" /></label><div class="approval-actions"><button class="reject-button" name="decision" value="rejected" type="submit">Reject</button><button class="primary-button" name="decision" value="approved" type="submit" ${approvalDisabled ? "disabled" : ""}>${staffing ? "Approve hire" : "Approve exact action"}</button></div></form>`;
}

function decisionNote(item) {
  return `<div class="goal-meta"><span>Decided by ${escapeHtml(item.decidedBy || "system")}</span><span>${escapeHtml(item.decisionReason || item.error || "No decision note")}</span></div>`;
}

function renderKnowledge() {
  document.querySelector("#memoryList").innerHTML = state.memories.length ? state.memories.slice().reverse().map((memory) => `<article class="memory-card"><div class="goal-top"><div><span class="section-kicker">${escapeHtml(memory.scope)}</span><h3>${escapeHtml(memory.content)}</h3></div><span class="status">${escapeHtml(memory.source)}</span></div><div class="memory-tags">${(memory.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div><p>Recorded ${escapeHtml(formatTime(memory.createdAt))}</p></article>`).join("") : empty("No organization knowledge has been recorded.");
}

function renderReports() {
  const statusCounts = state.tasks.reduce((counts, task) => ({ ...counts, [task.status]: (counts[task.status] || 0) + 1 }), {});
  const totalTasks = state.tasks.length;
  const completed = statusCounts.completed || 0;
  const evidence = state.tasks.reduce((count, task) => count + (task.evidence?.length || 0), 0);
  const tasksWithEvidence = state.tasks.filter((task) => task.evidence?.length).length;
  document.querySelector("#reportMetrics").innerHTML = [
    metric("Completion rate", totalTasks ? `${Math.round((completed / totalTasks) * 100)}%` : "0%", `${completed} of ${totalTasks} recorded tasks`),
    metric("Evidence coverage", totalTasks ? `${Math.round((tasksWithEvidence / totalTasks) * 100)}%` : "0%", `${evidence} evidence records`),
    metric("Blocked or failed", (statusCounts.blocked || 0) + (statusCounts.failed || 0), "Requires diagnosis or replanning"),
    metric("Access policies", state.policies.length, `${state.assets.length} classified assets`)
  ].join("");
  const statuses = ["pending", "running", "needs_input", "awaiting_review", "completed", "blocked", "failed"];
  document.querySelector("#executionReport").innerHTML = statuses.map((status) => {
    const count = statusCounts[status] || 0;
    const percent = totalTasks ? Math.round((count / totalTasks) * 100) : 0;
    return `<div class="report-row"><span>${escapeHtml(titleize(status))}</span><div class="report-bar"><i style="width:${percent}%"></i></div><b>${count}</b></div>`;
  }).join("");
  document.querySelector("#evidenceReport").innerHTML = state.goalSummaries.length ? state.goalSummaries.map((goal) => `<div class="report-row"><span>${escapeHtml(truncate(goal.title, 24))}</span><div class="report-bar"><i style="width:${goal.progress.percent}%"></i></div><b>${goal.evidence.length}</b></div>`).join("") : empty("No goal evidence exists.");
}

function renderAudit() {
  document.querySelector("#eventList").innerHTML = state.events.length ? state.events.slice().reverse().slice(0, 100).map((event) => `<article class="event-item"><span class="event-type">${escapeHtml(event.type)}</span><span class="event-detail">${escapeHtml(JSON.stringify(event.payload))}</span><time class="event-time">${escapeHtml(formatTime(event.createdAt))}</time></article>`).join("") : empty("No audit events have been recorded.");
}

function renderSettings() {
  document.querySelector("#settingsVersion").textContent = `AI Organization OS ${state.health?.version || "—"}`;
  document.querySelector("#settingsScheduler").textContent = titleize(state.health?.scheduler || "unknown");
  document.querySelector("#settingsTools").textContent = state.health?.toolCount ?? "—";
  document.querySelector("#settingsStorage").textContent = titleize(state.health?.storage || "unknown");
  document.querySelector("#settingsConnectors").innerHTML = state.connectors.map((connector) => `<div class="setting-row"><span>${escapeHtml(titleize(connector.type))}</span><strong class="${connector.configured ? "" : "danger-text"}">${connector.configured ? "Ready" : "Not configured"}</strong></div>`).join("");
}

function renderAll() {
  document.querySelector("#runtimeLabel").textContent = state.health ? `Local · v${state.health.version}` : "Unavailable";
  renderHome();
  renderGoals();
  renderProjects();
  renderEmployees();
  renderAccess();
  renderApprovals();
  renderKnowledge();
  renderReports();
  renderAudit();
  renderSettings();
}

async function refreshData({ quiet = false } = {}) {
  try {
    const [health, agents, goals, tasks, memories, events, assets, policies, accessRequests, staffingRequests, jobTemplates, projects, integrationRequests, externalActions, connectors, ceoConversation] = await Promise.all([
      api("/api/health"), api("/api/agents"), api("/api/goals"), api("/api/tasks"), api("/api/memories"), api("/api/events"), api("/api/assets"), api("/api/policies"), api("/api/access-requests"), api("/api/staffing-requests"), api("/api/job-templates"), api("/api/projects"), api("/api/integration-requests"), api("/api/external-actions"), api("/api/connectors"), api("/api/ceo/conversation")
    ]);
    const goalSummaries = await Promise.all(goals.map((goal) => api(`/api/goals/${goal.id}/summary`)));
    Object.assign(state, { health, agents, goals, goalSummaries, tasks, memories, events, assets, policies, accessRequests, staffingRequests, jobTemplates, projects, integrationRequests, externalActions, connectors, ceoConversation });
    renderAll();
  } catch (error) {
    document.querySelector("#runtimeLabel").textContent = "Connection failed";
    if (!quiet) toast(error.message, true);
  }
}

async function sendCeoMessage() {
  const input = document.querySelector("#ceoChatMessage");
  const button = document.querySelector("#ceoChatSendButton");
  const message = input.value.trim();
  if (!message) return toast("Write a message for the AI CEO first.", true);
  button.disabled = true;
  try {
    await api("/api/ceo/conversation/messages", { method: "POST", body: JSON.stringify({ message }) });
    input.value = "";
    await refreshData({ quiet: true });
    document.querySelector("#ceoConversation").scrollTop = document.querySelector("#ceoConversation").scrollHeight;
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
}

async function createGoalFromCeoMessage(messageId) {
  try {
    const goal = await api(`/api/ceo/conversation/messages/${messageId}/create-goal`, { method: "POST", body: "{}" });
    await api(`/api/goals/${goal.id}/plan`, { method: "POST", body: "{}" });
    toast("Goal created. The CEO is preparing a plan for your confirmation.");
    await refreshData({ quiet: true });
    goalUI.openGoal(goal.id);
  } catch (error) { toast(error.message, true); }
}

async function decideRequest(requestId, decision, grantType = "once") {
  try {
    await api(`/api/access-requests/${requestId}/decision`, { method: "POST", body: JSON.stringify({ decision, grantType, durationMinutes: 60, reason: decision === "approved" ? "Approved by Founder in the local console." : "Rejected by Founder in the local console." }) });
    toast(`Access request ${decision}.`);
    await refreshData({ quiet: true });
  } catch (error) {
    toast(error.message, true);
  }
}

function policyFormValues() {
  const values = Object.fromEntries(new FormData(document.querySelector("#policyForm")));
  values.actions = values.actions.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return values;
}

async function previewPolicyImpact() {
  const previewElement = document.querySelector("#policyPreview");
  try {
    const preview = await api("/api/policies/preview", { method: "POST", body: JSON.stringify(policyFormValues()) });
    previewElement.innerHTML = `<strong>${preview.affectedPermissionCount} permission outcomes may change</strong><span>${preview.matchedAgents.length} employees · ${preview.matchedAssets.length} assets · ${preview.candidate.actions.length} actions</span><span>${preview.conflicts.length ? `${preview.conflicts.length} conflicting policies: ${preview.conflicts.map((item) => escapeHtml(item.name)).join(", ")}` : "No conflicting policy was detected."}</span>`;
    previewElement.classList.remove("hidden");
  } catch (error) {
    previewElement.innerHTML = `<strong>Preview unavailable</strong><span>${escapeHtml(error.message)}</span>`;
    previewElement.classList.remove("hidden");
  }
}

document.addEventListener("click", (event) => {
  const workButton = event.target.closest("[data-work-task]");
  if (workButton) {
    showPage("projects");
    selectedWorkTaskId = workButton.dataset.workTask;
    document.querySelector("#workFeedbackMessage").value = "";
    renderWorkDelivery();
    document.querySelector("#workDeliveryPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const pageButton = event.target.closest("[data-page], [data-page-link]");
  if (pageButton) showPage(pageButton.dataset.page || pageButton.dataset.pageLink);
  const employee = event.target.closest("[data-agent-id]");
  if (employee) openEmployee(employee.dataset.agentId);
  if (event.target.closest("[data-close-drawer]")) closeDrawer();
  const accessLink = event.target.closest("[data-open-access]");
  if (accessLink) {
    closeDrawer();
    showPage("access");
    document.querySelector("#accessEmployeeSelect").value = accessLink.dataset.openAccess;
    renderEffectiveAccess();
  }
  const asset = event.target.closest("[data-asset-id]");
  if (asset) {
    state.selectedAssetId = asset.dataset.assetId;
    renderAssetList();
  }
  const decision = event.target.closest("[data-access-decision]");
  if (decision) decideRequest(decision.dataset.requestId, decision.dataset.accessDecision, decision.dataset.grantType || "once");
  const hireTemplate = event.target.closest("[data-hire-template]");
  if (hireTemplate) openHireForm(hireTemplate.dataset.hireTemplate);
  const ceoGoal = event.target.closest("[data-ceo-create-goal]");
  if (ceoGoal) createGoalFromCeoMessage(ceoGoal.dataset.ceoCreateGoal);
  const closeForm = event.target.closest("[data-close-form]");
  if (closeForm) document.querySelector(`#${closeForm.dataset.closeForm}`).classList.add("hidden");
});

document.querySelector("#menuButton").addEventListener("click", () => setSidebarOpen(!document.querySelector("#sidebar").classList.contains("open")));
document.querySelector("#sidebarBackdrop").addEventListener("click", () => setSidebarOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#sidebar").classList.contains("open")) setSidebarOpen(false);
});
document.querySelector("#ceoChatForm").addEventListener("submit", (event) => { event.preventDefault(); sendCeoMessage(); });
document.querySelectorAll("[data-employee-view]").forEach((button) => button.addEventListener("click", () => {
  state.employeeView = button.dataset.employeeView;
  document.querySelectorAll("[data-employee-view]").forEach((item) => item.classList.toggle("active", item === button));
  renderEmployees();
}));
document.querySelector("#employeeSearch").addEventListener("input", renderEmployees);
document.querySelector("#departmentFilter").addEventListener("change", renderEmployees);
document.querySelector("#showWorkRequestFormButton").addEventListener("click", () => {
  document.querySelector("#workRequestForm").classList.remove("hidden");
  document.querySelector("#workRequestForm").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#workTypeSelect").addEventListener("change", (event) => {
  document.querySelector("#workAssetField").classList.toggle("hidden", event.currentTarget.value !== "software_development");
});
document.querySelector("#showHireFormButton").addEventListener("click", () => openHireForm());
document.querySelector("#cancelHireButton").addEventListener("click", () => document.querySelector("#hireEmployeeForm").classList.add("hidden"));
document.querySelector("#hireTemplateSelect").addEventListener("change", renderHirePreview);
document.querySelectorAll("[data-access-tab]").forEach((button) => button.addEventListener("click", () => {
  state.accessTab = button.dataset.accessTab;
  document.querySelectorAll("[data-access-tab]").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-access-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.accessPanel === state.accessTab));
}));
document.querySelector("#accessEmployeeSelect").addEventListener("change", renderEffectiveAccess);
document.querySelector("#showAssetFormButton").addEventListener("click", () => document.querySelector("#assetForm").classList.remove("hidden"));
document.querySelector("#showPolicyFormButton").addEventListener("click", () => document.querySelector("#policyForm").classList.remove("hidden"));
document.querySelector("#showTemplateFormButton").addEventListener("click", () => document.querySelector("#templateForm").classList.remove("hidden"));
document.querySelector("#showRequestFormButton").addEventListener("click", () => document.querySelector("#requestForm").classList.remove("hidden"));
document.querySelector("#showMemoryFormButton").addEventListener("click", () => document.querySelector("#memoryForm").classList.remove("hidden"));
document.querySelector("#refreshAuditButton").addEventListener("click", () => refreshData());
document.querySelector("#previewPolicyButton").addEventListener("click", previewPolicyImpact);

document.querySelector("#workRequestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.querySelector("#submitWorkRequestButton");
  if (button.disabled) return;
  button.disabled = true;
  const values = Object.fromEntries(new FormData(form));
  values.priority = Number(values.priority);
  values.acceptanceCriteria = values.acceptanceCriteria.split(",").map((item) => item.trim()).filter(Boolean);
  if (!values.goalId) delete values.goalId;
  if (!values.assignedAgentId) delete values.assignedAgentId;
  if (!values.assetId) delete values.assetId;
  try {
    const task = await api("/api/work-requests", { method: "POST", body: JSON.stringify(values) });
    form.reset();
    form.classList.add("hidden");
    document.querySelector("#workAssetField").classList.add("hidden");
    const employee = agentById(task.assignedAgentId)?.name || "The selected employee";
    toast(task.status === "blocked"
      ? `Work request routed to ${employee}. An approved executor is still needed.`
      : `Work request routed to ${employee} and queued for execution.`);
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector("#closeWorkDelivery").addEventListener("click", () => { selectedWorkTaskId = null; renderWorkDelivery(); });
document.querySelector("#workDeliveryContent").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-configure-code], [data-configure-external], [data-request-integration]");
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    if (form.dataset.configureCode) {
      await api(`/api/tasks/${form.dataset.configureCode}/configure-code`, { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      toast("Code task queued. Existing permissions will be checked before execution.");
    } else if (form.dataset.requestIntegration) {
      await api(`/api/tasks/${form.dataset.requestIntegration}/request-integration`, { method: "POST", body: "{}" });
      toast("A new code integration request is ready for your review.");
    } else {
      const values = Object.fromEntries(new FormData(form));
      const connectorType = form.dataset.connector;
      let payload;
      if (connectorType === "web_research") payload = { query: values.query, urls: values.urls.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) };
      if (connectorType === "email") payload = { to: values.to, subject: values.subject, text: values.text };
      if (connectorType === "crm") {
        const primaryName = values.primaryName.trim();
        const properties = values.objectType === "contacts"
          ? { firstname: primaryName.split(/\s+/)[0], lastname: primaryName.split(/\s+/).slice(1).join(" ") || "Unknown", ...(values.email ? { email: values.email } : {}) }
          : values.objectType === "companies" ? { name: primaryName } : { dealname: primaryName };
        payload = { objectType: values.objectType, properties };
      }
      if (connectorType === "publishing") payload = { destination: values.destination, title: values.title, content: values.content };
      await api(`/api/tasks/${form.dataset.configureExternal}/configure-external`, { method: "POST",
        body: JSON.stringify({ connectorType, assetId: values.assetId, payload }) });
      toast("Exact action preview created. Review it in Approvals before anything happens externally.");
      showPage("approvals");
    }
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector("#approvalList").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-decision-type]");
  if (!form) return;
  event.preventDefault();
  const submitter = event.submitter;
  if (!submitter || submitter.disabled) return;
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const endpoint = form.dataset.decisionType === "integration" ? "integration-requests"
      : form.dataset.decisionType === "staffing" ? "staffing-requests" : "external-actions";
    await api(`/api/${endpoint}/${form.dataset.decisionId}/decision`, { method: "POST",
      body: JSON.stringify({ decision: submitter.value, reason: new FormData(form).get("reason") }) });
    toast(form.dataset.decisionType === "staffing"
      ? submitter.value === "approved" ? "Employee hired. The CEO will replan after all staffing decisions." : "Hiring rejected. The CEO will revise the plan after all staffing decisions."
      : submitter.value === "approved" ? "Approved action completed or safely queued." : "Action rejected without execution.");
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
  finally { buttons.forEach((button) => { button.disabled = false; }); }
});
document.querySelector("#workFeedbackForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#sendWorkFeedback");
  button.disabled = true;
  try {
    await api(`/api/tasks/${selectedWorkTaskId}/feedback`, { method: "POST", body: JSON.stringify({ message: document.querySelector("#workFeedbackMessage").value }) });
    document.querySelector("#workFeedbackMessage").value = "";
    await refreshData({ quiet: true });
    toast("Your reply is saved. The employee is queued to continue.");
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
document.querySelector("#acceptWorkButton").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await api(`/api/tasks/${selectedWorkTaskId}/accept`, { method: "POST", body: "{}" });
    await refreshData({ quiet: true });
    toast("Delivery accepted and task completed.");
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});

document.querySelector("#hireEmployeeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  if (!values.managerId) delete values.managerId;
  try {
    const employee = await api("/api/agents", { method: "POST", body: JSON.stringify(values) });
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    toast(`${employee.name} was hired with template-based role and access defaults.`);
    await refreshData({ quiet: true });
    openEmployee(employee.id);
  } catch (error) { toast(error.message, true); }
});

document.querySelector("#assetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const asset = await api("/api/assets", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
    state.selectedAssetId = asset.id;
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    toast("Asset registered and ready for policy matching.");
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
});

document.querySelector("#policyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = policyFormValues();
  try {
    await api("/api/policies", { method: "POST", body: JSON.stringify(values) });
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    toast("Policy created. Effective access has been recalculated.");
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
});

document.querySelector("#templateForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.capabilities = values.capabilities.split(",").map((item) => item.trim()).filter(Boolean);
  values.responsibilities = values.responsibilities.split(",").map((item) => item.trim()).filter(Boolean);
  try {
    await api("/api/job-templates", { method: "POST", body: JSON.stringify(values) });
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    toast("Job template created and ready for new employees.");
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
});

document.querySelector("#requestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await api("/api/access-requests", { method: "POST", body: JSON.stringify(values) });
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    toast("Access request submitted for a Founder decision.");
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
});

document.querySelector("#memoryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(event.currentTarget));
  values.tags = values.tags.split(",").map((item) => item.trim()).filter(Boolean);
  try {
    await api("/api/memories", { method: "POST", body: JSON.stringify(values) });
    event.currentTarget.reset();
    event.currentTarget.classList.add("hidden");
    toast("Organization knowledge recorded.");
    await refreshData({ quiet: true });
  } catch (error) { toast(error.message, true); }
});

const date = new Date();
document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("en", { weekday: "long" }).format(date);
document.querySelector("#todayDate").textContent = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
refreshData();
setInterval(() => refreshData({ quiet: true }), 10000);
