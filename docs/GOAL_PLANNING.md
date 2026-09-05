# Goal-to-Project Planning

## Product contract

Goals describe desired outcomes. Projects organize bounded efforts toward those outcomes. Tasks are concrete employee work orders. Simple goals may create direct tasks without an artificial project layer.

The Founder submits an outcome and constraints on Home. A protected `goal.plan` task invokes the AI CEO through the existing Codex-backed general runtime. The CEO asks questions when essential context is missing, or produces a machine-readable project and task proposal. It does not execute those tasks itself.

The Goals page shows goal success criteria, assumptions, project objectives, employee assignments, deliverables, acceptance criteria, execution modes, and dependencies. The Founder can reply or request changes. **Confirm plan and start work** creates the approved projects and tasks atomically; ready tasks then run automatically.

## Execution and handoffs

The scheduler respects dependencies, priority, the two-task concurrency limit, and one running task per employee. A downstream task waits until its dependencies are accepted, not merely generated. The host supplies only the accepted outputs of the dependency tasks in the same approved goal plan. Confirmation explicitly authorizes these named-employee handoffs, not unrestricted organizational memory or asset access.

Document employees return actual files or questions. Founder acceptance unlocks downstream work. A quality-review task may be assigned to a different employee; the host rejects a review task assigned to the author of one of its direct inputs. Review content itself still requires human judgment and acceptance.

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
| Code | Founder explicitly selects a configured source-code asset. Existing read/modify/execute policy checks still apply. Output remains in an isolated worktree and awaits review; acceptance does not apply or publish it. |
| External | Remains blocked with a connector requirement. Retrying as a document task cannot silently perform or replace the external action. |

Code chaining across isolated worktrees is blocked until a reviewed apply/integration workflow exists. The planner must keep essential unavailable business actions visible instead of quietly substituting document drafts. Model classification of intent is not a security control; actual external tools are not exposed by the general provider.

Planning and worker execution use local JSON persistence and the existing CLI sandbox boundary, not a durable multi-tenant queue. Runtime failures and interrupted tasks require an explicit retry. Budget enforcement, cancellation, in-place replanning, project-scoped asset policy, automatic review gates, code integration, and business-outcome evidence are future work.

## API

- `POST /api/goals` creates a goal record; Home follows it with planning.
- `POST /api/goals/:id/plan` queues planning; optional `message` clarifies or revises an unapproved plan. `replan` is an alias for this behavior, not the legacy deterministic planner.
- `POST /api/goals/:id/approve-plan` accepts `proposalId` and optional `codeAssets` mapping task keys to explicit existing asset IDs. Omitting a code asset leaves that task blocked. Confirmation grants no new asset permissions.
- `GET /api/goals/:id/summary` includes the planning conversation, approved work, projects, delivery progress, and outcome status.
- `GET /api/projects` returns projects with their tasks and delivery progress.
- `POST /api/tasks/:id/configure-code` accepts an explicit `assetId` for blocked or failed plan code work. Permissions are checked before execution.
- Existing task feedback, artifact download, and acceptance endpoints handle delivery work.
