export function createGoalUI({ state, api, escapeHtml: h, titleize, agentById, showPage, refreshData, toast }) {
  let selectedGoalId = null;
  let renderedVersion = "";
  const taskRow = (task) => `<div class="task-row"><div><strong>${h(task.title)}</strong><span>${h(agentById(task.assignedAgentId)?.name || "Unassigned")} · ${h(titleize(task.status))}</span>${task.dependsOn.length ? `<small>After: ${task.dependsOn.map((id) => h(state.tasks.find((t) => t.id === id)?.title || "Missing task")).join("; ")}</small>` : ""}</div><button class="text-button" data-work-task="${h(task.id)}">Open work</button></div>`;
  const list = (title, items = []) => items.length ? `<h4>${title}</h4><ul>${items.map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : "";

  function renderGoals() {
    document.querySelector("#goalList").innerHTML = state.goalSummaries.map((goal) => `<article class="goal-detail">
      <div class="goal-top"><h3>${h(goal.title)}</h3><span class="status ${h(goal.executionStatus)}">${h(titleize(goal.executionStatus))}</span></div>
      <p>${h(goal.description)}</p><div class="progress"><i style="width:${goal.progress.percent}%"></i></div>
      <p>${goal.progress.completed}/${goal.progress.total} ${goal.planningTask ? "deliveries accepted" : "legacy tasks completed"} · ${goal.projects?.length || 0} projects</p>
      <p>${h(goal.nextAction)}</p>${goal.approvedPlanId ? `<p class="notice">Delivery progress is not business success. Goal outcome remains unverified.</p>` : ""}
      <div class="brief-actions"><button class="secondary-button" data-review-goal="${h(goal.id)}">${goal.planningTask ? "Open CEO plan and conversation" : "Plan this goal with AI CEO"}</button>${goal.projects?.length ? `<button class="text-button" data-page-link="projects">View projects</button>` : ""}</div>
      ${goal.tasks.length ? `<details><summary>${goal.tasks.length} tasks</summary>${goal.tasks.map(taskRow).join("")}</details>` : ""}</article>`).reverse().join("") || `<div class="empty-state">Start by describing your goal on Home.</div>`;
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
    const ready = !goal.approvedPlanId && task?.status === "awaiting_review" && plan;
    const canReply = !goal.approvedPlanId && (!task || ["blocked", "failed", "needs_input", "awaiting_review"].includes(task.status));
    panel.innerHTML = `<div class="panel-heading"><div><span class="section-kicker">GOAL → CEO PLAN → YOUR CONFIRMATION</span><h3>${h(goal.title)}</h3></div><button class="text-button" data-close-goal-plan>Close</button></div>
      <p><strong>${h(titleize(goal.executionStatus))}</strong></p><p>${h(task?.error || task?.blockedReason || output.summary || "The CEO will clarify the goal and propose projects, tasks and employee assignments. No delivery tasks start before your confirmation.")}</p>
      ${list("Questions from the CEO", output.questions)}${list("Limitations", output.limitations)}
      ${plan ? `<section class="plan-proposal"><h3>${ready ? "Proposed work — not started" : "Plan snapshot"}</h3><p>${h(plan.summary)}</p>${list("Goal success criteria", plan.successCriteria)}${list("Assumptions", plan.assumptions)}
        ${plan.projects.map((p) => `<div class="plan-project"><h4>${h(p.title)}</h4><p>${h(p.objective)}</p>${list("Project acceptance", p.successCriteria)}</div>`).join("") || "<p>Simple goal: direct tasks, no project required.</p>"}
        ${plan.tasks.map((t) => `<article class="plan-task"><h4>${h(t.title)}</h4><p>${h(agentById(t.assignedAgentId)?.name)} · ${h(titleize(t.workType))} · ${h(t.executionMode)} mode</p><p>Project: ${h(plan.projects.find((p) => p.key === t.projectKey)?.title || "Direct goal task")}</p><p>${h(t.instructions)}</p><p>Deliverable: ${h(t.deliverable)}</p>${list("Acceptance criteria", t.acceptanceCriteria)}<p>After: ${h(t.dependsOn.map((key) => plan.tasks.find((x) => x.key === key)?.title).join("; ") || "Ready to start")}</p>${t.executionMode !== "document" ? `<p class="notice">${t.executionMode === "external" ? "Blocked until an approved external connector exists. Planning does not perform this action." : "Requires your explicit codebase selection and existing code permissions. Changes stay in an isolated worktree; applying them is manual."}</p>` : ""}</article>`).join("")}</section>` : ""}
      ${(task?.messages || []).map((m) => `<blockquote><strong>Founder</strong><p>${h(m.content)}</p></blockquote>`).join("")}
      ${ready ? `<form id="approveGoalPlanForm"><p>Confirmation creates ${plan.projects.length} projects and ${plan.tasks.length} tasks. Ready tasks start automatically; dependent work waits for accepted deliverables.</p><label class="plan-consent"><input type="checkbox" name="handoffs" required /> I approve these assignments and sharing accepted dependency files with the named employees within this goal. External permissions are not granted.</label><button class="primary-button" type="submit">Confirm plan and start work</button></form>` : ""}
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
        await api(`/api/goals/${goalId}/approve-plan`, { method: "POST", body: JSON.stringify({ proposalId: goal.planningTask.output.proposalId }) });
        toast("Plan confirmed. Projects and tasks are created; ready work is queued.");
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
