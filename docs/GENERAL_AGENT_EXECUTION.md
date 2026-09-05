# General Agent Execution

## What works now

General work uses a replaceable `execute({ task, agent })` provider contract. The first adapter is Codex CLI using its existing ChatGPT sign-in, not the Responses API. It consumes account usage and requires a compatible CLI; the implementation was tested with version 0.149.0.

Product briefs, plans, textual design specifications, content drafts, sales scripts, and analysis of supplied material are supported. Software work keeps its separate coding executor and worktree boundary. No live research, image creation, sending, publishing, or deployment is available through the general adapter.

## Founder workflow

1. In Projects, choose **New work request**, describe the outcome, context, deliverable, and acceptance criteria. Select a work type explicitly when automatic classification is unsuitable.
2. The system selects a capable employee and queues standalone work. Home instead starts [CEO goal planning](GOAL_PLANNING.md), which requires plan confirmation before delivery tasks are created.
3. Open **Open work and delivery** to inspect returned documents or questions.
4. Reply using **Send and continue** to clarify or request a revision. The prior result is retained in delivery history.
5. Read or download the latest files and choose **Accept delivery**. A file's presence alone never automatically accepts a general task.

An existing blocked non-software request can be retried from the same panel after its runtime or permission issue is resolved. Existing tasks are not silently re-executed during an upgrade.

## Lifecycle and evidence

`pending → running → awaiting_review → completed`

Alternative outcomes are `needs_input`, `blocked`, or `failed`. Replies and explicit retries return eligible work to `pending`. A revision keeps earlier files, evidence, and the Founder conversation. The latest summary and files, plus the conversation, form the next provider context; old versions are not all resent.

The provider must return a structured outcome, summary, questions, limitations, and up to five artifacts. Filenames are simple English names with `.md`, `.txt`, `.csv`, or `.json` extensions. The host validates nonempty content, bounded size, unique safe names, and JSON syntax where applicable. It calculates byte counts and SHA-256 hashes and records available token usage. These are structural and provenance checks, not factual validation or independent quality review.

Artifacts are persisted in local `data/state.json`, rendered as escaped text, and downloadable through `GET /api/tasks/:id/artifacts/:index`. They are not committed to Git. Failed and interrupted runs are visible, not silently retried. The in-process scheduler allows two concurrent tasks, with only one task per employee.

## Permission and process boundary

- `agent.general` requires a persisted running task, matching employee assignment, matching runtime asset, an unexpired execute scope, employee capability, and an allowed policy decision. Deny rules still take precedence. The generic tool API cannot invoke it directly.
- The protected General Agent Service asset has default policies for the seeded general-work roles. These permissions do not confer access to source code, organizational documents, publishing destinations, or other assets.
- The adapter supplies only the work brief, employee role, acceptance criteria, Founder messages, and previous delivery. It does not automatically expose the organization store, asset catalog, private files, or memory.
- Each run starts in an empty temporary directory with the Codex read-only sandbox, ignored user configuration and rules, disabled shell/browser/MCP/plugin/agent features, sanitized environment, bounded output, and a three-minute timeout. Model-service connectivity is still required. Unexpected tool events cause the host to reject the result; that post-check cannot undo an action and is not a substitute for isolation.
- The application binds to loopback with browser POST-origin and JSON-content checks. It is still a trusted local Founder console, not authenticated multi-user infrastructure. The CLI needs access to its authentication environment. Do not treat these controls as production-grade filesystem, network, credential, or tenant isolation.

## Failure handling

Missing sign-in or CLI availability blocks intake. Missing inputs produce questions. Essential unavailable capabilities produce a blocker rather than a fabricated result. Invalid output and failed provider runs become failed tasks. After a server restart, previously running tasks become failed and require an explicit retry; execution is not durable exactly-once processing. Repeated large revisions may exceed the bounded context and require a shorter brief.

## Next iterations

1. Add independently evaluated acceptance criteria and a reviewer work order before Founder acceptance.
2. Extend the implemented CEO planner with budgets, cancellation, and approved in-place scope changes. Keep planning separate from execution authority.
3. Add permission-filtered retrieval and brokered tools. Validate each operation outside the model using runtime identity, task scope, target asset, and approval; never hand the model unrestricted credentials.
4. Move execution to a persistent queue and database with cancellation, leases, idempotency, cost limits, and retry policies.
5. Add separately optional providers, including Responses API, without changing employee permissions or the delivery contract.
