# Code Integration

Code execution and code integration are separate decisions.

## Workflow

1. A software employee receives an approved task and explicit source-code asset.
2. `code.codex` works in a detached, task-specific Git worktree. It cannot push, merge, deploy, or use external services.
3. The Founder reviews the changed files and accepts the delivery.
4. Acceptance creates an integration request; it does not modify the main checkout.
5. The Founder reviews the file list and exact `codex/integration` target, records a reason, and approves or rejects the request.
6. The host scans changed regular files for unsafe paths, links, excessive size, and common credential patterns.
7. The host commits the reviewed worktree, cherry-picks that commit into a persistent `codex/integration` worktree, and runs an allowlisted test command.
8. A passing result records source and integration commits as evidence. A conflict aborts the cherry-pick. A failed test reverts the integration commit.

The integration executor never pushes a remote branch, merges `main`, deploys, or modifies production infrastructure. Those require separate future connectors and approvals.

## Dependency behavior

A downstream code task does not start merely because the upstream code delivery was accepted. It waits until the upstream integration request succeeds, then starts from `codex/integration`. Final CEO reporting also waits for required code integration.

The current implementation serializes all approved code into one local integration branch. A multi-project service should use a protected branch per repository and add merge-base validation, branch locking, required checks, signed commits, pull requests, and remote repository policy enforcement.

## Test configuration

A source-code asset may define `integrationTestCommand`. The MVP accepts only a small host allowlist:

- `npm test`
- `npm run test`
- `pnpm test`
- `yarn test`
- `cargo test`
- `go test ./...`

If no command is configured and a `package.json` exists, the executor uses `npm test`. Shell strings and arbitrary commands are not accepted.

## Recovery and limitations

If integration fails after the reviewed worktree was committed, a new request can reuse that exact source commit. Generated worktrees remain local and ignored by Git. Cleanup, remote pull-request creation, deployment, and automatic conflict resolution are not implemented.
