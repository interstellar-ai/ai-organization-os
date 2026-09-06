# Controlled Autonomy

## Product contract

The Founder still approves the AI CEO proposal before employee work exists. That confirmation also activates a visible, bounded autonomy policy for the approved plan. It does not grant external permissions or expand any employee's asset access.

Within that boundary, internal document work can continue without a Founder click after every delivery:

```text
approved work → employee delivery → independent review
  → pass: accepted handoff
  → revise: bounded automatic correction and another review
  → escalate: Founder decision
```

The host, not the model, enforces task identity, dependencies, reviewer separation, policy access, retry limits, revision limits, and model-run budget. The reviewer receives only the work order, acceptance criteria, and returned artifacts. Embedded artifact text is treated as untrusted content.

## Approval boundary

Plan confirmation currently approves:

- the displayed employee assignments and work orders;
- accepted dependency-file handoffs within the same goal and plan;
- independent review of internal document deliveries;
- up to two automatic revision rounds per document;
- up to three execution attempts for temporary provider failures;
- the displayed model-run budget;
- one final AI CEO report after all work deliveries are accepted.

It does not approve external actions, new assets, new permissions, code integration, publishing, sending, spending, deployment, or claims of business success. Old plans approved before this policy remain on their original Founder-review workflow; the new policy is not applied retroactively.

## Quality decisions

An independent employee with the `validate` capability reviews every acceptance criterion in order. A pass requires every criterion to pass and confidence of at least 0.7. A revision requires a concrete failed criterion and actionable feedback. Uncertainty must escalate.

A passing review marks the document task complete and unlocks its approved dependencies. A failed review returns the original task to the same employee with reviewer feedback while preserving the previous delivery, evidence, and review in execution history. After two automatic revisions, or when a reviewer is unavailable or uncertain, the task moves to Founder review.

Review tasks and final reports are coordination work. They remain visible in the task list and audit log but do not inflate delivery progress, which counts only original plan work.

## Retry and budget behavior

Connection failures, timeouts, and incomplete provider termination can retry up to the approved attempt limit with a short delay. Permission denial, invalid output, missing capability, and other deterministic failures do not retry automatically.

Each authorized model invocation for approved work, quality review, code execution, or the final report consumes one model-run unit. Permission checks happen before reservation, so denied operations do not consume this budget. Exhaustion blocks the pending model task and sends any waiting delivery to Founder review. The Founder can approve a bounded extension with a reason; the system records it and resumes only the selected budget-blocked task.

The current budget is derived from plan size and shown before confirmation. It is an invocation limit, not a currency or token budget. Codex account usage limits and provider availability still apply separately.

## Final report and outcome truth

When all original work tasks are accepted, the AI CEO automatically prepares `executive-summary.md` from accepted dependency evidence. The report must cover every workstream, limitations, unresolved decisions, next actions, and each goal criterion. It must distinguish verified outcomes from unverified or not-achieved outcomes.

`100%` means that the approved work deliveries were accepted. It does not prove users, publication, revenue, deployment, or any other external business result.

## Current limitations

- The queue and budget counters use transactional SQLite state and persisted leases. They are crash-durable on one node but are not a distributed multi-tenant queue.
- There is no cancellation or in-place plan revision.
- Code work still requires explicit codebase selection and Founder acceptance; a separate approval may integrate it into `codex/integration`, but never push, merge main, or deploy.
- External tasks remain blocked until an exact connector action is prepared and approved. Side-effect uncertainty always returns to the Founder.
- Reviewer quality is model-based. Contract validation and role separation reduce risk but do not make evaluation infallible.
