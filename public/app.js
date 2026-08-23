const state = {
  health: null,
  agents: [],
  goals: [],
  goalSummaries: [],
  tasks: [],
  memories: [],
  events: [],
  assets: [],
  policies: [],
  jobTemplates: [],
  accessRequests: [],
  employeeView: "directory",
  accessTab: "employees",
  selectedAssetId: null,
  pendingIntent: null
};

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

function renderHome() {
  const pending = state.accessRequests.filter((request) => request.status === "pending");
  const blocked = state.tasks.filter((task) => ["blocked", "failed"].includes(task.status));
  const reviews = state.goalSummaries.filter((goal) => goal.executionStatus === "awaiting_review");
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const evidence = state.tasks.reduce((total, task) => total + (task.evidence?.length || 0), 0);

  document.querySelector("#metricGrid").innerHTML = [
    metric("AI employees", state.agents.length, `${new Set(state.agents.map((agent) => agent.department)).size} departments represented`),
    metric("Active goals", state.goals.filter((goal) => goal.status === "active").length, `${reviews.length} awaiting Founder review`),
    metric("Verified tasks", completed, `${evidence} evidence records attached`),
    metric("Pending approvals", pending.length, pending.length ? "Founder decision required" : "No access decisions waiting")
  ].join("");

  const attention = [
    ...pending.map((request) => ({ signal: "red", title: `${agentById(request.requesterAgentId)?.name || "Employee"} requests ${request.action}`, note: assetById(request.assetId)?.name || "Unknown asset", action: "Approval" })),
    ...blocked.slice(0, 3).map((task) => ({ signal: "red", title: task.title, note: task.blockedReason || task.error || "Execution is blocked", action: "Blocked" })),
    ...reviews.slice(0, 3).map((goal) => ({ signal: "", title: goal.title, note: `${goal.progress.completed} tasks completed with evidence`, action: "Review" }))
  ].slice(0, 6);
  document.querySelector("#attentionList").innerHTML = attention.length
    ? attention.map((item) => `<div class="attention-item"><i class="attention-signal ${item.signal}"></i><div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.note)}</span></div><b>${escapeHtml(item.action)}</b></div>`).join("")
    : `<div class="attention-item"><i class="attention-signal green"></i><div><strong>No urgent decisions</strong><span>The organization has no pending access request or blocked workflow.</span></div><b>Clear</b></div>`;
  document.querySelector("#homeGoalList").innerHTML = state.goalSummaries.length
    ? state.goalSummaries.slice().reverse().slice(0, 4).map(goalCard).join("")
    : empty("No goals yet. Begin with a Founder command above.");
}

function renderGoals() {
  document.querySelector("#goalList").innerHTML = state.goalSummaries.length
    ? state.goalSummaries.slice().reverse().map((goal) => `<article class="goal-detail">
      <div class="goal-top"><div><span class="section-kicker">GOAL</span><h3>${escapeHtml(goal.title)}</h3></div><span class="status ${escapeHtml(goal.executionStatus)}">${escapeHtml(titleize(goal.executionStatus))}</span></div>
      <p class="goal-description">${escapeHtml(goal.description || "No description provided.")}</p>
      <div class="progress"><i style="width:${goal.progress.percent}%"></i></div>
      <div class="goal-meta"><span>${goal.progress.percent}% verified</span><span>${goal.evidence.length} evidence records</span><span>Next: ${escapeHtml(goal.nextAction)}</span></div>
      <div class="task-stack">${goal.tasks.map((task, index) => `<div class="task-row"><div class="task-index">${String(index + 1).padStart(2, "0")}</div><div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.executor || "No executor")} · ${task.evidence?.length || 0} evidence</span></div><span class="status ${escapeHtml(task.status)}">${escapeHtml(titleize(task.status))}</span></div>`).join("") || empty("No work orders have been planned.")}</div>
    </article>`).join("")
    : empty("No goals exist yet.");
}

function renderProjects() {
  document.querySelector("#projectList").innerHTML = state.goalSummaries.length
    ? state.goalSummaries.slice().reverse().map((goal) => {
      const assignedIds = [...new Set(goal.tasks.map((task) => task.assignedAgentId).filter(Boolean))];
      const team = assignedIds.map(agentById).filter(Boolean);
      const blocked = goal.tasks.filter((task) => ["blocked", "failed"].includes(task.status)).length;
      return `<article class="project-card"><div class="goal-top"><div><span class="section-kicker">GOAL WORKFLOW</span><h3>${escapeHtml(goal.title)}</h3></div><span class="status ${escapeHtml(goal.executionStatus)}">${escapeHtml(titleize(goal.executionStatus))}</span></div><p>${escapeHtml(goal.description || "Workflow generated from a Founder goal.")}</p><div class="progress"><i style="width:${goal.progress.percent}%"></i></div><div class="goal-meta"><span>${goal.progress.total} work orders</span><span>${team.length} assigned employees</span><span>${blocked} blocked</span><span>Plan cycle ${Math.max(0, ...goal.tasks.map((task) => task.planCycle || 1))}</span></div><div class="project-team">${team.length ? team.map((agent) => `<span class="mini-avatar" title="${escapeHtml(agent.name)}">${escapeHtml(initials(agent.name))}</span>`).join("") : `<span class="goal-meta">No team assigned</span>`}</div></article>`;
    }).join("")
    : empty("No goal workflows exist yet.");
}

function employeeStatus(agent) {
  const tasks = state.tasks.filter((task) => task.assignedAgentId === agent.id);
  if (tasks.some((task) => ["blocked", "failed"].includes(task.status))) return "blocked";
  if (tasks.some((task) => ["pending", "running"].includes(task.status))) return "working";
  return agent.status || "available";
}

function employeeWork(agent) {
  const active = state.tasks.find((task) => task.assignedAgentId === agent.id && ["running", "pending", "blocked", "failed"].includes(task.status));
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
  const items = state.accessRequests.slice().reverse();
  const pending = items.filter((request) => request.status === "pending").length;
  const navCount = document.querySelector("#approvalNavCount");
  navCount.textContent = pending;
  navCount.classList.toggle("hidden", pending === 0);
  document.querySelector("#approvalList").innerHTML = items.length ? items.map((request) => {
    const agent = agentById(request.requesterAgentId);
    const asset = assetById(request.assetId);
    const grantDetail = request.status === "consumed" ? "One-use grant consumed" : request.expiresAt ? `Expires ${formatTime(request.expiresAt)}` : request.usesRemaining === 1 ? "One use remaining" : titleize(request.grantType);
    return `<article class="approval-card"><div class="approval-top"><div><span class="section-kicker">ACCESS REQUEST</span><h3>${escapeHtml(agent?.name || "Unknown employee")} requests ${escapeHtml(request.action)}</h3></div><span class="status ${escapeHtml(request.status)}">${escapeHtml(titleize(request.status))}</span></div><p>${escapeHtml(request.reason)}</p><div class="approval-context"><div class="detail-field"><span>Asset</span><strong>${escapeHtml(asset?.name || "Unknown")}</strong></div><div class="detail-field"><span>Risk</span><strong>${escapeHtml(request.risk)}</strong></div><div class="detail-field"><span>Grant</span><strong>${escapeHtml(grantDetail)}</strong></div><div class="detail-field"><span>Requested</span><strong>${escapeHtml(formatTime(request.createdAt))}</strong></div></div>${request.status === "pending" ? `<div class="approval-actions"><button class="reject-button" data-access-decision="rejected" data-request-id="${escapeHtml(request.id)}">Reject</button><button class="secondary-button" data-access-decision="approved" data-grant-type="time_bound" data-request-id="${escapeHtml(request.id)}">Approve 1 hour</button><button class="primary-button" data-access-decision="approved" data-grant-type="once" data-request-id="${escapeHtml(request.id)}">Approve once</button></div>` : `<div class="goal-meta"><span>Decided by ${escapeHtml(request.decidedBy || "—")}</span><span>${escapeHtml(request.decisionReason || "No decision note")}</span></div>`}</article>`;
  }).join("") : empty("No approval requests have been created.");
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
  const statuses = ["pending", "running", "completed", "blocked", "failed"];
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
    const [health, agents, goals, tasks, memories, events, assets, policies, accessRequests, jobTemplates] = await Promise.all([
      api("/api/health"), api("/api/agents"), api("/api/goals"), api("/api/tasks"), api("/api/memories"), api("/api/events"), api("/api/assets"), api("/api/policies"), api("/api/access-requests"), api("/api/job-templates")
    ]);
    const goalSummaries = await Promise.all(goals.map((goal) => api(`/api/goals/${goal.id}/summary`)));
    Object.assign(state, { health, agents, goals, goalSummaries, tasks, memories, events, assets, policies, accessRequests, jobTemplates });
    renderAll();
  } catch (error) {
    document.querySelector("#runtimeLabel").textContent = "Connection failed";
    if (!quiet) toast(error.message, true);
  }
}

function analyzeFounderIntent() {
  const input = document.querySelector("#founderCommand").value.trim();
  if (!input) return toast("Describe an idea or outcome first.", true);
  const lower = input.toLowerCase();
  const externalSignals = ["publish", "post", "email", "send", "deploy", "delete", "buy", "sell", "spend", "payment"].filter((word) => {
    const index = lower.indexOf(word);
    if (index < 0) return false;
    const context = lower.slice(Math.max(0, index - 24), Math.min(lower.length, index + word.length + 24));
    const wordIndex = context.indexOf(word);
    const before = context.slice(0, wordIndex);
    const after = context.slice(wordIndex + word.length).trim();
    const negatedBefore = /(?:do not|don't|never|without|no|disable|disabled|forbid|forbidden)[^.!?]{0,20}$/.test(before);
    const negatedAfter = /^(?:ing\s+)?(?:is\s+)?(?:disabled|forbidden|not allowed|blocked)/.test(after);
    return !negatedBefore && !negatedAfter;
  });
  const type = /change|update|revise|replace|pause|stop/.test(lower) ? "Change request" : /\?$|how|what|why/.test(lower) ? "Discussion" : "Goal proposal";
  const risk = externalSignals.length ? "Founder confirmation required" : "Internal and reversible";
  state.pendingIntent = { input, externalSignals, type, risk };
  document.querySelector("#intentBrief").innerHTML = `<div class="panel-heading compact"><div><span class="section-kicker">AI CEO UNDERSTANDING</span><h3>${escapeHtml(type)}</h3></div><span class="status ${externalSignals.length ? "pending" : "completed"}">${externalSignals.length ? "Confirmation gate" : "Ready to plan"}</span></div><div class="intent-brief-grid"><div class="brief-field"><span>Objective</span><strong>${escapeHtml(input)}</strong></div><div class="brief-field"><span>Execution boundary</span><strong>${escapeHtml(risk)}</strong></div><div class="brief-field"><span>Assumption</span><strong>Use the local organization, current employee roster and evidence-backed tools.</strong></div><div class="brief-field"><span>External actions detected</span><strong>${escapeHtml(externalSignals.join(", ") || "None")}</strong></div></div><p>This is a deterministic local intake preview. No language-model provider is connected, so deeper clarification is not yet available.</p><div class="brief-actions"><button class="secondary-button" id="editIntentButton">Continue editing</button>${type !== "Discussion" ? `<button class="primary-button" id="launchIntentButton">Confirm and launch workflow</button>` : ""}</div>`;
  document.querySelector("#intentBrief").classList.remove("hidden");
}

async function launchIntent() {
  if (!state.pendingIntent) return;
  const button = document.querySelector("#launchIntentButton");
  button.disabled = true;
  try {
    const sentence = state.pendingIntent.input.split(/[.!?\n]/).find(Boolean)?.trim() || state.pendingIntent.input;
    const title = truncate(sentence, 72);
    const goal = await api("/api/goals", { method: "POST", body: JSON.stringify({ title, description: state.pendingIntent.input }) });
    await api(`/api/goals/${goal.id}/plan`, { method: "POST", body: "{}" });
    document.querySelector("#founderCommand").value = "";
    document.querySelector("#intentBrief").classList.add("hidden");
    state.pendingIntent = null;
    toast("Goal confirmed. The local workflow has started with external actions disabled.");
    await refreshData({ quiet: true });
  } catch (error) {
    toast(error.message, true);
    button.disabled = false;
  }
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
  const closeForm = event.target.closest("[data-close-form]");
  if (closeForm) document.querySelector(`#${closeForm.dataset.closeForm}`).classList.add("hidden");
});

document.querySelector("#menuButton").addEventListener("click", () => setSidebarOpen(!document.querySelector("#sidebar").classList.contains("open")));
document.querySelector("#sidebarBackdrop").addEventListener("click", () => setSidebarOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#sidebar").classList.contains("open")) setSidebarOpen(false);
});
document.querySelector("#analyzeCommandButton").addEventListener("click", analyzeFounderIntent);
document.querySelector("#intentBrief").addEventListener("click", (event) => {
  if (event.target.closest("#launchIntentButton")) launchIntent();
  if (event.target.closest("#editIntentButton")) document.querySelector("#intentBrief").classList.add("hidden");
});
document.querySelectorAll("[data-employee-view]").forEach((button) => button.addEventListener("click", () => {
  state.employeeView = button.dataset.employeeView;
  document.querySelectorAll("[data-employee-view]").forEach((item) => item.classList.toggle("active", item === button));
  renderEmployees();
}));
document.querySelector("#employeeSearch").addEventListener("input", renderEmployees);
document.querySelector("#departmentFilter").addEventListener("change", renderEmployees);
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
