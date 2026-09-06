export function createGoalUI({ state, api, escapeHtml: h, titleize, agentById, showPage, refreshData, toast }) {
  let selectedGoalId = null;
  let renderedVersion = "";
  const taskRow = (task) => `<div class="task-row"><div><strong>${h(task.title)}</strong><span>${h(agentById(task.assignedAgentId)?.name || "Unassigned")} · ${h(titleize(task.status))}</span>${task.dependsOn.length ? `<small>After: ${task.dependsOn.map((id) => h(state.tasks.find((t) => t.id === id)?.title || "Missing task")).join("; ")}</small>` : ""}</div><button class="text-button" data-work-task="${h(task.id)}">Open work</button></div>`;
  const list = (title, items = []) => items.length ? `<h4>${title}</h4><ul>${items.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : "";

  function renderGoals() {
    document.querySelector("#goalList").innerHTML = state.goalSummaries.map((goal) => {
      const work = goal.tasks.filter((task) => task.taskKind === "work");
      const coordination = goal.tasks.length - work.length;
      const usage = goal.autonomyPolicy ? `${goal.autonomyUsage?.modelRuns || 0}/${goal.autonomyPolicy.maxModelRuns} approved model runs used` : "Founder-reviewed workflow";
      return `<article class="goal-detail">
      <div class="goal-top"><h3>${h(goal.title)}</h3><span class="status ${h(goal.executionStatus)}">${h(titleize(goal.executionStatus))}</span></div>
      <p>${h(goal.description)}</p><div class="progress"><i style="width:${goal.progress.percent}%"></i></div>
      <p>${goal.progress.completed}/${goal.progress.total} ${goal.planningTask ? "work deliveries accepted" : "legacy tasks completed"} · ${coordination} coordination tasks · ${goal.projects?.length || 0} projects</p>
      <p>${h(goal.nextAction)}</p>${goal.approvedPlanId ? `<p class="notice">Delivery progress is not business success. Goal outcome remains unverified.</p>` : ""}
      ${goal.autonomyPolicy ? `<p class="autonomy-note"><strong>Controlled autonomy</strong> · ${h(usage)} · up to ${goal.autonomyPolicy.maxRevisionRounds} automatic revisions per document</p>` : ""}
      ${goal.finalReport ? `<section class="final-report-card"><strong>AI CEO final report · ${h(titleize(goal.finalReport.status))}</strong><p>${h(goal.finalReport.output?.summary || goal.finalReport.nextAction || "Queued after all work deliveries are accepted.")}</p><button class="text-button" data-work-task="${h(goal.finalReport.id)}">Open final report</button></section>` : ""}
      <div class="brief-actions"><button class="secondary-button" data-review-goal="${h(goal.id)}">${goal.planningTask ? "Open CEO plan and conversation" : "Plan this goal with AI CEO"}</button>${goal.projects?.length ? `<button class="text-button" data-page-link="projects">View projects</button>` : ""}</div>
      ${goal.tasks.length ? `<details><summary>${goal.tasks.length} work and coordination tasks</summary>${goal.tasks.map(taskRow).join("")}</details>` : ""}</article>`;
    }).reverse().join("") || `<div class="empty-state">Start by describing your goal on Home.</div>`;
    renderPlan();
  }

  function renderPlan() {
    const goal = state.goalSummaries.find((g) => g.id === selectedGoalId);
    const panel = document.querySelector("#goalPlanPanel");
    panel.classList.toggle("hidden", !goal);
    if (!goal) { renderedVersion = ""; return; }
    const version = JSON.stringify(goal);
    if (version === renderedVersion) return;
    renderedVersion = version;
    const draft = panel.querySelector("textarea")?.value || "";
    const task = goal.planningTask;
    const output = task?.output || {};
    const plan = output.plan;
    const staffing = goal.staffingRequests || [];
    const ready = !goal.approvedPlanId && task?.status === "awaiting_review" && plan && !plan.staffingRequests?.length;
    const modelTaskCount = plan?.tasks.filter((item) => ["document", "code"].includes(item.executionMode)).length || 0;
    const maxModelRuns = Math.min(100, Math.max(6, modelTaskCount * 8));
    const budgetTask = goal.tasks.find((item) => item.status === "blocked" && item.blockedReason === "The approved model-run budget is exhausted.");
    const canReply = !goal.approvedPlanId && (!task || ["blocked", "failed", "needs_input", "awaiting_review"].includes(task.status));
    panel.innerHTML = `<div class="panel-heading"><div><span class="section-kicker">GOAL → CEO PLAN → YOUR CONFIRMATION</span><h3>${h(goal.title)}</h3></div><button class="text-button" data-close-goal-plan>Close</button></div>
      <p><strong>${h(titleize(goal.executionStatus))}</strong></p><p>${h(task?.error || task?.blockedReason || output.summary || "The CEO will clarify the goal and propose projects, tasks and employee assignments. No delivery tasks start before your confirmation.")}</p>
      ${list("Questions from the CEO", output.questions)}${list("Limitations", output.limitations)}
      ${plan ? `<section class="plan-proposal"><h3>${ready ? "Proposed work — not started" : "Plan snapshot"}</h3><p>${h(plan.summary)}</p>${list("Goal success criteria", plan.successCriteria)}${list("Assumptions", plan.assumptions)}
        ${plan.staffingRequests?.length ? `<div class="notice"><strong>Capability gap detected</strong><span>The CEO proposed ${plan.staffingRequests.length} hire${plan.staffingRequests.length === 1 ? "" : "s"}. No projects or delivery tasks can start until you decide each request and the CEO replans with the current roster.</span></div>${plan.staffingRequests.map((request) => { const record = staffing.find((item) => item.proposedName === request.name && item.templateId === request.templateId); return `<article class="plan-task"><h4>${h(request.name)}</h4><p>${h(state.jobTemplates.find((item) => item.id === request.templateId)?.name || "Missing template")} · reports to ${h(agentById(request.managerAgentId)?.name || "Missing manager")} · ${h(titleize(record?.status || "pending"))}</p><p>${h(request.reason)}</p><p>Expected work: ${h(request.expectedWorkTypes.map(titleize).join(", "))}</p></article>`; }).join("")}<button class="secondary-button" type="button" data-page-link="approvals">Review staffing proposals</button>` : ""}
        ${plan.projects.map((p) => `<div class="plan-project"><h4>${h(p.title)}</h4><p>${h(p.objective)}</p>${list("Project acceptance", p.successCriteria)}</div>`).join("") || "<p>Simple goal: direct tasks, no project required.</p>"}
        ${plan.tasks.map((t) => `<article class="plan-task"><h4>${h(t.title)}</h4><p>${h(agentById(t.assignedAgentId)?.name)} · ${h(titleize(t.workType))} · ${h(t.executionMode)} mode</p><p>Project: ${h(plan.projects.find((p) => p.key === t.projectKey)?.title || "Direct goal task")}</p><p>${h(t.instructions)}</p><p>Deliverable: ${h(t.deliverable)}</p>${list("Acceptance criteria", t.acceptanceCriteria)}<p>After: ${h(t.dependsOn.map((key) => plan.tasks.find((x) => x.key === key)?.title).join("; ") || "Ready to start")}</p>${t.executionMode !== "document" ? `<p class="notice">${t.executionMode === "external" ? "Requires a configured connector and your approval of the exact action preview." : "Requires explicit codebase selection and existing code permissions. Accepted changes can enter a tested integration branch only after a separate approval."}</p>` : ""}</article>`).join("")}</section>` : ""}
      ${(task?.messages || []).map((m) => `<blockquote><strong>Founder</strong><p>${h(m.content)}</p></blockquote>`).join("")}
      ${ready ? `<form id="approveGoalPlanForm"><p>Confirmation creates ${plan.projects.length} projects and ${plan.tasks.length} tasks. Ready work starts automatically. Internal document deliveries receive independent review, may be revised automatically up to twice, and unlock dependencies only after passing. The AI CEO then prepares a final report.</p><p class="notice"><strong>Autonomy budget</strong><span>Up to ${maxModelRuns} model runs for execution, review, retries and the final report. Code, external actions, uncertainty, repeated review failure and exhausted budgets return to you.</span></p><label class="plan-consent"><input type="checkbox" name="handoffs" required /> I approve these assignments, controlled document review and revision, and sharing accepted dependency files with the named employees within this goal. External permissions are not granted.</label><button class="primary-button" type="submit">Confirm plan and start controlled work</button></form>` : ""}
      ${budgetTask ? `<form id="extendGoalBudgetForm"><h3>Model-run budget exhausted</h3><p>${h(budgetTask.title)} stopped before another model call. Extending this invocation limit does not grant new asset permissions or external authority.</p><div class="form-grid"><label>Additional model runs<input name="additionalModelRuns" type="number" min="1" max="100" value="8" required /></label><label>Reason<input name="reason" maxlength="1000" placeholder="Why continued execution is justified" required /></label></div><input type="hidden" name="taskId" value="${h(budgetTask.id)}" /><button class="primary-button" type="submit">Approve extension and resume</button></form>` : ""}
      ${canReply ? `<form id="goalPlanFeedbackForm"><label>${task ? "Reply or request changes before approval" : "Optional planning instructions"}<textarea name="message" maxlength="20000" ${task && ["needs_input", "awaiting_review"].includes(task.status) ? "required" : ""}>${h(draft)}</textarea></label><button class="secondary-button" type="submit">${task ? "Send to CEO and replan" : "Generate CEO plan"}</button></form>` : ""}
      ${task?.executionHistory?.length ? `<details><summary>Planning history (${task.executionHistory.length})</summary>${task.executionHistory.map((run) => `<p>Attempt ${run.attempt}: ${h(run.output?.summary || run.error || run.status)}</p>`).join("")}</details>` : ""}`;
  }

  function renderProjects() {
    document.querySelector("#projectList").innerHTML = state.projects.map((project) => `<article class="project-card">
      <div class="goal-top"><h3>${h(project.title)}</h3><span class="status ${h(project.progress.status)}">${h(titleize(project.progress.status))}</span></div>
      <p>${h(project.objective)}</p><p>Goal: ${h(state.goals.find((g) => g.id === project.goalId)?.title)} · Coordinator: ${h(agentById(project.ownerAgentId)?.name)}</p>
      ${list("Project acceptance criteria", project.successCriteria)}<div class="progress"><i style="width:${project.progress.percent}%"></i></div><p>${project.progress.completed}/${project.progress.total} tasks accepted</p>
      ${project.tasks.map(taskRow).join("")}</article>`).join("") || `<div class="empty-state">Confirm a CEO plan in Goals to create projects. Simple goals may use direct tasks instead.</div>`;
  }

  function openGoal(goalId) {
    selectedGoalId = goalId;
    renderedVersion = "";
    document.querySelector("#goalPlanPanel").innerHTML = "";
    showPage("goals");
    renderPlan();
    document.querySelector("#goalPlanPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.querySelector("#goalList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-goal]");
    if (button) openGoal(button.dataset.reviewGoal);
  });
  document.querySelector("#goalPlanPanel").addEventListener("click", (event) => {
    if (event.target.closest("[data-close-goal-plan]")) { selectedGoalId = null; renderPlan(); }
  });
  document.querySelector("#goalPlanPanel").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    if (!button || button.disabled) return;
    button.disabled = true;
    const goalId = selectedGoalId;
    const goal = state.goalSummaries.find((g) => g.id === goalId);
    try {
      if (form.id === "approveGoalPlanForm") {
        await api(`/api/goals/${goalId}/approve-plan`, { method: "POST", body: JSON.stringify({ proposalId: goal.planningTask.output.proposalId, controlledAutonomy: true }) });
        toast("Plan confirmed. Controlled work, independent review and the approved budget are active.");
      } else if (form.id === "extendGoalBudgetForm") {
        const values = Object.fromEntries(new FormData(form));
        values.additionalModelRuns = Number(values.additionalModelRuns);
        await api(`/api/goals/${goalId}/extend-budget`, { method: "POST", body: JSON.stringify(values) });
        toast("Budget extension approved. The blocked task is queued to resume.");
      } else {
        await api(`/api/goals/${goalId}/plan`, { method: "POST", body: JSON.stringify({ message: new FormData(form).get("message") }) });
        toast("The CEO is queued to plan. No delivery work has started.");
      }
      form.reset();
      await refreshData({ quiet: true });
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  });
  return { renderGoals, renderProjects, openGoal };
}
