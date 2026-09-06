# Goal-to-Project Planning

## Product contract

Goals describe desired outcomes. Projects organize bounded efforts toward those outcomes. Tasks are concrete employee work orders. Simple goals may create direct tasks without an artificial project layer.

The Founder submits an outcome and constraints on Home. A protected `goal.plan` task invokes the AI CEO through the existing Codex-backed general runtime. The CEO asks questions when essential context is missing, or produces a machine-readable project and task proposal. It does not execute those tasks itself.

The Goals page shows goal success criteria, assumptions, project objectives, employee assignments, deliverables, acceptance criteria, execution modes, and dependencies. The Founder can reply or request changes. **Confirm plan and start work** creates the approved projects and tasks atomically; ready tasks then run automatically.

## Execution and handoffs

The scheduler respects dependencies, priority, the two-task concurrency limit, and one running task per employee. A downstream task waits until its dependencies are accepted, not merely generated. The host supplies only the accepted outputs of the dependency tasks in the same approved goal plan. Confirmation explicitly authorizes these named-employee handoffs, not unrestricted organizational memory or asset access.

Document employees return actual files or questions. In a newly approved controlled-autonomy plan, an independent reviewer checks every acceptance criterion. A passing review accepts the delivery and unlocks downstream work; a failed review can trigger up to two automatic corrections. Uncertainty, repeated review failure, unavailable review, exhausted budget, code delivery, and external action return to the Founder. Standalone document work keeps explicit Founder acceptance. See [Controlled autonomy](CONTROLLED_AUTONOMY.md).

Projects display their coordinator, success criteria, tasks, blockers, and accepted-delivery progress. Goals aggregate those projects and direct tasks. All accepted deliveries change execution status to `delivered`, while business outcome remains `unverified`. The system does not equate a plan, marketing draft, or code change with users, revenue, or other external results.

## Proposal validation and confirmation

- The host accepts at most five projects and sixteen tasks, bounded strings, unique task/project keys, valid employee identifiers, and compatible work-type capabilities.
- Dependencies must refer to tasks in the proposal and form an acyclic graph. Projects cannot be empty. Simple direct-task plans use no projects.
- The model proposes only work, not tool names, permissions, credentials, file paths, or application statuses. The host chooses adapters and task scopes.
- Confirmation requires the current host-generated proposal identifier and an awaiting-approval planning result with evidence. Employee capabilities are rechecked.
- All project/task records are prepared in an isolated state copy and saved once. Invalid confirmation writes no partial projects. Repeating a successful confirmation returns the existing result without duplicate tasks.
- Replies invalidate approval of the previous proposal. Approved plans cannot yet be revised in place; use a new goal for material scope changes. Legacy work is preserved and is not automatically re-executed.

## Modes and limitations

| Mode | Current behavior |
| --- | --- |
| Document | General employee writes files using the goal brief and approved accepted dependency outputs. |
| Code | Founder explicitly selects a configured source-code asset. Existing read/modify/execute policy checks still apply. Output remains in an isolated worktree and awaits review; acceptance creates a separate integration approval. |
| External | Remains blocked until the Founder prepares and approves an exact request for a configured research, email, CRM, or publishing connector. Retrying as a document task cannot silently perform or replace it. |

Downstream code waits for accepted upstream code to pass the approved `codex/integration` test gate, then starts from that branch. The planner must keep essential unavailable business actions visible instead of quietly substituting document drafts. Model classification of intent is not a security control; external credentials and connector invocation remain in the host application.

Planning and worker execution use transactional local SQLite state, persisted leases, bounded model-run budgets, transient retries, independent document review, automatic revision, and a final CEO report. Interrupted idempotent tasks are requeued; interrupted external side effects become uncertain. This remains a single-node trusted runtime, not a durable multi-tenant service. Cancellation, in-place replanning, project-scoped asset policy, distributed workers, and broader business-outcome verification remain future work.

## API

- `POST /api/goals` creates a goal record; Home follows it with planning.
- `POST /api/goals/:id/plan` queues planning; optional `message` clarifies or revises an unapproved plan. `replan` is an alias for this behavior, not the legacy deterministic planner.
- `POST /api/goals/:id/approve-plan` accepts `proposalId`, explicit `controlledAutonomy: true` consent, and optional `codeAssets` mapping task keys to explicit existing asset IDs. Omitting a code asset leaves that task blocked. Confirmation grants no new asset permissions.
- `POST /api/goals/:id/extend-budget` accepts a budget-blocked `taskId`, `additionalModelRuns`, and a required reason. It increases only the invocation limit and resumes that task; it grants no asset or external permission.
- `GET /api/goals/:id/summary` includes the planning conversation, approved work, projects, delivery progress, and outcome status.
- `GET /api/projects` returns projects with their tasks and delivery progress.
- `POST /api/tasks/:id/configure-code` accepts an explicit `assetId` for blocked or failed plan code work. Permissions are checked before execution.
- `POST /api/tasks/:id/request-integration` creates or returns the separate integration request for an accepted code delivery.
- `POST /api/tasks/:id/configure-external` validates and stores a non-executing external action preview.
- Integration and external-action decision endpoints require a recorded Founder reason.
- Existing task feedback, artifact download, and acceptance endpoints handle delivery work.
