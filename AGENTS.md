# AI Organization OS: Agent Instructions

This file is the short operating contract for coding agents working in this repository. Read it before changing code.

## Project identity

- Project: AI Organization OS MVP
- Goal: turn a human-level goal into an observable, permissioned workflow of agents, tasks, tools, memory, and evidence.
- Public code repository: <https://github.com/interstellar-ai/ai-organization-os>
- Default branch: `main`
- Local development URL: <http://localhost:3333/>
- Production deployment: none yet
- Documentation index: [`docs/PROJECT_KNOWLEDGE.md`](docs/PROJECT_KNOWLEDGE.md)
- Product definition: [`docs/PRODUCT.md`](docs/PRODUCT.md)
- Project log: [`docs/PROJECT_LOG.md`](docs/PROJECT_LOG.md)

## Non-negotiable rules

1. Keep public-facing UI, documentation, comments, and commit messages in English.
2. Never commit API keys, access tokens, cookies, personal email addresses, local filesystem paths, machine names, or private user data.
3. Keep runtime state out of Git. `data/state.json` is local-only and is ignored by `.gitignore`.
4. A task may be marked `completed` only when its executor produces an output and evidence. Planned tasks use deterministic local tools; custom tasks without an executor must remain blocked.
5. External or high-impact actions require an explicit tool, scoped permissions, an audit record, and human approval where appropriate.
6. Preserve the public repository's single source of truth: `origin/main`.

## Before uploading code

Run all of the following:

```bash
npm test
git diff --check
rg --hidden -n '[\\p{Han}]' . -g '!.git/**' -g '!data/state.json'
git status --short --branch
```

Also review the diff for secrets, personal information, local filesystem paths, machine names, and generated runtime data before pushing.

Use a short English commit message. Push directly to `main` only for small, reviewed changes. Use a feature branch and pull request for larger changes. Never rewrite public history or force-push without explicit approval.

## Completion report

Every implementation handoff should include:

- what changed;
- tests run and their result;
- the commit hash;
- the public repository URL;
- any remaining limitation or unverified external action.
