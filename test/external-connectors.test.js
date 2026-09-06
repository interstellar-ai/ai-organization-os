import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConnectorRegistry } from "../src/executors/connectors.js";
import { Organization } from "../src/organization.js";
import { JsonStore } from "../src/store.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function organizationSetup(t, connectorType, action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-external-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const organization = new Organization(new JsonStore(path.join(root, "state.json")), null);
  const agent = organization.createAgent({ name: "Operations Lead", jobType: "operations_lead", capabilities: ["research", "iterate"] });
  const asset = organization.createAsset({ name: `${connectorType} connector`, type: "external_connector", connectorType, environment: "external" });
  organization.createPolicy({ name: `${connectorType} requires approval`, employeeJobType: agent.jobType,
    assetType: "external_connector", actions: [action], effect: "approval_required" });
  const task = organization.createTask({ title: `Use ${connectorType}`, assignedAgentId: agent.id, executionMode: "external",
    status: "blocked", blockedReason: "External connector approval is required" });
  return { organization, asset, task };
}

test("live research fetches only approved public HTTPS sources and creates evidence", async (t) => {
  const calls = [];
  const registry = new ConnectorRegistry({ environment: {}, lookup: publicLookup, fetch: async (url) => {
    calls.push(String(url));
    return new Response("<html><body><h1>Verified source</h1><script>ignore()</script></body></html>",
      { status: 200, headers: { "content-type": "text/html" } });
  } });
  const { organization, asset, task } = organizationSetup(t, "web_research", "read");
  const request = organization.requestExternalAction(task.id, { connectorType: "web_research", assetId: asset.id,
    payload: { query: "Verify a claim", urls: ["https://example.com/source"] } }, registry);
  assert.equal(request.status, "pending");
  assert.equal(calls.length, 0, "creating an approval preview must not call the network");
  const completed = await organization.decideExternalAction(request.id, { decision: "approved", reason: "Use this public source." }, registry);
  assert.equal(completed.status, "completed");
  assert.equal(calls.length, 1);
  assert.match(organization.getTask(task.id).output.artifacts[0].content, /Verified source/);
  assert.equal(organization.getTask(task.id).status, "awaiting_review");
  assert.equal(organization.acceptTask(task.id).status, "completed");
});

test("private research destinations are blocked before network access", async (t) => {
  let calls = 0;
  const registry = new ConnectorRegistry({ environment: {}, lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    fetch: async () => { calls += 1; return new Response("private"); } });
  const { organization, asset, task } = organizationSetup(t, "web_research", "read");
  const request = organization.requestExternalAction(task.id, { connectorType: "web_research", assetId: asset.id,
    payload: { urls: ["https://internal.example/resource"] } }, registry);
  await assert.rejects(organization.decideExternalAction(request.id, { decision: "approved", reason: "Attempt public research." }, registry), /private or unavailable/);
  assert.equal(calls, 0);
  assert.equal(organization.list("externalActions")[0].status, "failed");
});

test("side-effect connectors never run before approval and failures become uncertain", async (t) => {
  let calls = 0;
  const registry = new ConnectorRegistry({ environment: { RESEND_API_KEY: "configured-for-test", AI_ORG_EMAIL_FROM: "service@example.com" },
    lookup: publicLookup, fetch: async () => { calls += 1; throw new Error("Provider timeout"); } });
  const { organization, asset, task } = organizationSetup(t, "email", "send");
  const request = organization.requestExternalAction(task.id, { connectorType: "email", assetId: asset.id,
    payload: { to: "recipient@example.com", subject: "Approved subject", text: "Approved message" } }, registry);
  assert.equal(calls, 0);
  await assert.rejects(organization.decideExternalAction(request.id, { decision: "approved", reason: "Send this exact message." }, registry), /Provider timeout/);
  assert.equal(calls, 1);
  assert.equal(organization.list("externalActions")[0].status, "uncertain");
  assert.equal(organization.getTask(task.id).status, "awaiting_review");
  assert.match(organization.getTask(task.id).nextAction, /Verify the destination/);
});

test("an action-bound grant cannot authorize a different external task", (t) => {
  const { organization, asset, task } = organizationSetup(t, "email", "send");
  const request = organization.createAccessRequest({ requesterAgentId: task.assignedAgentId, assetId: asset.id,
    action: "send", reason: "Exact action only", grantType: "once" });
  organization.decideAccessRequest(request.id, { decision: "approved", reason: "Approve one exact action", grantType: "once" });
  organization.store.update((state) => {
    state.accessRequests.find((item) => item.id === request.id).externalActionId = "action_original";
    return state;
  });
  const other = organization.createTask({ title: "Different email", assignedAgentId: task.assignedAgentId,
    executionMode: "external", toolName: "connector.email", status: "pending",
    accessScope: [{ assetId: asset.id, actions: ["send"] }], accessExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  organization.updateTask(other.id, { status: "running", externalActionId: "action_other" });
  assert.throws(() => organization.authorizeToolCall({ agentId: task.assignedAgentId, taskId: other.id,
    assetId: asset.id, action: "send", toolName: "connector.email", grantId: request.id }), /authorization denied/);
});
