# Project Knowledge Index

This directory separates stable product knowledge from changing project notes.

## Read the right document

- [Product document](PRODUCT.md): product purpose, principles, current scope, state semantics, and roadmap.
- [Product discovery and decisions](PRODUCT_DISCOVERY.md): confirmed product decisions, working assumptions, open questions, and design risks.
- [Project log](PROJECT_LOG.md): canonical addresses, architecture snapshots, decisions, milestones, and verification records.
- [Agent instructions](../AGENTS.md): coding, privacy, testing, and GitHub upload rules.
- [README](../README.md): public quick start and API reference.

## Canonical addresses

| Resource | Address | Status |
| --- | --- | --- |
| Public project and code | <https://github.com/interstellar-ai/ai-organization-os> | Active |
| Default code branch | `main` on `origin` | Active |
| Local web console | <http://localhost:3333/> | Development only |
| Production service | None | Not deployed |

The GitHub repository is the source of truth for code. The local JSON file is runtime state and must never be uploaded.

## Documentation rule

Keep the concise product definition in `PRODUCT.md`. Use `PRODUCT_DISCOVERY.md` for active product decisions, assumptions, and unresolved design questions. Keep dated implementation facts and verification results in `PROJECT_LOG.md`. Keep operational rules in `AGENTS.md` instead of duplicating them across product documents.
