# Durable Runtime

The v0.9 runtime replaces direct JSON writes with transactional SQLite state and replaces optimistic scheduling with persisted task leases.

## Persistence

The default database is the ignored `data/organization.sqlite` file. SQLite runs in WAL mode with full synchronous writes, a busy timeout, schema version, monotonically increasing revision, and `BEGIN IMMEDIATE` transactions. A mutation either persists the complete normalized organization state or rolls back.

On first creation, the store imports an existing ignored `data/state.json` file. `AI_ORG_STORE=json` retains the legacy adapter for development and migration checks only.

The current schema intentionally preserves the existing application state contract as one versioned JSON document. This makes migration from the MVP safe and atomic, but it does not provide relational query performance, row-level tenant isolation, or horizontal write scaling.

## Durable task claims

The scheduler orders pending work by priority and claims each task inside the store transaction. A claim records:

- a unique lease ID;
- a lease expiration timestamp;
- the attempt count;
- the selected executor;
- an audit event.

Only the matching lease may complete the claimed task. Claims enforce two concurrent tasks and one task per employee. Dependencies must be completed; code dependencies must also be integrated. On process startup, interrupted idempotent task work is requeued. During operation, expired leases are requeued with an audit event. Controlled plans retain bounded transient retry and model-run budgets.

External side effects do not use the normal retry queue. Their approval record and idempotency key are durable, and interrupted execution becomes `uncertain` for human verification.

## Production boundary

This is a crash-durable single-node runtime suitable for serious local pilots and one trusted operator. It is not the final multi-tenant production architecture. A hosted edition still requires:

- PostgreSQL with relational migrations, tenant keys, row-level access enforcement, backups, and point-in-time recovery;
- a dedicated queue or database-backed job broker with worker heartbeats, cancellation, dead-letter handling, and operational dashboards;
- authenticated user and service identities;
- managed secrets and short-lived provider credentials;
- isolated worker processes or containers with network egress policy;
- metrics, tracing, alerting, retention controls, and disaster-recovery testing.

Calling the present runtime “production grade” without these deployment controls would be misleading. It is the durable adapter and lease protocol on which that edition can be built.
