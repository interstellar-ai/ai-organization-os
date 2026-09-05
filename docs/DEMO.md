# AI Organization OS: 2–3 Minute Demo

This walkthrough demonstrates the current open-source MVP without claiming capabilities that are still on the roadmap.

## Preparation

```bash
npm test
npm start
```

Open <http://localhost:3333/>. Install the Codex CLI and sign in with ChatGPT before starting the server to show real employee execution.

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

On Home, submit a small fictional document-only goal with two deliverables. In Goals, inspect the CEO proposal before confirming it. Then show the resulting Projects and employee tasks. For a shorter standalone demonstration, use **New work request** in Projects.

> The Founder describes a desired business outcome rather than choosing a technical tool. The system classifies the request, assigns the appropriate employee, and selects an approved executor. Product, research, design, software, content, sales, operations, and general work share the same intake contract.

Point out the execution-coverage badge and notice.

> Codex is the connected model provider. General employees produce documents from supplied context, ask questions, and revise their work. Coding uses a separate protected worktree executor. General work cannot browse, send messages, publish, or deploy.

For a small real demo, select Product strategy and request a product brief for a fictional reading-list app with exactly three acceptance criteria. Open the returned Markdown document in **Open work and delivery**. Show the download link, feedback box, and acceptance action. Do not submit a software task unless using a disposable repository.

### 2:10–2:40 — Evidence and audit

Open Reports and Audit.

> Work is not completed merely because an agent says it is done. The system requires output and evidence, exposes blockers and approvals, and records execution and access events for review.

### 2:40–3:00 — Close

Return to Home or Projects.

> The v0.7 development version connects goals to CEO proposals, approved projects, assigned employee tasks, and accepted document handoffs. Next come stronger quality gates, code integration, durable execution, budgets, and scoped external connectors.

End with the repository URL:

<https://github.com/interstellar-ai/ai-organization-os>

## Suggested recording title

**AI Organization OS — Permissioned AI Employees and Real Deliverables**

## Suggested description

AI Organization OS is an Apache-2.0 open-source operating layer for coordinating AI employees, goals, permissions, tools, evidence, and Founder approvals. This demo shows general document delivery with Codex, feedback and acceptance, alongside the separate protected coding workflow.
