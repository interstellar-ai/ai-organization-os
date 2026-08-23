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

## Confirmed target operating model

The primary user is the Founder. The Founder defines direction, boundaries, priorities, and consequential decisions. After those boundaries are confirmed, the AI CEO may plan, organize, assign, and start internal reversible work within the approved scope, budget, deadline, and permission policy.

The organization combines persistent management and review roles with specialist employees created or assigned when a project requires them. Work flows from Founder intent through AI CEO clarification, project planning, structured work orders, specialist execution, independent review, evidence, and executive reporting.

## Confirmed target interface

The target interface is a multi-page Founder operating console rather than a single technical dashboard. Its primary areas are Home, Goals, Projects, Employees, Access, Approvals, Knowledge, Reports, Audit, and Settings.

Home is the Founder Command Center. Employees supports both directory and organization-chart views over the same employee records.

The Access area provides five connected views:

- Employees: effective access, inherited template permissions, project scope, temporary grants, restrictions, and pending requests;
- Assets: resource type, owner, organization, project, sensitivity, environment, external impact, allowed actions, current access, and access history;
- Policies: rules that match employee attributes, asset attributes, actions, and execution context;
- Requests: structured requests for access beyond an employee's current scope;
- Audit: permission changes, approvals, denials, access events, expiration, and attempted violations.

Employee and asset views resolve to one policy engine. A permission is an action on a protected asset, not an asset itself. Permission changes must show their affected employees and assets before taking effect, use risk-appropriate confirmation, remain versioned, and produce an audit record.

The default configuration experience uses job templates, visual rules, and impact previews. Per-employee or per-asset switches are exception mechanisms rather than the primary way to administer access at scale.

## First end-to-end workflow

The first complete workflow is an AI Software Product Studio:

```text
Founder product idea
  → AI CEO clarification and confirmation
  → product definition
  → project planning
  → experience and technical design
  → implementation
  → testing and independent review
  → AI CEO report
  → Founder acceptance
```

This workflow is the initial validation of the general operating model. It must produce inspectable requirements, plans, designs, code, tests, reviews, evidence, and decisions while maintaining role separation and Founder control.

## Current MVP

The current version provides:

- Agent registration with roles and capabilities;
- Goal creation;
- Fixed five-stage goal planning;
- Dependency-aware task scheduling;
- Basic memory search and write operations;
- A small allowlisted tool registry;
- A local HTTP API and browser dashboard;
- A multi-page Founder Command Center with Goals, Projects, Employees, Access, Approvals, Knowledge, Reports, Audit, and Settings views;
- A deterministic local Founder-intent brief before goal creation;
- A seeded AI Software Product Studio employee roster;
- Employee directory and organization-chart views with role profiles and assigned work;
- An asset registry, attribute-matched access policies, and effective-access explanations;
- Structured access requests with local Founder approval or rejection;
- Persistent job templates inherited by employee instances;
- Policy impact previews showing matched employees, assets, permission outcomes, and conflicts;
- One-use and time-bound access grants with consumption and expiration records;
- JSON persistence for single-machine development;
- Deterministic local tools that produce structured outputs and evidence;
- Goal progress summaries and an audit-event stream;
- Automated tests for planning, scheduling, evidence, memory tools, and safe failure on unknown tools.

The current version does not yet provide real LLM reasoning, live market research, web retrieval, X/Twitter publishing, revenue generation, durable multi-user storage, authentication, rate limiting, restart-safe workers, project-scoped access, or execution approval gates connected to external actions.

## Task state semantics

The UI and API should distinguish these states:

- `planned`: the system created a task;
- `queued`: the task is waiting for execution;
- `running`: an executor is working;
- `completed`: evidence-backed output exists;
- `blocked`: a dependency, permission, or missing input prevents progress;
- `failed`: execution attempted and failed;
- `awaiting_approval`: a human decision is required.

Planned tasks use deterministic local tools and must produce evidence. Custom tasks without an executor are blocked. The system still does not perform real external business actions until approved connectors and human approval gates are added.

## Roadmap

1. Replace the fixed planner with an LLM-backed planner that emits validated structured tasks.
2. Replace JSON persistence with SQLite or Postgres and add migrations.
3. Replace the in-process scheduler with a durable queue and worker model.
4. Add evidence objects, execution logs, retries, timeouts, cancellation, and cost tracking.
5. Add scoped connectors for research, GitHub, browser automation, email, CRM, and publishing.
6. Add authentication, role-based permissions, approval gates, and tenant isolation.
7. Build the confirmed AI Software Product Studio workflow before expanding into other organization templates and business functions.
