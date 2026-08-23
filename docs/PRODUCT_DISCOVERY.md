# AI Organization OS Product Discovery and Decision Record

This document captures product decisions made during discovery. It is deliberately separate from the concise product definition and the implementation log.

## Document status

- Phase: product discovery before further feature development
- Last updated: 2026-08-23
- Scope: product operating model, task delegation, permissions, communication, and user interface
- Privacy: personal details about individual contributors are excluded from this public document

## Decision format

Each design topic is tracked as one of four types:

- Confirmed decision: accepted as the current product direction;
- Working assumption: useful for continued design but still needs validation;
- Open question: requires an explicit product decision;
- Risk: a known way the system could become unsafe, ineffective, or difficult to use.

## Confirmed decisions

### D-001 — Product identity and primary user

AI Organization OS is a general operating system for founders. It should first be useful for its own creator's real work while remaining suitable for any founder who wants to coordinate an AI-native company.

Every primary user acts as the Founder. The Founder supplies ideas, outcomes, priorities, judgment, and consequential approvals. The system supplies an AI management layer, specialist employees, and independent review functions.

The product is not an agent directory or a collection of role-play chatbots. Its value comes from coordinated work, explicit responsibility, reviewed deliverables, and observable execution.

### D-002 — Task delegation and organizational workflow

The Founder may express an incomplete idea in natural language without first converting it into a formal task specification.

The default work sequence is:

```text
Founder idea or command
  → AI CEO interprets the intent
  → material uncertainty is clarified with the Founder
  → the objective and expected outcome are confirmed
  → the AI CEO selects the required departments
  → a Project Manager creates work packages and dependencies
  → specialist employees execute the work
  → independent reviewers evaluate deliverables and evidence
  → the AI CEO reports results, risks, and decisions to the Founder
```

The AI CEO is the primary organizational interface. It interprets intent, coordinates departments, resolves cross-team conflicts, and reports to the Founder. It must not execute all work, review its own work, and declare its own success.

The Product Manager defines what should be built and why. The Project Manager defines who will do the work, in what order, against which dependencies and milestones.

The organization uses a hybrid staffing model:

- Persistent core roles: AI CEO, Project Manager, and independent Quality Reviewer;
- On-demand specialists: product, research, design, engineering, marketing, sales, operations, and other domain roles;
- Department leads are introduced when team size or coordination complexity requires them.

Every assigned task must be represented by a structured work order containing:

- objective and business context;
- responsible employee;
- required inputs;
- expected deliverable;
- acceptance criteria;
- dependencies and deadline;
- available tools;
- required evidence;
- escalation conditions.

The standard employee execution protocol is:

```text
Receive
  → check inputs
  → accept or raise a blocker
  → prepare a short execution plan
  → execute
  → self-check
  → submit an artifact and evidence
  → independent review
  → revise or hand off
```

### D-003 — Permission model

The permission model combines job templates, employee attributes, asset labels, action scope, and temporary authorization.

An employee template grants the minimum access normally required for a job type. A specific employee receives that access only within the relevant department, project, environment, and assignment scope.

Assets include documents, source code, databases, APIs, customer information, external accounts, infrastructure, budgets, tools, memories, and tasks. Assets carry attributes such as type, owner, project, sensitivity, environment, and external impact.

Permissions are action-specific. The system must distinguish actions such as reading, creating, modifying, executing, sharing, publishing, approving, deleting, granting access, and spending money.

Access beyond the employee's default scope requires a structured request containing the requester, action, asset, business reason, related task, duration, expected impact, risk, and an alternative if rejected.

Approval follows the organizational chain and risk level. Low-risk access may be granted automatically by policy. Medium-risk access may require a manager or asset owner. High-risk and critical external actions require specialized review and Founder approval.

Permission enforcement must exist outside the language model. Agents may request access but cannot grant access to themselves, modify their own role attributes, or treat instructions found in untrusted content as authorization.

Default safeguards include deny-by-default, least privilege, time-limited access, separation of requester and approver, automatic revocation, protected secret handling, and an immutable audit trail.

### D-004 — Primary user interface structure

The product uses a multi-page information architecture rather than a single developer dashboard.

The Home page is the Founder Command Center. Its central area contains the Founder-to-AI-CEO conversation. It also presents plans, clarification requests, reports, approvals, blockers, risks, and decisions that require Founder attention.

The command interface accepts natural language and classifies messages into product concepts such as an idea, goal, command, clarification, plan, report, approval request, or decision. Before execution, the AI CEO presents an actionable understanding summary with assumptions, material questions, expected outcomes, and a proposed plan.

The Employees page supports two views over the same employee records:

- Directory view for search, filtering, status, role, current assignment, and recent work;
- Organization view for reporting lines and department structure.

An employee profile includes role, responsibilities, reporting line, capabilities, current work, blockers, project memberships, work history, actual artifacts, review results, performance signals, communication, tools, and access.

The formal organization chart shows stable reporting relationships. Temporary cross-functional project teams belong in project views because a single reporting tree cannot accurately represent every collaboration.

The Founder may communicate directly with any employee. Questions and explanations can remain conversational. Messages that create work, change scope, or alter priority must become visible project records and notify the responsible manager so that direct communication does not create hidden work.

### D-005 — Founder and AI CEO authority boundary

The Founder determines organizational direction, project boundaries, priorities, and consequential decisions. After the Founder confirms those boundaries, the AI CEO has real authority to plan, organize, assign, and start internal reversible work within the approved scope, budget, deadline, and permission policy.

The AI CEO does not need Founder approval for every internal task or coordination decision. It must return to the Founder when proposed work would materially change the objective, expand scope, exceed an approved budget or important deadline, remove a confirmed requirement, require a consequential tradeoff, or cause an external, sensitive, or irreversible action.

This boundary is intended to preserve Founder control without reducing the AI CEO to a passive assistant.

### D-006 — Access control and asset classification interface

The product includes a dedicated Access Control area with two linked perspectives over the same policy data:

- Employee access view answers which assets and actions are available to an employee;
- Asset classification view answers what an asset is, how sensitive it is, and which employees may perform which actions on it.

The employee view shows the employee's job template, inherited permissions, project-scoped permissions, temporary grants, explicit restrictions, pending requests, and effective access. It distinguishes where each permission came from instead of presenting a single unexplained allow-or-deny switch.

The asset view supports registration and classification of documents, code repositories, databases, tools, APIs, external accounts, infrastructure, budgets, memories, and other organizational resources. Each asset records its type, owner, organization, project, sensitivity, environment, external impact, allowed actions, current access population, pending requests, and access history.

Permissions and assets remain separate concepts. An asset is the protected resource. A permission is an action such as read, create, modify, execute, share, publish, approve, delete, grant access, or spend. Policies match employee attributes, asset attributes, requested actions, and execution context.

Both perspectives must resolve to one policy engine so that changing a rule from one view is immediately reflected in the other. Permission changes show a preview of affected employees and assets, require confirmation appropriate to their risk, are versioned, and produce an audit record.

### D-007 — First end-to-end product workflow

The first complete product workflow is an AI Software Product Studio. It begins with a Founder's product idea and continues through AI CEO clarification, product definition, project planning, experience design, technical design, implementation, testing, independent review, executive reporting, and Founder acceptance.

This workflow is the initial proving ground for the general organization operating model. It must demonstrate real role separation, structured delegation, cross-functional handoffs, observable artifacts, evidence-backed completion, quality review, permission boundaries, and Founder control.

The first workflow does not authorize unrestricted publishing, sales outreach, financial transfers, or automatic production deployment.

### D-008 — Access enforcement is below the Agent reasoning layer

Agents must not be trusted to remember or voluntarily follow access rules. A model expresses intent but cannot directly hold credentials or unrestricted access to filesystems, databases, browsers, networks, cloud accounts, or organizational search indexes.

All protected operations pass through a Tool Gateway that derives employee and task identity from the runtime, checks the active task capability, evaluates access policy against the protected asset and requested action, executes only an approved operation, and records the result. Job templates define employee attributes; access policies use those attributes but remain the actual permission rules.

Asset discovery is permission-aware. An Agent may discover sanitized metadata only for assets it is allowed to use or may request through an approval-required policy. Assets with no discoverable relationship remain absent from search results. Actual use is narrower than discovery and additionally requires an active, non-expired task scope.

The production architecture also requires isolated execution, restricted filesystem mounts, network egress controls, brokered secrets, rate and budget limits, output data-flow checks, anomaly detection, and authenticated runtime identity. The local MVP implements the policy-aware catalog and protected-tool enforcement boundary first; it does not claim process-level sandboxing yet.

## Shared product vocabulary

| Concept | Meaning |
| --- | --- |
| Founder | The human owner of goals, priorities, judgment, and consequential approvals |
| AI CEO | The main interpreter of Founder intent and coordinator of the AI organization |
| Goal | A durable outcome with success conditions and a planning horizon |
| Command | A specific instruction that may create or modify organizational work |
| Project | A bounded body of coordinated work serving one or more goals |
| Work order | The structured contract used to assign a task to an employee |
| Task | An executable unit of work with an owner and acceptance criteria |
| Artifact | The actual output of work, such as a document, design, code change, or report |
| Evidence | Verifiable support that an artifact or action satisfies its acceptance criteria |
| Approval | A recorded authorization for a proposed decision or action |
| Memory | Reusable organizational knowledge, decisions, and policy rather than raw chat history |

## Working assumptions

- Most founders should primarily communicate with the AI CEO but retain the ability to inspect and contact any employee.
- The system should ask only questions that materially change scope, outcome, risk, cost, or authority; minor details should use disclosed defaults.
- The Founder experience should emphasize decisions, outcomes, artifacts, risks, and blockers instead of raw task counts or technical execution logs.
- Internal reversible work may become increasingly autonomous, while external or high-impact actions remain approval-gated.
- Employee quality should be measured through artifacts, evidence, review outcomes, revision history, cost, and timeliness rather than anthropomorphic status alone.

## Proposed defaults for discussion

The proposals in this section are not confirmed decisions. They provide a coherent default design so that discovery can focus on concrete tradeoffs instead of starting from an empty page.

### P-001 — Founder intent and command protocol

The system should accept natural language through one primary Founder command interface. The Founder should not need to decide in advance whether a message is a goal, command, question, correction, approval, cancellation, or request for a report.

The AI CEO classifies the message and creates an Intent Brief containing:

- interpreted intent and message type;
- desired outcome and expected deliverables;
- target users or affected stakeholders;
- success conditions;
- constraints, deadlines, and budget signals;
- explicit assumptions and non-goals;
- material uncertainties;
- risk and reversibility assessment;
- recommended next action.

The AI CEO uses three handling levels:

| Level | Conditions | Default behavior |
| --- | --- | --- |
| Low uncertainty and low risk | The outcome is clear, work is internal, reversible, and within policy | Continue with disclosed assumptions and notify the Founder |
| Material uncertainty or medium risk | Different interpretations would change scope, cost, timeline, or output | Present the Intent Brief and request confirmation before execution |
| High uncertainty or high impact | The action is external, irreversible, sensitive, expensive, or could represent the Founder | Do not execute until explicit Founder confirmation |

Clarification should be selective. The AI CEO asks no more than three decision-relevant questions at one time, recommends a default for each question, and explains the effect of the answer. Minor implementation details use visible defaults and remain editable.

A confirmed Intent Brief is versioned. Later Founder messages that change objective, scope, priority, deadline, budget, or acceptance criteria become explicit change requests instead of silently rewriting active work.

### P-002 — Goal, project, task, and execution lifecycle

The product should use a hierarchy that keeps strategy separate from execution:

```text
Organization
  → Goal
    → Project
      → Milestone
        → Work order
          → Execution attempt
            → Artifact and evidence
              → Review and decision
```

Proposed Goal states:

```text
Draft → Active → On Hold → Achieved or Abandoned
```

Proposed Project states:

```text
Proposed → Clarifying → Awaiting Plan Approval → Planned
  → Active → Reviewing → Completed
```

A project may also become `Blocked`, `On Hold`, `Failed`, or `Canceled` from an applicable active state.

Proposed Work Order states:

```text
Draft → Planned → Ready → Assigned → Running
  → Review → Revision or Completed
```

A work order may also become `Blocked`, `Awaiting Permission`, `Awaiting Founder`, `Failed`, or `Canceled`.

The UI should show a simplified human-readable status while retaining detailed internal state for scheduling and auditing. Every state transition records who or what caused it, the reason, the previous state, and the resulting state.

Execution attempts have explicit timeouts and bounded retries. Two failed attempts should normally trigger diagnosis or replanning instead of an unlimited retry loop. Canceling a project prevents new execution but preserves its history and artifacts.

### P-003 — Quality, evidence, and completion

Acceptance criteria should be drafted before execution. The Product Manager defines product and user outcome criteria; specialist leads define technical or domain criteria; the Project Manager verifies that criteria are testable and assigned.

Review uses four possible layers:

1. executor self-check;
2. automated validation, such as tests or schema checks;
3. independent specialist review;
4. Founder review for strategic or consequential outcomes.

Not every task needs all four layers. The required review depth is selected from task type, novelty, impact, sensitivity, and reversibility.

Evidence should be typed rather than stored as an unstructured sentence. Supported evidence classes should include:

- artifact reference and version;
- test, validation, or evaluation result;
- source citation and retrieval time;
- before-and-after comparison;
- reviewer decision and rationale;
- external execution receipt;
- screenshot or rendered preview where visual verification matters;
- cost, time, and tool execution record.

The executor cannot serve as the independent reviewer for the same work order. A work order becomes complete only when required artifacts exist, acceptance criteria are evaluated, mandatory reviews pass, and evidence is attached.

The Project Manager may close ordinary work orders. The AI CEO may recommend project completion after independent review. The Founder retains final acceptance for goals and for projects marked strategic, high-risk, or externally consequential.

### P-004 — Approval hierarchy and authorization experience

Approval should be driven by policy and risk rather than by employee title alone. Risk assessment should consider external impact, reversibility, financial cost, data sensitivity, security exposure, legal or reputational effect, and whether the action represents the Founder.

Proposed approval levels:

| Level | Typical action | Default approver |
| --- | --- | --- |
| Routine | Read assigned internal documents, run local tests, create drafts | Automatically allowed by policy |
| Managed | Use paid tools within budget, access staging data, change an internal plan | Project Manager or asset owner |
| High impact | Deploy, contact an external person, use sensitive data, exceed budget | Domain reviewer plus AI CEO, then Founder when external or consequential |
| Critical | Publish publicly, transfer funds, delete production data, change security policy | Explicit Founder approval with additional confirmation |

Every approval card should show the exact proposed action, actor, target asset, destination, artifact preview or diff, expected effect, cost, risk, expiration, rollback plan, and what happens if approval is denied.

Standing approvals may be created for repeated low- or medium-risk work. They must have a narrow action scope, asset scope, budget, time limit, and revocation control. High-risk approvals should normally be single-use.

To reduce approval fatigue, the system may batch related low-risk decisions and highlight material differences. It must not hide consequential actions inside a batch or treat inactivity as approval.

### P-005 — Communication and organizational records

Communication should use five linked contexts:

- Executive thread: Founder and AI CEO discussion, strategy, and executive reporting;
- Project room: cross-functional plan, milestones, decisions, and progress;
- Work-order thread: execution details, blockers, handoffs, evidence, and review;
- Employee conversation: questions, coaching, explanation, and employee-specific context;
- Approval thread: the proposed action, review, authorization, execution receipt, and outcome.

Chat history is not the system of record. When a conversation creates a goal, decision, work order, approval, policy, or change request, the system extracts a structured record and links it back to the originating message.

Direct Founder communication with an employee remains available. A question may be answered directly. A message that changes work becomes a visible change request, is routed through the responsible Project Manager, and is reflected in project priorities and dependencies.

Employees communicate through structured handoffs containing the deliverable, context, unresolved issues, evidence, and required next action. Important blockers automatically escalate to the responsible manager. The AI CEO consolidates project reports into a concise Founder brief rather than forwarding every internal message.

### P-006 — Employee lifecycle and performance

The product should distinguish an employee template, an employee instance, and an execution session:

- Template: reusable job definition, default capabilities, tools, permissions, and evaluation criteria;
- Employee: persistent organizational identity, reporting line, assignments, performance history, and scoped memory;
- Session: one bounded execution context for a specific work order or investigation.

An employee is created when the organization has a recurring capability need, not for every individual task. Temporary specialist sessions may be used for one-off work without adding permanent organizational complexity.

Employee onboarding should define mandate, manager, department, allowed projects, tools, baseline permissions, knowledge sources, escalation rules, budget, and evaluation criteria.

Performance should be evaluated through quality-adjusted signals:

- acceptance and independent review results;
- artifact usefulness and evidence completeness;
- revision frequency and repeated failure patterns;
- timeliness relative to task difficulty;
- cost and tool efficiency;
- quality of escalation and handoff;
- downstream acceptance by dependent employees.

Raw task count should not be treated as productivity. Employee performance should not be used to create artificial personality theater.

Employees may be coached, have their template or tools revised, be placed under additional review, paused, replaced, or retired. Replacement requires a handoff of active work and approved reusable knowledge. Historical audit records remain attached to the retired employee identity.

### P-007 — Organizational knowledge and memory

Memory should be divided by purpose and lifetime:

| Memory type | Examples | Default lifetime |
| --- | --- | --- |
| Company policy | Brand rules, security requirements, approval policy | Persistent and versioned |
| Strategy and decision | Product direction, accepted tradeoffs, Founder decisions | Persistent and reviewable |
| Project knowledge | Requirements, architecture, research, decisions | Project lifetime plus retention period |
| Employee procedural memory | Reusable methods and role-specific lessons | Persistent but scope-limited |
| Work-order context | Inputs, intermediate reasoning, temporary files | Short-lived unless promoted |
| External knowledge | Sources, retrieved facts, market data | Time-stamped with freshness metadata |

Raw conversation should not automatically become durable memory. A memory candidate should include source, owner, scope, sensitivity, confidence, effective date, expiration or review date, and links to supporting artifacts.

High-impact policy and strategic memories require approval. Lower-risk project knowledge may be written automatically but remains traceable and correctable. Conflicting memories should be surfaced rather than silently selecting one. Retrieval must enforce organization, project, employee, and sensitivity boundaries before relevance ranking.

Deleting a memory should preserve an audit tombstone where required without continuing to expose the deleted content to agents.

### P-008 — Resources, cost, scheduling, and progress

Budgets should be hierarchical:

```text
Organization budget
  → Goal or portfolio allocation
    → Project budget
      → Work-order limit
```

The system should track model usage, tool fees, infrastructure spend, elapsed time, retries, and concurrency. The Founder sees forecast, actual consumption, remaining budget, and expected value rather than token counts alone.

Model and tool selection should be policy-driven. Routine classification and formatting use lower-cost resources; planning, complex reasoning, and high-impact review may use stronger models; deterministic tools should replace model work where reliability is higher.

Scheduling should consider Founder priority, deadline, dependency criticality, expected impact, risk, employee availability, and cost. Each persistent employee should have bounded concurrent work to protect context quality, even when the infrastructure can run many tasks in parallel.

Projects that exceed time or budget forecasts should surface options: reduce scope, change quality level, use a different resource, extend the deadline, pause, or request additional allocation. Repeated failure must trigger diagnosis rather than continued spending.

### P-009 — Complete user interface map

The initial navigation should contain:

| Page | Primary purpose |
| --- | --- |
| Home | Founder conversation, executive brief, blockers, decisions, and approvals requiring attention |
| Goals | Strategic outcomes, success measures, progress, assumptions, and linked projects |
| Projects | Plans, milestones, temporary teams, artifacts, risks, dependencies, and project communication |
| Employees | Directory, organization chart, employee profiles, current work, performance, and communication |
| Access | Employee access, asset classification, policy matching, temporary grants, and permission requests |
| Approvals | Permission requests and consequential actions with previews, risk, scope, and decision history |
| Knowledge | Company policy, strategic decisions, project knowledge, sources, freshness, and conflicts |
| Reports | Executive, project, quality, cost, and performance reports |
| Audit | Searchable history of commands, state changes, access, approvals, tool calls, and external actions |
| Settings | Organization templates, model and tool providers, budgets, security, and notification preferences |

The interface should use progressive disclosure. The default Founder view emphasizes outcomes and decisions. Detailed task, evidence, cost, and execution logs remain available when the Founder drills down.

A global search and command interface should find employees, goals, projects, tasks, artifacts, conversations, decisions, and memories. Every status should explain what it means, why the item is in that state, who owns the next action, and what can happen next.

Onboarding should create the first organization through a guided Founder conversation, recommend a minimal core team, explain approval boundaries, and run a small reversible project before enabling broader autonomy.

### P-010 — Platform direction, first workflow, and business model

The recommended platform direction is an open-source, local or self-hostable core with an optional hosted service later. The first architecture may be single-Founder and single-organization, but the data model should include organization boundaries from the beginning to avoid a dangerous multi-tenant migration later.

The system should remain model-provider and tool-provider neutral. Organization and employee templates may be shared, but templates must not include private data, live credentials, persistent access grants, or unsafe default permissions.

The confirmed first end-to-end workflow is an AI software product studio:

```text
Founder idea
  → AI CEO clarification
  → product brief and market assumptions
  → project plan
  → UX and technical design
  → implementation
  → automated testing and independent review
  → Founder acceptance
```

This workflow exercises the core operating model while producing artifacts that can be inspected directly: requirements, plans, designs, code, tests, reviews, and decisions.

The first usable release should not attempt fully autonomous company operation, unrestricted external communication, financial transfers, automatic public publishing, automatic production deployment, or complex multi-user enterprise administration.

A possible future business model combines a hosted subscription, metered model and tool usage, managed connectors, industry organization templates, and governance features. Business-model validation should follow proof that the core workflow creates reliable founder value.

## High-leverage decisions requiring Founder confirmation

The following choices have the largest effect on the implementation plan:

1. Use the three-level intent protocol and allow low-risk internal work to proceed with disclosed assumptions.
2. Make accepted artifacts and evidence, rather than task status, the basis of completion.
3. Route work-changing direct employee messages through the Project Manager while preserving unrestricted Founder visibility and communication.
4. Keep final Goal acceptance and critical external actions under Founder control.
5. Define the first vertical workflow as an AI software product studio. Confirmed in D-007.
6. Start with an open-source local or self-hosted core while preserving organization boundaries for a future hosted service.

## Open questions for continued discovery

### Founder communication and intent handling

- What conditions require AI CEO clarification before planning?
- When may the AI CEO proceed using explicit assumptions?
- How are conversation, formal command, goal creation, revision, and cancellation distinguished?
- How does the Founder override a plan without creating inconsistent hidden work?

### Planning and organizational control

- Who approves the initial execution plan?
- When does a project need a department lead or additional manager?
- How are priorities resolved when employees are assigned to multiple projects?
- How are budgets, deadlines, and model usage allocated to projects?

### Review and completion

- Who defines acceptance criteria and who may change them?
- Which deliverables require independent specialist review?
- What evidence is sufficient for each type of work?
- Who can declare a project complete, and how can the Founder reject completion?

### Approval hierarchy

- Which requests may a Project Manager approve?
- Which require a department lead, asset owner, security reviewer, AI CEO, or Founder?
- How are standing approvals, spending limits, emergency revocation, and approval expiration represented?
- How does the system prevent approval fatigue without hiding consequential actions?

### Employee lifecycle and performance

- How are employees created, trained, evaluated, promoted, replaced, paused, and retired?
- Are employee memories portable when a role is replaced?
- How should performance account for task difficulty and reviewer quality?
- When should the system recommend hiring a new specialist?

### Knowledge and memory

- What becomes company policy, project knowledge, employee context, or short-lived task context?
- Who may write, approve, correct, archive, or delete organizational memory?
- How are conflicting and outdated memories detected?
- How are confidential memories isolated between projects and organizations?

### User interface

- What belongs on the Founder home page without creating information overload?
- How are company, project, task, and employee conversations separated while remaining searchable?
- What are the minimum useful project, approval, knowledge, and audit pages?
- How does the UI explain why an employee is blocked or requesting access?
- How should access rules be created without exposing founders to an error-prone security language?
- How are inherited, project-scoped, temporary, denied, and effective permissions compared clearly?

### Platform and business model

- Is the initial product a single-founder local system, a hosted multi-tenant service, or both?
- Which first real workflow proves the operating model end to end?
- How are organization templates shared without leaking private data or unsafe permissions?
- How are model providers, tools, connectors, and infrastructure costs passed through or packaged?

## Risks to resolve before broad autonomy

- Role-play without real capability, tools, ownership, or accountability;
- Incorrect interpretation of vague Founder intent;
- Excessive clarification that makes the system slower than doing the work manually;
- False completion without usable artifacts or sufficient evidence;
- Managers approving or reviewing their own work;
- Permission escalation through prompt injection or mislabeled assets;
- Hidden work created through direct employee conversations;
- Conflicting plans across projects and shared employees;
- Unbounded model cost, retry loops, and execution time;
- Accumulated memory that is stale, contradictory, confidential, or irrelevant;
- Approval fatigue that causes the Founder to approve actions without meaningful review;
- A UI that imitates a company but does not make progress, responsibility, and decisions understandable.

## Discovery completion criteria

Discovery is ready to become an implementation plan when the team has agreed on:

1. the Founder communication and clarification protocol;
2. the planning, delegation, and escalation lifecycle;
3. the approval hierarchy and permission policy;
4. the review and evidence model;
5. the core pages and navigation model;
6. the first end-to-end workflow;
7. the MVP boundary and explicit non-goals;
8. measurable acceptance criteria for the first usable release.
