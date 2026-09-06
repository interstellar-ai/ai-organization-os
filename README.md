# AI Organization OS MVP

This is a runnable first version of an AI Organization OS. It validates the smallest goal-driven organization loop:

```text
Founder goal → CEO plan or staffing proposal → Founder approval → employee execution → independent review and bounded revision → CEO report
```

![AI Organization OS Founder Command Center](docs/images/founder-command-center.png)

AI Organization OS is available under the [Apache License 2.0](LICENSE). See the [2–3 minute demo walkthrough](docs/DEMO.md) for a concise tour of the Founder console, permission model, general work routing, and protected Codex execution.

Product documentation, project notes, operating rules, canonical addresses, and upload requirements are indexed in [`docs/PROJECT_KNOWLEDGE.md`](docs/PROJECT_KNOWLEDGE.md) and [`AGENTS.md`](AGENTS.md).

## Quick start

```bash
npm start
```

Open <http://localhost:3333>. On first launch, the server creates an example AI organization, classified assets, access policies, and one safety-policy memory. Runtime data is stored transactionally in the ignored `data/organization.sqlite` database. An existing `data/state.json` file is imported once; set `AI_ORG_STORE=json` only for legacy development compatibility.

To enable model-backed employee work, install the [Codex CLI](https://learn.chatgpt.com/docs/codex/cli) and sign in with ChatGPT before starting the server:

```bash
npm install -g @openai/codex
codex login
```

The Projects page accepts general Founder work requests across product, research, design, software, content, sales, operations, and general work. The MVP classifies and routes requests to an employee. Non-software employees use Codex to produce actual text documents, ask clarifying questions, or report a blocker. Software work uses the separate protected coding executor. No separately billed Responses API integration is required; Codex account usage limits still apply.

Start on **Home** with an ongoing AI CEO conversation. Ask about progress, blockers, employee work, strategy, or new ideas. Every CEO reply is grounded in a timestamped host-generated organization summary; discussion itself cannot execute work or use external tools. When a new outcome is appropriate, the CEO may suggest a goal, which you explicitly create before planning begins. The AI CEO then proposes projects, employee assignments, deliverables, and dependencies, or asks clarifying questions. If a required role is missing, it may instead propose an employee from an existing job template. The Founder approves or rejects every hire in **Approvals**; only an approved decision creates an employee, and the CEO then replans against the current roster. Review a complete work proposal in **Goals** and choose **Confirm plan and start work**. Only then does the system create real **Projects** and queue employee tasks. Simple goals may use direct tasks without a project.

Plan confirmation activates controlled autonomy for the displayed scope and budget. Internal document tasks are independently reviewed and can be revised automatically up to twice. Passing work unlocks accepted dependency handoffs; exceptions return to the Founder. Code deliveries require Founder acceptance and a second exact integration approval before they can enter the tested `codex/integration` branch. External work requires a configured connector and exact-payload approval. After all required work is accepted—and code is integrated—the AI CEO generates a final evidence and outcome report. **New work request** remains available for standalone work. See [Goal planning](docs/GOAL_PLANNING.md), [Controlled autonomy](docs/CONTROLLED_AUTONOMY.md), [Code integration](docs/CODE_INTEGRATION.md), [External connectors](docs/EXTERNAL_CONNECTORS.md), and [Durable runtime](docs/DURABLE_RUNTIME.md).

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
| CEO conversation and live organization summary | `GET /api/ceo/conversation` |
| Send a non-executing message to the AI CEO | `POST /api/ceo/conversation/messages` |
| Confirm a CEO-suggested goal | `POST /api/ceo/conversation/messages/:id/create-goal` |
| Agent management | `GET/POST /api/agents` |
| Job templates | `GET/POST /api/job-templates` |
| Preview a template-based hire | `POST /api/job-templates/preview` |
| Goal input | `GET/POST /api/goals` |
| Request CEO planning or clarification | `POST /api/goals/:id/plan` |
| Revise an unapproved proposal | `POST /api/goals/:id/replan` |
| Approve the current proposal and create work | `POST /api/goals/:id/approve-plan` |
| Staffing proposals | `GET /api/staffing-requests` |
| Approve or reject a template-based hire | `POST /api/staffing-requests/:id/decision` |
| Approve a bounded model-run extension | `POST /api/goals/:id/extend-budget` |
| Projects, progress, and associated tasks | `GET /api/projects` |
| Bind a blocked plan code task to an explicit codebase | `POST /api/tasks/:id/configure-code` |
| Goal progress and evidence | `GET /api/goals/:id/summary` |
| Task management/execution | `GET/POST /api/tasks`, `POST /api/tasks/:id/run` |
| Classify and route a Founder work request | `POST /api/work-requests` |
| Reply, request revision, or retry general work | `POST /api/tasks/:id/feedback` |
| Accept a standalone, code, or escalated delivery | `POST /api/tasks/:id/accept` |
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
| Integration requests | `GET /api/integration-requests`, `POST /api/tasks/:id/request-integration` |
| Approve or reject isolated code integration | `POST /api/integration-requests/:id/decision` |
| Connector readiness | `GET /api/connectors` |
| Prepare an exact external action | `POST /api/tasks/:id/configure-external` |
| External action history | `GET /api/external-actions` |
| Approve or reject an external action | `POST /api/external-actions/:id/decision` |

The current tool set includes `goal.plan`, `delivery.review`, `goal.analyze`, `solution.design`, `mvp.inspect`, `workflow.validate`, `iteration.record`, `memory.search`, `memory.write`, `task.list`, `goal.list`, `asset.catalog`, `asset.inspect`, `code.codex`, `agent.general`, and `echo`. Tools are registered on an allowlist, and unregistered tools are rejected. Managed model tools run only through assigned running tasks, not the generic tool endpoint. Every completed task requires evidence.

## Current boundaries

- The scheduler checks every second for pending tasks whose dependencies are complete, then atomically claims them with persisted leases. It runs by priority, with at most two active tasks and one per employee. Controlled plans retry transient provider failures up to three attempts. Interrupted or expired idempotent work is safely requeued.
- New goal plans use real Codex reasoning and host-validated project/task graphs. Up to five projects and sixteen tasks can be proposed. If a role is missing, the CEO may return up to five staffing requests that reference existing templates and managers instead of work. Hiring requires an explicit Founder decision; once all requests are decided, replanning starts automatically. Clarification, staffing and plan revision do not launch delivery work.
- Home provides a persistent CEO conversation. The model sees only a host-generated, timestamped operational summary and recent CEO messages; it has no local tools, external tools, asset access, or authority to mutate the organization. A goal suggestion appears as a separate Founder-confirmed action.
- Legacy fixed five-stage workflows are preserved as historical data; new Home and goal-plan requests use the CEO planner. Approved plans cannot yet be edited in place.
- General execution returns Markdown, text, CSV, or JSON from supplied context. It does not retrieve private assets or memories automatically or directly hold external credentials. Live research, email, CRM creation and webhook publishing run through separate host-controlled connectors after an exact action preview and Founder approval. Image generation remains unconnected.
- General outputs include file hashes and usage records. These prove that content was returned, not that its claims are correct. Approved plan documents require independent criterion review and may auto-revise twice; standalone and escalated work requires Founder review. Feedback preserves prior versions.
- Controlled plans enforce a displayed model-invocation budget and automatically generate a final CEO report. Delivery completion remains separate from verified business outcomes.
- SQLite WAL storage provides transactional, crash-durable local state and imports legacy JSON. Atomic leased claims prevent two local processes from claiming the same task. It is a strong single-node foundation, not a horizontally scaled multi-tenant database or broker.
- Live research supports explicit public HTTPS sources and optional Brave Search. Email uses Resend, CRM uses HubSpot, and publishing uses a configured HTTPS webhook. Provider credentials remain server-side environment variables.
- Every external action creates a one-use scoped grant and audit trail. Side-effect failures after invocation are marked `uncertain`; the system requires destination verification instead of automatic retry.
- Job templates provide role inheritance. Projects now own delivery tasks, but general project-scoped asset policies remain deferred. Plan confirmation authorizes only the displayed assignments and accepted dependency-artifact handoffs within that goal.
- The Employees page can hire an employee from a job template after previewing inherited responsibilities, capabilities, matching policies, and default access. Role defaults are copied at hire time; template editing and employee overrides are not yet exposed.
- CEO-proposed hiring uses the same template inheritance. Approval creates no temporary or project-specific grant: effective access still comes from current policies, task scope and any separately approved access request. Employees cannot create themselves or directly approve staffing.
- Protected tools require employee identity, an active assigned task, a non-expired task capability, and an allowed access-policy decision. The authorized asset catalog hides assets outside the employee's allowed or requestable policy scope.
- `code.codex` requires `read`, `modify`, and `execute` permission on the assigned source-code asset before Codex starts. Each run uses a detached local Git worktree, the `workspace-write` Codex sandbox, a sanitized child-process environment, bounded output, and a timeout.
- Code tasks require explicit codebase selection and existing permissions. Accepted deliveries create a second approval request. Approval scans changed files for credential patterns, commits the reviewed worktree, cherry-picks it into `codex/integration`, and runs an allowlisted test command. It cannot push, merge `main` or deploy. Downstream code waits for successful integration and starts from that branch.
- The HTTP server binds to loopback and checks browser POST origins and JSON content types. It is still a trusted single-Founder development surface without authentication, not a production security boundary. A production deployment must derive identity from signed runtime credentials and enforce process, network, and tenant isolation.

## Iteration roadmap

1. **v0.4: Access governance foundation** — Persistent job templates, policy impact preview, approval-required rules, temporary grants, authorized asset discovery, task capabilities, and enforced protected-tool checks.
2. **v0.5: Codex-first coding executor** — Add protected Codex work orders, isolated Git worktrees, runtime health, evidence, and a Founder-facing assignment form.
3. **v0.6: General document execution** — Codex-backed employees, validated deliverables, clarification, revision history, human acceptance, bounded concurrency, and restart recovery. An LLM-backed planner/router, database-backed queue, cancellation, budgets, and independent review remain next steps.
4. **v0.7: Goal-to-project orchestration** — CEO clarification, validated proposals, explicit approval, atomic project/task creation, assigned employees, accepted dependency handoffs, and aggregate delivery progress. Scoped external connectors remain future work.
5. **v0.8: Controlled autonomy** — Add independent document review, automatic revision, transient retry, model-run budgets, escalation, and final CEO reporting.
6. **v0.9: Durable controlled execution** — Add transactional SQLite state, leased claims and recovery, approved code integration, public-web research, and scoped email, CRM and publishing connectors.
7. **v0.10: Organizational learning layer** — Add tiered long-term memory, permission-filtered retrieval, reviewer and employee performance, and cost monitoring.
8. **v1.0: Multi-tenant edition** — Add PostgreSQL, distributed workers, user/team authentication, managed secrets, isolated execution environments, currency budgets, compliance, and observability.

The confirmed first scenario is an AI Software Product Studio. Document collaboration runs through approved plans and controlled quality gates; code and external actions now have separate approval-bound execution paths. Business-outcome verification remains distinct: a 100% delivery indicator is not proof that a business goal has been achieved.
