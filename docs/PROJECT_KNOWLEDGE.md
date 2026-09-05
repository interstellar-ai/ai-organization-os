# Project Knowledge Index

This directory separates stable product knowledge from changing project notes.

## Read the right document

- [Product document](PRODUCT.md): product purpose, principles, current scope, state semantics, and roadmap.
- [General Agent execution](GENERAL_AGENT_EXECUTION.md): current provider contract, delivery workflow, safety limits, and next iterations.
- [Goal-to-project planning](GOAL_PLANNING.md): CEO clarification, proposal confirmation, real projects, employee tasks, and accepted handoffs.
- [Product discovery and decisions](PRODUCT_DISCOVERY.md): confirmed product decisions, working assumptions, open questions, and design risks.
- [Project log](PROJECT_LOG.md): canonical addresses, architecture snapshots, decisions, milestones, and verification records.
- [Demo walkthrough](DEMO.md): privacy-safe 2–3 minute recording script for the current MVP.
- [Agent instructions](../AGENTS.md): coding, privacy, testing, and GitHub upload rules.
- [README](../README.md): public quick start and API reference.
- [Contributing guide](../CONTRIBUTING.md): public contribution, testing, privacy, and security-reporting workflow.
- [v0.5.0 release notes](releases/v0.5.0.md): milestone highlights, safety boundary, and known limitations.

## Canonical addresses

| Resource | Address | Status |
| --- | --- | --- |
| Public project and code | <https://github.com/interstellar-ai/ai-organization-os> | Active |
| Default code branch | `main` on `origin` | Active |
| Local web console | <http://localhost:3333/> | Development only |
| Production service | None | Not deployed |

## Open-source status

- License: [Apache License 2.0](../LICENSE)
- Current public milestone: `v0.5.0`
- Current development milestone: `v0.7.0` goal-to-project orchestration; not a published release tag.
- Contributor workflow: [`CONTRIBUTING.md`](../CONTRIBUTING.md)

The GitHub repository is the source of truth for code. The local JSON file is runtime state and must never be uploaded.

## Documentation rule

Keep the concise product definition in `PRODUCT.md`. Use `PRODUCT_DISCOVERY.md` for active product decisions, assumptions, and unresolved design questions. Keep dated implementation facts and verification results in `PROJECT_LOG.md`. Keep operational rules in `AGENTS.md` instead of duplicating them across product documents.
