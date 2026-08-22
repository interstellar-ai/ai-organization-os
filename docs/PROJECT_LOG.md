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

## Architecture snapshot

```text
public/index.html
  → src/server.js
      → src/organization.js
          → Agent / Goal / Task / Memory domain objects
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

Tasks without a registered tool currently receive a placeholder completion message. This is acceptable for scheduler tests only. Real research, publishing, and revenue actions require registered tools, outputs, evidence, and approval boundaries.

## Verification record

- Latest verified branch: `main` on `origin`.
- Public repository visibility: public.
- Public content scan: English-only.
- Personal-information scan: clean.
- Test command: `npm test`.
- Upload check: `git diff --check` plus repository status and remote commit verification.

## Ongoing notes

Add new entries under this heading with the date, change, decision, and verification result. Do not grow the product document with temporary debugging details or one-off deployment notes.
