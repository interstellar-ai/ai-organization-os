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

## 2026-08-23 — Enforced Agent access boundary

- Added a permission-aware asset catalog that exposes only sanitized metadata for assets an employee may use or request.
- Added task access scopes and expiration timestamps as the first task-capability representation.
- Added protected-tool enforcement across employee identity, task assignment, active task state, task scope, expiration, effective policy, temporary-grant consumption, and audit events.
- Added protected `asset.inspect` and identity-aware `asset.catalog` tools as the first enforceable gateway examples.
- Clarified in the Access UI that Job Templates define employees while Access Policies define permission rules.
- Documented that authenticated runtime identity, process and network sandboxing, brokered credentials, and output data-flow controls remain future enforcement layers.
- Added automated coverage for hidden unauthorized assets, missing identity, missing task scope, successful authorized execution, and expired capabilities.

## 2026-08-23 — Responsive navigation dismissal

- Added a mobile navigation backdrop so clicking outside the open sidebar closes it without activating underlying page controls.
- Added Escape-key dismissal, synchronized accessibility state, and background scroll locking while the sidebar is open.

## 2026-08-23 — Codex-first coding executor

- Added `code.codex` as the first real model-backed employee executor without introducing a separate Responses API dependency.
- Added explicit coding work orders on the Projects page with developer, protected codebase, goal, priority, instructions, and acceptance criteria.
- Required source-code `read`, `modify`, and `execute` permission plus an active, assigned, non-expired task scope before Codex can start.
- Added a detached Git worktree per coding task, Codex `workspace-write` sandboxing, non-interactive JSONL execution, a sanitized child environment, timeout and output limits, changed-file evidence, and audit events.
- Kept GitHub push, merge, deployment, and external-service access outside this executor.
- Added Codex runtime health to the API and UI; the assignment action is disabled when the local CLI is unavailable.
- Added automated tests for denied preflight access, successful protected execution, safe CLI arguments, environment filtering, and evidence parsing.
- Repaired and verified the local Codex CLI installation at version `0.149.0` with ChatGPT authentication; a read-only non-interactive probe returned the expected final message and no real coding task was submitted.
- Observed a local network-specific WebSocket certificate mismatch during the probe; Codex automatically fell back to HTTPS and completed successfully. The executor records this degraded transport without exposing raw certificate or path details.
- Verified the Projects page and coding-task form in the local browser with no console errors.

## 2026-08-23 — Open-source application readiness

- Adopted the Apache License 2.0 for public use and contribution.
- Added contributor guidance covering local verification, privacy, product proposals, and security reporting.
- Added a privacy-reviewed Projects workspace screenshot showing the protected Codex work-order flow.
- Added a truthful 2–3 minute demo script that distinguishes implemented behavior from roadmap capabilities.
- Prepared the repository metadata and documentation for a public `v0.5.0` release.

## 2026-08-23 — General work-request routing

- Reframed Projects as a provider-neutral delivery workspace instead of a Codex-specific coding console.
- Replaced the primary coding button and form with a general Founder work request covering outcome, deliverable, context, constraints, work type, priority, goal, and optional employee assignment.
- Added deterministic classification across product, research, design, software, content, sales, operations, and general work, with role-aware automatic employee routing.
- Kept Codex as the connected executor for software-development work while leaving unsupported specialties honestly `blocked` with an explicit next action.
- Added a general `POST /api/work-requests` endpoint, routing metadata, execution-coverage messaging, and automated routing tests.

## 2026-09-05 — General Agent document execution

- Added a replaceable general-work execution contract with Codex CLI as the first provider, using existing ChatGPT sign-in without a Responses API dependency.
- Added actual Markdown, text, CSV, and JSON delivery, structured clarification or blocker outcomes, artifact validation, byte counts, hashes, and usage evidence.
- Protected execution with employee capability, assigned running task, expiring runtime scope, asset policy, disabled general-agent tools, bounded output, timeout, and a temporary read-only workspace.
- Added Projects delivery viewing and downloading, Founder feedback, prior-version history, and explicit acceptance. Home can send a confirmed brief to an AI CEO document task; autonomous planning is not implemented.
- Added two-task concurrency, one running task per employee, duplicate-run refusal, and recovery of interrupted tasks to an explicit failed state.
- Bound the local server to loopback and rejected cross-origin browser POST requests and non-JSON mutation requests. The application remains a trusted single-Founder development surface.
- Verified all 28 automated tests, browser-script syntax, whitespace checks, and English-only and personal-information scans.
- Verified real Codex execution through the browser with a fictional reading-list product brief, followed by a requested revision. The latest downloaded file contained 335 whitespace-delimited words, exactly three acceptance criteria, and the requested risks section. Its 1,991-byte content matched the stored SHA-256 hash; the first version remained in history.
- Verified invalid artifact downloads returned 404 and a disallowed browser-origin acceptance request returned 403. The real demo remains awaiting Founder acceptance; acceptance and invalid-state rejection were verified in automated tests, not by accepting on behalf of the Founder.
- Kept live research, external actions, autonomous multi-employee planning, independent quality evaluation, production isolation, and durable workers as explicit next iterations.

## 2026-09-05 — Goal-to-project orchestration

- Replaced the Home document-only goal intake with a protected model-backed CEO planning task. Existing legacy goal records remain unchanged.
- Added real project records and a bounded proposal schema covering projects, employee assignments, deliverables, acceptance criteria, execution modes, and dependencies. Simple goals can use direct tasks.
- Added clarification, pre-approval revision, current-proposal identity checks, employee-capability validation, cycle detection, and atomic repeat-safe confirmation. Delivery tasks are not created before confirmation.
- Added Goals plan review and conversation, Projects task lists and progress, accepted dependency-artifact handoffs with audit records, and explicit codebase selection for planned coding work.
- Preserved runtime policy checks, external-action blockers, isolated coding worktrees, and human delivery acceptance. Goal execution delivery remains separate from unverified business outcomes.
- Verified 37 automated tests covering orchestration, dependency gating and data handoff, stale and repeated confirmations, clarification, invalid graphs, atomic rollback, code permission checks, and unrelated-goal handoff denial.
- Verified a real Codex-backed CEO call through Home. It proposed two document projects and two assigned tasks for a fictional reading-list launch package, with the launch copy depending on the product brief. The browser displayed the complete proposal and no console errors; the proposal remains awaiting Founder confirmation.
- The full approval-to-delivery chain was verified using isolated test stores and controlled provider responses. The real demonstration was not approved or accepted on behalf of the Founder.

## Architecture snapshot

```text
public/index.html + public/styles.css + public/app.js
  → src/server.js (HTTP API and static assets)
      → src/organization.js
          → Agent / Goal / Task / Memory domain objects
          → Job Template / Asset / Policy / Access Request domain objects
          → Scheduler
          → src/goal-workflow.js (CEO proposals, approved projects, dependency handoffs)
          → src/tools.js (allowlisted tools)
              → src/executors/codex.js (protected coding worktrees)
              → src/executors/general.js (structured employee documents)
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
