# AI Organization OS Product Document

## Vision

AI Organization OS is an operating layer for a small AI-native organization. It turns a human-level objective into a permissioned workflow of agents, tasks, tools, memory, evidence, and human-approved actions.

The Founder’s primary interface is a persistent conversation with the AI CEO. The CEO can explain the current organization state, discuss options, surface decisions, and suggest new goals, while only explicit Founder confirmation enters the planning and execution system.

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

The target interface is a multi-page Founder operating console rather than a single technical dashboard. Its primary areas are Home, Goals, Projects, Employees, Access, Decisions, Knowledge, Reports, Audit, and Settings.

Home is the Founder Command Center. Employees supports both directory and organization-chart views over the same employee records.

Projects is a general delivery workspace rather than a coding console. The Founder describes a desired outcome, deliverable, context, constraints, acceptance criteria, priority, and optional goal. The system classifies the work, routes it to the appropriate employee, and selects an approved executor. Coding is one specialization whose current provider is Codex; it is not a top-level product concept.

Goals owns CEO clarification, plan proposals, and Founder confirmation. Projects contains real project records created from approved plans, but presents them as an operating pipeline rather than a flat task dump: the current stage, Founder decisions, active work, downstream work, current blockers, later requirements, completed work, and collapsed system-review activity are separated. A project is not labeled blocked merely because a later stage has a known missing connector while current work can still proceed. Simple goals may use direct tasks. Standalone work requests remain available without inventing a project.

Decisions replaces the former approval-only view. It combines Founder delivery judgment and employee questions with goal-plan, staffing, access, code-integration, and exact external-action decisions. Routine internal drafting, retry, revision, complete accepted dependency-chain handoff, resolvable internal questions, and evidence-backed independent acceptance remain under controlled autonomy and do not create Founder noise.

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
- Persistent Founder-to-CEO conversation backed by timestamped host-generated operational snapshots, with no tool or mutation authority;
- Goal creation;
- Model-backed CEO planning with clarification, bounded project/task proposals, dependency validation, and explicit Founder confirmation;
- CEO detection of missing roles, bounded template-based staffing proposals, explicit Founder decisions, and automatic replanning against the updated roster;
- Atomic and repeat-safe creation of real projects and assigned employee tasks from the current approved proposal;
- Accepted dependency-artifact handoffs within the same approved plan, plus project and goal delivery-progress summaries;
- Controlled autonomy consent with independent document review, up to two automatic revisions, transient provider retries, and a bounded model-run budget;
- Automatic AI CEO final reporting after all original work deliveries are accepted, with delivery completion separated from verified business outcomes;
- Dependency-aware task scheduling;
- Basic memory search and write operations;
- A small allowlisted tool registry;
- A local HTTP API and browser dashboard;
- A multi-page Founder Command Center with Goals, Projects, Employees, Access, Decisions, Knowledge, Reports, Audit, and Settings views;
- A deterministic local Founder-intent brief before goal creation;
- A seeded AI Software Product Studio employee roster;
- Employee directory and organization-chart views with role profiles and assigned work;
- An asset registry, attribute-matched access policies, and effective-access explanations;
- Structured access requests with local Founder approval or rejection;
- Persistent job templates inherited by employee instances;
- A template-based hiring flow with manager selection and a pre-hire preview of inherited role data and default access;
- Policy impact previews showing matched employees, assets, permission outcomes, and conflicts;
- One-use and time-bound access grants with consumption and expiration records;
- An authorized asset catalog that hides assets outside an employee's allowed or requestable scope;
- Tool-gateway enforcement requiring employee identity, active task assignment, task-scoped capability, policy permission, and audit evidence for protected asset operations;
- A Codex-first coding executor for explicit development work orders, protected by source-code read, modify, and execute permissions;
- Per-task detached Git worktrees, Codex workspace-write sandboxing, sanitized process environments, execution timeouts, bounded output, changed-file summaries, and evidence;
- A Founder-facing general work-request form with automatic work-type classification and employee routing;
- Codex-backed general employees producing Markdown, text, CSV, and JSON documents from supplied context;
- Clarifying questions, Founder replies, revision history, downloadable files, explicit acceptance for standalone and escalated work, and independent acceptance for approved plan documents;
- Permissioned general-runtime access, two-task concurrency, one running task per employee, persistent leases, and interrupted-run recovery;
- Transactional SQLite WAL persistence with one-time legacy JSON import;
- Founder-approved code integration into an isolated `codex/integration` branch with credential scanning, conflict handling, and allowlisted test gates;
- Host-controlled live research, email, CRM, and publishing connectors with exact-payload approval, one-use grants, receipts, and uncertain-outcome handling;
- Deterministic local tools that produce structured outputs and evidence;
- Goal progress summaries and an audit-event stream;
- Automated tests for planning, scheduling, evidence, memory tools, and safe failure on unknown tools.

The current version uses real model reasoning for CEO conversation and planning, staffing proposals, general document work, independent review, final reporting, and software development. Home is the CEO conversation surface: it supplies a timestamped host-generated operational summary, persists the discussion, and permits a Founder-confirmed goal suggestion, but grants no tools or mutation authority. Founder-only work is collected in Decisions, while the complete work proposal and autonomy budget remain in Goals before projects and delivery tasks are created. Approved hires must use existing job templates and trigger replanning; no employee can self-create or bypass access policy. The standalone work-request classifier remains deterministic. Code integration and selected external connectors are now host-controlled, approval-gated workflows. Image generation, autonomous job-template creation, standing staffing budgets, durable multi-user storage, authenticated runtime identity, currency budgets, production isolation, general output data-flow controls, distributed workers, project-scoped asset policies, deployment, and remote Git integration remain future work. See [CEO conversation](CEO_CONVERSATION.md), [Goal planning](GOAL_PLANNING.md), [Controlled autonomy](CONTROLLED_AUTONOMY.md), [Code integration](CODE_INTEGRATION.md), [External connectors](EXTERNAL_CONNECTORS.md), and [Durable runtime](DURABLE_RUNTIME.md).

## Task state semantics

The UI and API should distinguish these states:

- `pending`: the task is waiting for execution;
- `running`: an executor is working;
- `needs_input`: the employee has questions for the Founder;
- `awaiting_quality_review`: an approved-plan document exists and awaits independent evaluation;
- `awaiting_review`: a standalone, code, uncertain, or escalated delivery awaits Founder acceptance or feedback;
- `reporting`: all original work deliveries are accepted and the AI CEO final report is pending;
- `superseded`: internal coordination work was replaced by an explicit Founder decision and will not run;
- `completed`: evidence-backed output exists and its required Founder or independent-review gate passed;
- `blocked`: a dependency, permission, or missing input prevents progress;
- `failed`: execution attempted and failed;
- Access approvals are separate records; they are not delivery acceptance.

Goal-plan tasks use registered executors and must produce evidence. A routed Founder work request remains `blocked` while it waits for an approved executor; `completed` is reserved for evidence-backed output after its required review. External business actions require a matching configured connector, policy permission to request it, an exact preview, and explicit Founder approval.

## Roadmap

1. Extend the general document executor with permission-filtered context retrieval and stronger factual artifact evaluation; keep external actions behind explicitly approved tools.
2. Add visual diff inspection, cleanup, cancellation, pull-request creation, remote checks, and deployment as separately approved Codex workflow stages.
3. Extend the CEO planner with editable currency or token budgets, in-place replanning, cancellation, and reviewer performance while keeping Responses API support optional.
4. Evolve the versioned SQLite adapter to relational PostgreSQL with migrations, tenant keys, backups, and point-in-time recovery.
5. Move leased claims from the local scheduler to dedicated distributed workers with heartbeats, cancellation, and dead-letter handling.
6. Extend scoped connectors with GitHub pull requests, browser automation, deployment, provider-specific verification, and secret rotation.
7. Add authenticated runtime identity, secret brokering, role-based permissions, approval gates, and tenant isolation.
8. Complete the confirmed AI Software Product Studio workflow before expanding into other organization templates and business functions.
