# External Connectors

External tools are host-controlled capabilities, not tools available directly to a model. The model may propose an external task, but only the application can construct a connector request, calculate policy, grant one exact capability, invoke the provider, consume the grant, and persist a receipt.

## Supported connectors

| Type | Provider | Capability | Server configuration |
| --- | --- | --- | --- |
| Live research | Public HTTPS and optional Brave Search | Retrieve up to five public sources | `BRAVE_SEARCH_API_KEY` is optional when explicit URLs are supplied |
| Email | Resend | Send one exact plain-text email | `RESEND_API_KEY`, `AI_ORG_EMAIL_FROM` |
| CRM | HubSpot | Create one contact, company, or deal | `HUBSPOT_ACCESS_TOKEN` |
| Publishing | Approved HTTPS webhook | Publish one exact payload | `AI_ORG_PUBLISH_WEBHOOK_URL`, `AI_ORG_PUBLISH_WEBHOOK_TOKEN` |

Credentials stay in the server process environment. They are never returned by connector status endpoints, written to task records, exposed to model prompts, or committed to Git.

## Approval workflow

1. An approved goal plan creates an external task in `blocked` state.
2. After dependencies are accepted—and code dependencies are integrated—the Founder prepares a provider-specific payload in the task view.
3. The host validates the payload and stores a non-executing preview.
4. The Approvals page displays the connector, operation, risk, readiness, and exact preview.
5. Approval creates a one-use grant tied to the employee, task, connector asset, operation, and external-action ID.
6. The host checks assignment, active task state, capability scope, expiration, effective policy, and grant before invocation.
7. The connector executes with the action ID as an idempotency key where supported. The grant is consumed and a receipt is recorded.
8. The delivery remains `awaiting_review` until the Founder accepts its evidence.

Rejection never invokes a provider. An unconfigured provider cannot be approved.

## Network controls

Research and publishing URLs must use HTTPS without embedded credentials or custom ports. DNS resolution is checked and private, loopback, link-local, and unavailable destinations are blocked. Redirects are revalidated, response types and sizes are bounded, and research scripts and styles are removed from captured text.

These checks reduce server-side request forgery risk, but they are not a substitute for an egress proxy and network namespace in a hosted multi-tenant deployment.

## Failure semantics

Read-only research failures become `failed` and may be revised. Email, CRM, and publishing failures after invocation become `uncertain`, because a timeout can occur after the provider accepted the action. Restarting while such an action is executing also produces `uncertain`. The system will not retry automatically; a human must verify the destination first.

Provider-side idempotency behavior varies. Exactly-once external delivery cannot be guaranteed by this MVP.
