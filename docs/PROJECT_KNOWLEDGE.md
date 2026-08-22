# AI Organization OS Project Knowledge

## 1. Purpose

AI Organization OS is a local-first MVP for turning a human-level objective into a manageable AI organization workflow.

The intended product loop is:

```text
Human goal
  → goal planning
  → agent assignment
  → dependency-aware task scheduling
  → tool-backed execution
  → evidence and evaluation
  → durable memory
  → human-approved next action
```

The long-term product is not a chatbot that only answers questions. It is an operating layer for a small AI-native organization where humans retain strategic control and approval over consequential actions.

## 2. Canonical addresses

| Resource | Address | Status |
| --- | --- | --- |
| Public project and code | <https://github.com/interstellar-ai/ai-organization-os> | Active |
| Default code branch | `main` on `origin` | Active |
| Local web console | <http://localhost:3333/> | Development only |
| Local health endpoint | <http://localhost:3333/api/health> | Development only |
| Production service | None | Not deployed |

The GitHub repository is the source of truth for code. The local JSON file is only development runtime state and must never be uploaded.

## 3. Current MVP scope

The current version includes:

- Agent registration with roles and capabilities;
- Goal creation;
- Fixed five-stage goal planning;
- Dependency-aware task scheduling;
- Basic memory search and write operations;
- A small allowlisted tool registry;
- A local HTTP API;
- A browser dashboard;
- JSON persistence for single-machine development;
- Automated tests for planning, scheduling, memory tools, and safe failure on unknown tools.

The current version does not yet provide:

- Real LLM-based planning or reasoning;
- Real market research or web retrieval;
- X/Twitter publishing;
- Revenue generation or financial execution;
- Durable multi-user storage;
- Authentication, authorization, rate limiting, or audit-grade logs;
- Background workers that survive process restarts;
- Human approval gates for external actions.

## 4. Important product truth

The status `completed` is valid only when a task executor has produced a verifiable result. The current default agent runner returns a placeholder message for tasks without a registered tool. It is useful for testing scheduler behavior, but it is not real business execution.

Future UI changes must distinguish at least these states:

- `planned`: the system created a task;
- `queued`: the task is waiting for execution;
- `running`: an executor is working;
- `completed`: evidence-backed output exists;
- `blocked`: a dependency, permission, or missing input prevents progress;
- `failed`: execution attempted and failed;
- `awaiting_approval`: a human decision is required.

## 5. Architecture map

```text
public/index.html
  → src/server.js
      → src/organization.js
          → Agent / Goal / Task / Memory domain objects
          → Scheduler
          → src/tools.js (allowlisted tool registry)
              → local JSON persistence via src/store.js
```

The current scheduler is an in-process timer. The current store is a JSON file. Both are intentionally replaceable boundaries for a future database and worker queue.

## 6. Development and upload rules

### Public content

- Keep all public-facing content in English.
- Do not include personal identity, local paths, account identifiers, private URLs, credentials, or machine-specific metadata.
- Use project-level no-reply identity for public commits when needed.
- Do not upload `data/state.json`, `.env` files, browser exports, logs containing user data, or generated local artifacts.

### Code changes

- Keep changes small and explainable.
- Prefer the standard library unless a dependency materially improves reliability.
- Preserve the API contract documented in `README.md`.
- Add or update tests for behavior changes.
- Do not claim a business action happened unless the output, URL, record, or audit event can be inspected.

### GitHub workflow

1. Read this file and `AGENTS.md`.
2. Make the change locally.
3. Run `npm test` and `git diff --check`.
4. Scan for Chinese text, secrets, personal information, and local paths.
5. Review `git diff` and `git status`.
6. Use a concise English commit message.
7. Push small reviewed changes to `main`; use a branch and pull request for larger changes.
8. Verify `git ls-remote origin`, the GitHub page, and the final commit hash.

History rewriting and force-pushes are exceptional operations. They require explicit user approval for the exact repository and branch.

## 7. Planned evolution

1. Replace the fixed planner with an LLM-backed planner that emits validated structured tasks.
2. Replace JSON persistence with SQLite or Postgres and add migrations.
3. Replace the in-process scheduler with a durable queue and worker model.
4. Add evidence objects, execution logs, retries, timeouts, cancellation, and cost tracking.
5. Add scoped connectors for research, GitHub, browser automation, email, CRM, and publishing.
6. Add authentication, role-based permissions, approval gates, and tenant isolation.
7. Build one real vertical workflow first, such as an AI research and publishing team, before expanding into a general-purpose organization OS.
