# AI Organization OS MVP

This is a runnable first version of an AI Organization OS. It validates the smallest goal-driven organization loop:

```text
Founder goal → CEO clarification and proposal → Founder approval → projects and tasks → employee execution → accepted handoffs → delivery progress
```

![AI Organization OS Founder Command Center](docs/images/founder-command-center.png)

AI Organization OS is available under the [Apache License 2.0](LICENSE). See the [2–3 minute demo walkthrough](docs/DEMO.md) for a concise tour of the Founder console, permission model, general work routing, and protected Codex execution.

Product documentation, project notes, operating rules, canonical addresses, and upload requirements are indexed in [`docs/PROJECT_KNOWLEDGE.md`](docs/PROJECT_KNOWLEDGE.md) and [`AGENTS.md`](AGENTS.md).

## Quick start

```bash
npm start
```

Open <http://localhost:3333>. On first launch, the server creates an example AI organization, classified assets, access policies, and one safety-policy memory. Runtime data is stored in `data/state.json`.

To enable model-backed employee work, install the [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) and sign in with ChatGPT before starting the server:

```bash
npm install -g @openai/codex
codex login
```

The Projects page accepts general Founder work requests across product, research, design, software, content, sales, operations, and general work. The MVP classifies and routes requests to an employee. Non-software employees use Codex to produce actual text documents, ask clarifying questions, or report a blocker. Software work uses the separate protected coding executor. No separately billed Responses API integration is required; Codex account usage limits still apply.

Start on **Home** with an outcome and constraints. The AI CEO proposes projects, employee assignments, deliverables, and dependencies, or asks clarifying questions. Review the proposal in **Goals** and choose **Confirm plan and start work**. Only then does the system create real **Projects** and queue employee tasks. Simple goals may use direct tasks without a project.

Open a task in **Projects** to read or download files, send feedback, and **Accept delivery**. Accepted dependency documents are supplied to the next assigned employee within the approved plan. A general task stays `awaiting_review` until accepted. **New work request** remains available for standalone work. See [Goal planning](docs/GOAL_PLANNING.md) and [General Agent execution](docs/GENERAL_AGENT_EXECUTION.md).

Run the test suite with:

```bash
npm test
```

## Contributing

Contributions are welcome. Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening an issue or pull request. Never include credentials, personal data, local paths, or runtime state in public contributions.

## MVP API

| Capability | Endpoint |
| --- | --- |
| Health check | `GET /api/health` |
| Agent management | `GET/POST /api/agents` |
| Job templates | `GET/POST /api/job-templates` |
| Preview a template-based hire | `POST /api/job-templates/preview` |
| Goal input | `GET/POST /api/goals` |
| Request CEO planning or clarification | `POST /api/goals/:id/plan` |
| Revise an unapproved proposal | `POST /api/goals/:id/replan` |
| Approve the current proposal and create work | `POST /api/goals/:id/approve-plan` |
| Projects, progress, and associated tasks | `GET /api/projects` |
| Bind a blocked plan code task to an explicit codebase | `POST /api/tasks/:id/configure-code` |
| Goal progress and evidence | `GET /api/goals/:id/summary` |
| Task management/execution | `GET/POST /api/tasks`, `POST /api/tasks/:id/run` |
| Classify and route a Founder work request | `POST /api/work-requests` |
| Reply, request revision, or retry general work | `POST /api/tasks/:id/feedback` |
| Accept a general delivery | `POST /api/tasks/:id/accept` |
| Download a current artifact | `GET /api/tasks/:id/artifacts/:index` |
| Codex runtime status | `GET /api/codex/status` |
| Create a protected coding task | `POST /api/coding/tasks` |
| Basic memory | `GET /api/memories?q=...`, `POST /api/memories` |
| Tool registry | `GET /api/tools`, `POST /api/tools/execute` |
| Audit events | `GET /api/events` |
| Asset registry | `GET/POST /api/assets` |
| Authorized asset catalog | `GET /api/assets/catalog?agentId=...&q=...` |
| Access policies | `GET/POST /api/policies` |
| Preview policy impact | `POST /api/policies/preview` |
| Effective employee access | `GET /api/access/effective?agentId=...&assetId=...` |
| Access requests | `GET/POST /api/access-requests` |
| Approve or reject access | `POST /api/access-requests/:id/decision` |
| Consume authorized access | `POST /api/access/consume` |

The current tool set includes `goal.plan`, `goal.analyze`, `solution.design`, `mvp.inspect`, `workflow.validate`, `iteration.record`, `memory.search`, `memory.write`, `task.list`, `goal.list`, `asset.catalog`, `asset.inspect`, `code.codex`, `agent.general`, and `echo`. Tools are registered on an allowlist, and unregistered tools are rejected. `agent.general` and `goal.plan` run through assigned running tasks, not the generic tool endpoint. Every completed task requires evidence.

## Current boundaries

- The scheduler checks every second for pending tasks whose dependencies are complete, then executes them by priority, with at most two running tasks and one per employee. Interrupted tasks become failed on restart and require an explicit retry.
- New goal plans use real Codex reasoning and host-validated project/task graphs. Up to five projects and sixteen tasks can be proposed. Clarification and plan revision do not launch delivery work. Approval is atomic and repeat-safe.
- Legacy fixed five-stage workflows are preserved as historical data; new Home and goal-plan requests use the CEO planner. Approved plans cannot yet be edited in place.
- General execution returns Markdown, text, CSV, or JSON from supplied context. It does not retrieve private assets or memories automatically, browse, send messages, publish, or generate images. Design output is a textual specification; research is analysis of supplied material or labeled general knowledge.
- General outputs include file hashes and usage records. These prove that content was returned, not that its claims are correct; Founder review is required. Feedback preserves prior versions.
- JSON storage is suitable for a single-machine MVP, but not for multi-process or high-concurrency workloads.
- Access requests and local approval decisions are implemented, but high-impact external actions do not yet have connectors or an execution approval gate.
- One-use grants are consumed only when an executor calls the controlled access endpoint. Time-bound grants expire automatically, but no external connector uses them yet.
- Job templates provide role inheritance. Projects now own delivery tasks, but general project-scoped asset policies remain deferred. Plan confirmation authorizes only the displayed assignments and accepted dependency-artifact handoffs within that goal.
- The Employees page can hire an employee from a job template after previewing inherited responsibilities, capabilities, matching policies, and default access. Role defaults are copied at hire time; template editing and employee overrides are not yet exposed.
- Protected tools require employee identity, an active assigned task, a non-expired task capability, and an allowed access-policy decision. The authorized asset catalog hides assets outside the employee's allowed or requestable policy scope.
- `code.codex` requires `read`, `modify`, and `execute` permission on the assigned source-code asset before Codex starts. Each run uses a detached local Git worktree, the `workspace-write` Codex sandbox, a sanitized child-process environment, bounded output, and a timeout.
- Code tasks require explicit codebase selection and existing permissions. They cannot push, merge or deploy. Plan-generated code deliveries await acceptance, but review-and-apply, automatic code chaining between isolated worktrees, and automatic worktree cleanup remain unavailable.
- The HTTP server binds to loopback and checks browser POST origins and JSON content types. It is still a trusted single-Founder development surface without authentication, not a production security boundary. A production deployment must derive identity from signed runtime credentials and enforce process, network, and tenant isolation.

## Iteration roadmap

1. **v0.4: Access governance foundation** — Persistent job templates, policy impact preview, approval-required rules, temporary grants, authorized asset discovery, task capabilities, and enforced protected-tool checks.
2. **v0.5: Codex-first coding executor** — Add protected Codex work orders, isolated Git worktrees, runtime health, evidence, and a Founder-facing assignment form.
3. **v0.6: General document execution** — Codex-backed employees, validated deliverables, clarification, revision history, human acceptance, bounded concurrency, and restart recovery. An LLM-backed planner/router, database-backed queue, cancellation, budgets, and independent review remain next steps.
4. **v0.7: Goal-to-project orchestration** — CEO clarification, validated proposals, explicit approval, atomic project/task creation, assigned employees, accepted dependency handoffs, and aggregate delivery progress. Scoped external connectors remain future work.
5. **v0.8: Organizational learning layer** — Add task evaluation, tiered long-term memory, knowledge retrieval, agent performance, and cost monitoring.
6. **v1.0: Multi-tenant edition** — Add user/team permissions, secret management, isolated execution environments, budget controls, compliance, and observability.

The confirmed first scenario is an AI Software Product Studio. Document-based collaboration now runs through approved plans. Code integration, autonomous quality gates, business-outcome verification, and scoped external connectors remain distinct next steps. A 100% delivery indicator is not proof that a business goal has been achieved.
