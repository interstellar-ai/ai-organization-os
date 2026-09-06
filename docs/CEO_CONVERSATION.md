# CEO Conversation

Home is the Founder’s persistent conversation with the AI CEO. It is an executive interface, not an unrestricted agent shell.

## What it does

The Founder can ask for:

- current progress, blockers, evidence, pending approvals, or employee workload;
- strategic discussion, tradeoffs, and recommendations;
- an optional suggested goal when a new outcome should enter the organization.

For every message, the host constructs a timestamped, bounded snapshot of goals, projects, active tasks, pending approvals, employee count, and departments. The CEO receives this summary plus only the recent CEO conversation. It does not receive raw assets, files, private memories, hidden employee context, credentials, or browser access.

## Action boundary

Conversation itself may only persist its two messages and an audit event. It cannot:

- start or change work;
- create employees or modify access;
- call external connectors;
- read or modify code, files, assets, or organizational memory;
- send, publish, deploy, spend, or approve.

When the CEO sees a clear new outcome, it may return a `propose_goal` suggestion. The Founder must explicitly click **Create goal and request CEO plan**. That creates a goal and invokes the existing planning workflow; it still does not authorize projects, employee work, hiring, access, code integration, or external action.

## Reliability and limits

The CEO must distinguish snapshot-backed operational facts from recommendations. The UI displays the snapshot time beside each CEO reply. A conversation may retain up to 100 messages, while only the latest 12 are passed to the model. The model runs in a temporary read-only workspace with local tools, web search, plugins, browser use, and external access disabled.

## API

- `GET /api/ceo/conversation` returns the bounded message history, current host snapshot, and runtime readiness.
- `POST /api/ceo/conversation/messages` accepts `{ "message": "..." }`, invokes the CEO conversation runtime, and records the Founder/CEO pair.
- `POST /api/ceo/conversation/messages/:id/create-goal` confirms a stored CEO goal suggestion and creates the goal. The client then separately starts planning.
