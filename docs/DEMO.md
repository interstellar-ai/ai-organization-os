# AI Organization OS: 2–3 Minute Demo

This walkthrough demonstrates the current open-source MVP without claiming capabilities that are still on the roadmap.

## Preparation

```bash
npm test
npm start
```

Open <http://localhost:3333/>. To show the Codex coding workflow, install the Codex CLI and sign in with ChatGPT before recording.

Use a clean local runtime state. Do not record personal goals, credentials, browser tabs, terminal history, account identifiers, or local filesystem paths.

## Recording script

### 0:00–0:25 — Founder Command Center

Show the Home page.

> AI Organization OS turns a Founder's natural-language intent into an observable workflow of goals, specialized AI employees, permissions, tasks, evidence, and human decisions. It is designed as an operating layer, not a collection of independent chatbots.

Point out the Founder brief, action center, organization metrics, and active-goal overview.

### 0:25–0:55 — Organization and accountability

Open Employees and switch between Directory and Organization views.

> Employees have explicit roles, capabilities, reporting lines, assignments, and work history. The Founder can inspect both individual responsibility and the organization structure.

Open one employee profile and briefly show current work and access information.

### 0:55–1:30 — Permissioned assets and tools

Open Access and show Employees, Assets, Policies, Templates, and Requests.

> Permissions are enforced outside the language model. A protected operation must match the employee identity, active task scope, asset policy, requested action, and any required approval. Agents cannot grant access to themselves.

Show an effective-access explanation or policy impact preview. Do not approve an external action during the recording.

### 1:30–2:10 — General work request and routed execution

Open Projects and select **New work request**.

> The Founder describes a desired business outcome rather than choosing a technical tool. The system classifies the request, assigns the appropriate employee, and selects an approved executor. Product, research, design, software, content, sales, operations, and general work share the same intake contract.

Point out the execution-coverage badge and notice.

> Codex is currently the only connected model executor, so software-development requests can run while other specialties remain visibly blocked with a next action. Every Codex task runs in a detached Git worktree with workspace-only writes and cannot push, merge, deploy, or use external services.

Do not submit the form unless the demo uses a disposable repository and a deliberately small task.

### 2:10–2:40 — Evidence and audit

Open Reports and Audit.

> Work is not completed merely because an agent says it is done. The system requires output and evidence, exposes blockers and approvals, and records execution and access events for review.

### 2:40–3:00 — Close

Return to Home or Projects.

> The current v0.5 MVP proves the controlled organization loop. Next, the project will add Founder diff review and apply-or-reject controls, an API-backed AI CEO and planner, durable execution, and scoped external connectors.

End with the repository URL:

<https://github.com/interstellar-ai/ai-organization-os>

## Suggested recording title

**AI Organization OS v0.5 — Permissioned AI Employees with Codex**

## Suggested description

AI Organization OS is an Apache-2.0 open-source operating layer for coordinating AI employees, goals, permissions, tools, evidence, and Founder approvals. This short demo shows the runnable v0.5 MVP and its protected Codex coding workflow.
