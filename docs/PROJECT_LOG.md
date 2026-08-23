# AI Organization OS Project Log

This file records dated implementation facts and decisions. Stable product definitions belong in [PRODUCT.md](PRODUCT.md).

## 2026-08-22 — Public MVP baseline

- Created the first runnable MVP with Agent, Goal, Task, Memory, Scheduler, and Tool Registry components.
- Added a local HTTP API and browser dashboard at <http://localhost:3333/>.
- Added automated tests for planning, dependency-aware scheduling, memory tools, and unknown-tool failure.
- Published the code at <https://github.com/interstellar-ai/ai-organization-os>.
- Set the public repository and UI to English-only.
- Removed personal identity, local machine paths, and runtime state from public project files.
- Added `AGENTS.md` with coding, privacy, testing, and upload rules.

## 2026-08-22 — Evidence-backed execution layer

- Replaced the generic placeholder completion path for planned tasks with five allowlisted local tools: goal analysis, workflow design, MVP inspection, workflow validation, and iteration recording.
- Added task acceptance criteria, executor names, attempts, evidence, blocked reasons, and plan cycles.
- Added goal execution states: `not_started`, `in_progress`, `blocked`, and `awaiting_review`.
- Added goal summaries, replan support, audit events, and a dashboard view that renders task evidence instead of only raw JSON.
- Migrated legacy placeholder completions to `blocked` with an explicit rerun explanation.
- End-to-end verification produced five completed tasks with evidence and left the goal in `awaiting_review`.

## 2026-08-23 — Product discovery phase

- Paused further feature development to define the product operating model before changing the interface or adding autonomy.
- Established the Founder as the primary user, supported by an AI CEO, project coordination, specialist employees, and independent quality review.
- Defined the first task-delegation model, employee work-order contract, role and asset label permission concept, and the initial multi-page UI direction.
- Confirmed the AI Software Product Studio as the first end-to-end workflow, covering Founder intent, product definition, planning, design, implementation, testing, independent review, and Founder acceptance.
- Added [Product Discovery and Decision Record](PRODUCT_DISCOVERY.md) to keep active product decisions, assumptions, open questions, and risks separate from implementation history.
- Excluded personal contributor details from the public product record.

## 2026-08-23 — Founder console and access-control preview

- Replaced the single developer dashboard with a responsive multi-page Founder Console.
- Added a structured local command intake that explains assumptions and external-action boundaries before goal creation.
- Added an AI Software Product Studio roster, employee directory, organization chart, role profiles, active work, and delivery history.
- Added classified organizational assets, attribute-matched access policies, effective-access explanations, temporary grants, access requests, and Founder decisions.
- Distinguished `allow`, `approval_required`, and `deny`; explicit deny takes precedence, while an approved request can satisfy an approval-required policy.
- Added Goals, Projects, Knowledge, Reports, Audit, and Settings views backed by current local runtime data.
- Added automated tests for policy matching, deny precedence, approval-required access, temporary grants, and access audit events.
- Verified the live interface at <http://localhost:3333/> in the browser with no console errors.

## 2026-08-23 — Access governance iteration

- Added persistent job templates for the initial AI Software Product Studio roles and linked seeded employees to their inherited templates.
- Added a Templates view in Access with inherited capabilities, linked employees, and matching policy counts.
- Added policy impact preview before creation, including affected employees, assets, permission outcomes, and conflicting rules.
- Added real one-use grants, time-bound grants with expiration timestamps, and a controlled access-consumption operation.
- Added audit events for access use and changed consumed one-use requests to a non-reusable state.
- Added tests for template inheritance, policy previews without persistence, one-use consumption, and time-bound expiration.
- Kept project-scoped access explicitly deferred until the separate Project domain is implemented.

## 2026-08-23 — Template-based employee hiring

- Added a guided hiring flow to the Employees page and direct hiring actions on Access template cards.
- Added a non-persistent pre-hire preview of inherited role, department, responsibilities, capabilities, matching policies, and default asset access.
- Added manager selection with server-side manager validation and a post-hire employee profile showing its role source.
- Kept project assignment out of the hiring form until the Project domain has a real data model.
- Added automated coverage for template hiring previews and invalid manager references.

## Architecture snapshot

```text
public/index.html + public/styles.css + public/app.js
  → src/server.js (HTTP API and static assets)
      → src/organization.js
          → Agent / Goal / Task / Memory domain objects
          → Job Template / Asset / Policy / Access Request domain objects
          → Scheduler
          → src/tools.js (allowlisted tools)
              → src/store.js (local JSON persistence)
```

The scheduler is currently an in-process timer. The store is currently a JSON file. Both are deliberate replacement boundaries for a future worker queue and database.

## Decisions

### Local-first storage for the MVP

JSON persistence keeps the prototype dependency-free and easy to inspect. It is not suitable for multi-process, multi-user, or high-concurrency production use.

### Fixed planner before model planner

The five-stage planner makes the workflow visible before adding model variability. It should be replaced only after task schemas, evidence, retries, and evaluation are defined.

### Placeholder execution is not business execution

Legacy tasks without a registered tool may contain a placeholder completion message, but the migration layer now marks them as blocked. New custom tasks without an executor are blocked immediately. Real research, publishing, and revenue actions require registered tools, outputs, evidence, and approval boundaries.

## Verification record

- Latest verified branch: `main` on `origin`.
- Public repository visibility: public.
- Public content scan: English-only.
- Personal-information scan: clean.
- Test command: `npm test`.
- Upload check: `git diff --check` plus repository status and remote commit verification.

## Ongoing notes

Add new entries under this heading with the date, change, decision, and verification result. Do not grow the product document with temporary debugging details or one-off deployment notes.
