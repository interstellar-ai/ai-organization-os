# Controlled Continuous Improvement

AI Organization OS can observe operational deficiencies and route them into the same governed workflow used for normal organizational goals. This is controlled self-maintenance, not unrestricted self-modification.

## Improvement loop

```text
Task, review, integration or external-action outcome
                        ↓
              Deduplicated signal
                        ↓
       Founder prioritization or dismissal
                        ↓
          CEO maintenance-goal planning
                        ↓
 Protected implementation and independent review
                        ↓
       Evidence-backed outcome verification
```

The observer scans durable organization state and records:

- failed tasks;
- ready blocked tasks that indicate a missing executor, connector, adapter, runtime or repository capability;
- independent quality reviews that require revision or escalation;
- failed code integrations;
- uncertain external-action outcomes.

Expected control gates are not defects. Repository selection, Founder approval, dependency waiting and controlled-autonomy budgets remain visible in their original workflow without automatically creating maintenance signals.

The Founder may also record a direct observation. Titles and descriptions are bounded, common secret assignments are redacted, and local user path components are removed before the signal enters CEO context.

## Deduplication and priority

An automatic signal is identified by its source record and category. Repeated scans do not create duplicates. A changed observation increments its occurrence count. Active signals are ordered by severity, recurrence and recency.

Signals use these states:

- `open`: observed and awaiting a Founder decision;
- `goal_proposed`: the Founder created a maintenance goal and CEO planning has been requested;
- `in_progress`: planning or controlled execution is active;
- `ready_for_verification`: the linked goal reports delivery, but the original deficiency is not yet proven resolved;
- `resolved`: the Founder recorded verification evidence;
- `dismissed`: the Founder recorded why no maintenance work is required.
- `superseded`: the source record no longer presents the active condition; the signal remains in audit history without claiming verified resolution.

## Authority boundaries

The observer may create a signal but cannot create or approve work. The AI CEO receives only a bounded active backlog in its host-generated organization snapshot. It may discuss priority and propose a goal, but it receives no additional tools or permissions.

Creating a goal from the Improvements page is an explicit Founder action. The goal then uses existing controls:

- CEO plan confirmation;
- explicit protected repository selection for code;
- isolated Codex worktrees;
- permission checks and model-run budgets;
- independent review and regression testing;
- separate code-delivery acceptance and integration approval;
- no automatic push, merge to `main`, deployment or external action.

When an equivalent goal already exists, the Founder can link the signal to that goal instead of creating duplicate work. The observer follows the linked goal's controlled status but does not broaden its scope or authority.

A linked goal reaching `delivered` changes the signal only to `ready_for_verification`. It does not prove production behavior, user impact or an external result. Closing the signal requires recorded verification evidence.

## Current limitations

- Observation is rule-based and uses current task records; it is not full telemetry, log analysis or autonomous root-cause analysis.
- Signals do not create goals, change priority or spend model budget without a Founder action.
- Integration proves only the configured local branch and tests. Remote pull requests, `main` merges, deployment, canaries and automatic rollback are not implemented.
- A dismissed or resolved signal is retained for audit and is not silently reopened. A materially new source produces a separate signal.
- The loop improves repository code and operating instructions. It does not retrain or alter foundation-model weights.

## API

| Capability | Endpoint |
| --- | --- |
| Scan and list signals | `GET /api/improvement-signals` |
| Record a Founder observation | `POST /api/improvement-signals` |
| Confirm a controlled maintenance goal | `POST /api/improvement-signals/:id/create-goal` |
| Link equivalent existing work | `POST /api/improvement-signals/:id/link-goal` |
| Dismiss with a reason | `POST /api/improvement-signals/:id/dismiss` |
| Close with verification evidence | `POST /api/improvement-signals/:id/resolve` |
