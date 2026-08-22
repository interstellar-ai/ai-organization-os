# AI Organization OS MVP

This is a runnable first version of an AI Organization OS. It validates the smallest goal-driven organization loop:

```text
Goal input → plan generation → task scheduling → agent/tool execution → memory capture
```

Product documentation, project notes, operating rules, canonical addresses, and upload requirements are indexed in [`docs/PROJECT_KNOWLEDGE.md`](docs/PROJECT_KNOWLEDGE.md) and [`AGENTS.md`](AGENTS.md).

## Quick start

```bash
npm start
```

Open <http://localhost:3333>. On first launch, the server creates two example agents and one safety-policy memory. Runtime data is stored in `data/state.json`.

Run the test suite with:

```bash
npm test
```

## MVP API

| Capability | Endpoint |
| --- | --- |
| Health check | `GET /api/health` |
| Agent management | `GET/POST /api/agents` |
| Goal input | `GET/POST /api/goals` |
| Generate a plan | `POST /api/goals/:id/plan` |
| Replan a goal | `POST /api/goals/:id/replan` |
| Goal progress and evidence | `GET /api/goals/:id/summary` |
| Task management/execution | `GET/POST /api/tasks`, `POST /api/tasks/:id/run` |
| Basic memory | `GET /api/memories?q=...`, `POST /api/memories` |
| Tool registry | `GET /api/tools`, `POST /api/tools/execute` |
| Audit events | `GET /api/events` |

The current tool set includes `goal.analyze`, `solution.design`, `mvp.inspect`, `workflow.validate`, `iteration.record`, `memory.search`, `memory.write`, `task.list`, `goal.list`, and `echo`. Tools are registered on an allowlist, and unregistered tools are rejected. Every planned task must produce evidence before it can become `completed`.

## Current boundaries

- The scheduler checks every second for pending tasks whose dependencies are complete, then executes them by priority.
- Planned tasks use local deterministic tools that produce structured outputs and evidence. Custom tasks without an executor are blocked instead of being falsely completed.
- Plan generation currently uses a fixed five-stage template and does not call an LLM.
- JSON storage is suitable for a single-machine MVP, but not for multi-process or high-concurrency workloads.
- High-impact external actions do not yet have connectors or an approval flow; the current safety policy is stored as memory and exposed in the evidence boundary.

## Iteration roadmap

1. **v0.2: Model decision layer** — Add a Goal Planner, Agent Router, structured-output validation, and retry policies.
2. **v0.3: Reliable execution layer** — Add SQLite/Postgres, queues, idempotency keys, timeouts, cancellation, retries, audit logs, and human approval.
3. **v0.4: Connector layer** — Add browser, GitHub, email, CRM, and cloud-service connectors with scoped permissions.
4. **v0.5: Organizational learning layer** — Add task evaluation, tiered long-term memory, knowledge retrieval, agent performance, and cost monitoring.
5. **v1.0: Multi-tenant edition** — Add user/team permissions, secret management, isolated execution environments, budget controls, compliance, and observability.

The recommended next step is to choose one real scenario, such as an AI research and publishing team. Replace the fixed five-stage template with a vertical workflow that has explicit acceptance criteria before expanding the general-purpose capabilities.
