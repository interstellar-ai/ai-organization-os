import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization } from "../src/organization.js";

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-readiness-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const organization = new Organization(new JsonStore(path.join(root, "state.json")), null);
  const employee = organization.createAgent({ name: "Operations Lead", jobType: "operations_lead", capabilities: ["iterate"] });
  const product = organization.createTask({ title: "Create the sellable digital product", assignedAgentId: employee.id });
  organization.updateTask(product.id, { status: "completed", output: { outcome: "delivered", summary: "A small downloadable template kit",
    artifacts: [{ filename: "digital_product.md", content: "# Cleaner Quote Follow-Up Mini Kit\n\nA $5 digital product with templates and a CSV tracker." }] },
  evidence: [{ id: "evidence_product", type: "agent_delivery" }] });
  const publish = organization.createTask({ title: "Publish through a Founder-authorized channel", assignedAgentId: employee.id,
    executionMode: "external", status: "blocked", dependsOn: [product.id], deliverable: "publication_record.md" });
  return { organization, product, publish };
}

test("the organization selects a channel and asks the Founder only for account setup", (t) => {
  const { organization, publish } = setup(t);
  const [action] = organization.prepareReadyExternalTasks();
  assert.equal(action.taskId, publish.id);
  assert.equal(action.recommendation.provider, "Payhip");
  assert.equal(action.recommendation.connectorType, "publishing");
  assert.match(action.recommendation.summary, /AI organization selected Payhip/);
  assert.ok(action.recommendation.systemSteps.some((step) => /Finalize the customer-facing files/.test(step)));
  assert.ok(action.recommendation.founderSteps.every((step) => !/compare|select a primary|prepare the exact product/i.test(step)));
  assert.equal(organization.prepareReadyExternalTasks().length, 0, "readiness preparation must be idempotent");
  assert.match(organization.getTask(publish.id).nextAction, /limited Founder setup checklist/);
});

test("an incompatible payment account closes Payhip and automatically selects Ko-fi", (t) => {
  const { organization, publish } = setup(t);
  const [payhip] = organization.prepareReadyExternalTasks();
  const result = organization.recordFounderRouteUnavailable(payhip.id, {
    reason: "payment_account_incompatible",
    countryCode: "cn",
    accountType: "personal",
    paymentRail: "paypal",
    password: "must-not-be-stored"
  });
  assert.equal(result.unavailable.status, "unavailable");
  assert.deepEqual(result.unavailable.routingFeedback, {
    reason: "payment_account_incompatible", accountType: "personal", paymentRail: "paypal", countryCode: "CN"
  });
  assert.equal(Object.hasOwn(result.unavailable.routingFeedback, "password"), false);
  assert.equal(result.replacement.recommendation.provider, "Ko-fi");
  assert.equal(result.replacement.supersedesActionId, payhip.id);
  assert.deepEqual(result.replacement.recommendation.matchedConstraints, {
    countryCode: "CN", accountType: "personal", paymentRail: "paypal"
  });
  assert.match(result.replacement.recommendation.summary, /personal PayPal account/);
  assert.equal(organization.getTask(publish.id).founderActionId, result.replacement.id);
  assert.match(organization.getTask(publish.id).blockedReason, /Payhip is unavailable/);
  assert.equal(organization.prepareReadyExternalTasks().length, 0, "rerouting must not recreate Payhip");
  assert.throws(() => organization.recordFounderRouteUnavailable(payhip.id, {
    reason: "other", accountType: "personal", paymentRail: "paypal"
  }), /Only a pending Founder action/);

  const completed = organization.completeFounderAction(result.replacement.id, {
    publicAccountUrl: "https://ko-fi.com/example", registrationComplete: true,
    identityAndTermsConfirmed: true, paymentReady: true
  });
  assert.equal(completed.recommendation.provider, "Ko-fi");
  assert.equal(organization.getTask(publish.id).externalReadiness.provider, "Ko-fi");
});

test("successive unavailable routes exhaust the bounded catalog without looping", (t) => {
  const { organization, publish } = setup(t);
  const [payhip] = organization.prepareReadyExternalTasks();
  const kofi = organization.recordFounderRouteUnavailable(payhip.id, {
    reason: "payment_account_incompatible", accountType: "personal", paymentRail: "paypal"
  }).replacement;
  const gumroad = organization.recordFounderRouteUnavailable(kofi.id, {
    reason: "country_unavailable", accountType: "personal", paymentRail: "paypal"
  }).replacement;
  assert.equal(gumroad.recommendation.provider, "Gumroad");
  const exhausted = organization.recordFounderRouteUnavailable(gumroad.id, {
    reason: "verification_unavailable", accountType: "personal", paymentRail: "paypal"
  });
  assert.equal(exhausted.replacement, null);
  assert.equal(organization.getTask(publish.id).founderActionId, null);
  assert.match(organization.getTask(publish.id).nextAction, /research another provider/);
  assert.equal(organization.prepareReadyExternalTasks().length, 0);
});

test("a previously unavailable route can be restored without erasing route history", (t) => {
  const { organization, publish } = setup(t);
  const [payhip] = organization.prepareReadyExternalTasks();
  const kofi = organization.recordFounderRouteUnavailable(payhip.id, {
    reason: "payment_account_incompatible", accountType: "personal", paymentRail: "paypal"
  }).replacement;

  const result = organization.recoverFounderRoute(payhip.id);
  assert.equal(result.recovered.recommendation.provider, "Payhip");
  assert.equal(result.recovered.status, "pending");
  assert.equal(result.recovered.recoveredFromActionId, payhip.id);
  assert.equal(result.recovered.supersedesActionId, kofi.id);
  assert.equal(result.replaced.status, "superseded");
  assert.equal(organization.list("founderActions").find((item) => item.id === payhip.id).status, "unavailable");
  assert.equal(organization.getTask(publish.id).founderActionId, result.recovered.id);
  assert.equal(organization.getTask(publish.id).routeConstraints, null);
  assert.match(organization.getTask(publish.id).blockedReason, /Payhip is available again/);

  const completed = organization.completeFounderAction(result.recovered.id, {
    publicAccountUrl: "https://payhip.com/example", registrationComplete: true,
    identityAndTermsConfirmed: true, paymentReady: true
  });
  assert.equal(completed.recommendation.provider, "Payhip");
  assert.equal(organization.getTask(publish.id).externalReadiness.provider, "Payhip");
  assert.throws(() => organization.recoverFounderRoute(payhip.id), /completed Founder route/);
});

test("registration stores only public readiness metadata and unlocks a manual receipt fallback", (t) => {
  const { organization, publish } = setup(t);
  const [action] = organization.prepareReadyExternalTasks();
  assert.throws(() => organization.completeFounderAction(action.id, { publicAccountUrl: "https://payhip.com/example" }), /must all be confirmed/);
  assert.throws(() => organization.completeFounderAction(action.id, { publicAccountUrl: "http://localhost:3333/",
    registrationComplete: true, identityAndTermsConfirmed: true, paymentReady: true }), /public HTTPS/);
  assert.throws(() => organization.completeFounderAction(action.id, { publicAccountUrl: "https://172.16.0.1/",
    registrationComplete: true, identityAndTermsConfirmed: true, paymentReady: true }), /public HTTPS/);
  const completed = organization.completeFounderAction(action.id, { publicAccountUrl: "https://payhip.com/example",
    registrationComplete: true, identityAndTermsConfirmed: true, paymentReady: true });
  assert.deepEqual(Object.keys(completed.completion).sort(), ["identityAndTermsConfirmed", "paymentReady", "publicAccountUrl", "registrationComplete"]);
  assert.equal(organization.getTask(publish.id).externalReadiness.provider, "Payhip");
  assert.throws(() => organization.recordManualExternalResult(publish.id, { publicUrl: "https://payhip.com/b/example" }), /must both be confirmed/);

  const delivered = organization.recordManualExternalResult(publish.id, { publicUrl: "https://payhip.com/b/example",
    performedByFounder: true, verifiedAtDestination: true });
  assert.equal(delivered.status, "awaiting_review");
  assert.equal(delivered.evidence[0].type, "founder_external_receipt");
  assert.equal(delivered.evidence[0].details.independentlyVerified, false);
  assert.match(delivered.output.artifacts[0].content, /does not independently prove sales/);
  assert.equal(organization.acceptTask(publish.id).status, "completed");
});

test("future external tasks do not interrupt current work with premature registration requests", (t) => {
  const { organization, product } = setup(t);
  organization.updateTask(product.id, { status: "pending" });
  assert.equal(organization.prepareReadyExternalTasks().length, 0);
  assert.equal(organization.list("founderActions").length, 0);
});

test("a later outcome check reuses the account and never treats a public page as sales evidence", (t) => {
  const { organization, publish } = setup(t);
  const [action] = organization.prepareReadyExternalTasks();
  organization.completeFounderAction(action.id, { publicAccountUrl: "https://payhip.com/example",
    registrationComplete: true, identityAndTermsConfirmed: true, paymentReady: true });
  organization.recordManualExternalResult(publish.id, { publicUrl: "https://payhip.com/b/example",
    performedByFounder: true, verifiedAtDestination: true });
  organization.acceptTask(publish.id);
  const verify = organization.createTask({ title: "Validate the first-dollar result and review", assignedAgentId: publish.assignedAgentId,
    executionMode: "external", status: "blocked", dependsOn: [publish.id], deliverable: "first_dollar_review.md" });
  assert.equal(organization.prepareReadyExternalTasks().length, 0);
  const prepared = organization.getTask(verify.id);
  assert.equal(prepared.founderActionId, action.id);
  assert.equal(prepared.externalIntent, "outcome_verification");
  assert.match(prepared.blockedReason, /reporting adapter/);
  assert.equal(organization.list("founderActions").length, 1);
  assert.throws(() => organization.recordManualExternalResult(verify.id, { publicUrl: "https://payhip.com/b/example",
    performedByFounder: true, verifiedAtDestination: true }), /not private messages, records, sales or outcome verification/);
});
