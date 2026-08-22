# AI Organization OS Product Document

## Vision

AI Organization OS is an operating layer for a small AI-native organization. It turns a human-level objective into a permissioned workflow of agents, tasks, tools, memory, evidence, and human-approved actions.

The product is not intended to be a chatbot that only answers questions. It should help one person coordinate a small AI organization while retaining strategic control over consequential decisions.

## Core product loop

```text
Human goal
  → goal planning
  → agent assignment
  → dependency-aware scheduling
  → tool-backed execution
  → evidence and evaluation
  → durable memory
  → human-approved next action
```

## Product principles

- Goals are more important than isolated prompts.
- Agents must have explicit roles, capabilities, and permissions.
- A completed status requires verifiable output or evidence.
- External and high-impact actions require scoped tools and human approval.
- Memory should preserve decisions and reusable knowledge, not opaque conversation history.
- The system should expose what happened, why it happened, and what remains unverified.

## Current MVP

The current version provides:

- Agent registration with roles and capabilities;
- Goal creation;
- Fixed five-stage goal planning;
- Dependency-aware task scheduling;
- Basic memory search and write operations;
- A small allowlisted tool registry;
- A local HTTP API and browser dashboard;
- JSON persistence for single-machine development;
- Automated tests for planning, scheduling, memory tools, and safe failure on unknown tools.

The current version does not yet provide real LLM reasoning, market research, web retrieval, X/Twitter publishing, revenue generation, durable multi-user storage, authentication, rate limiting, audit-grade logs, restart-safe workers, or human approval gates.

## Task state semantics

The UI and API should distinguish these states:

- `planned`: the system created a task;
- `queued`: the task is waiting for execution;
- `running`: an executor is working;
- `completed`: evidence-backed output exists;
- `blocked`: a dependency, permission, or missing input prevents progress;
- `failed`: execution attempted and failed;
- `awaiting_approval`: a human decision is required.

The current default runner is a test placeholder. It can validate scheduler behavior, but it must not be presented as real business execution.

## Roadmap

1. Replace the fixed planner with an LLM-backed planner that emits validated structured tasks.
2. Replace JSON persistence with SQLite or Postgres and add migrations.
3. Replace the in-process scheduler with a durable queue and worker model.
4. Add evidence objects, execution logs, retries, timeouts, cancellation, and cost tracking.
5. Add scoped connectors for research, GitHub, browser automation, email, CRM, and publishing.
6. Add authentication, role-based permissions, approval gates, and tenant isolation.
7. Build one real vertical workflow first, such as an AI research and publishing team, before expanding into a general-purpose organization OS.
