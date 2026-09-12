import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization } from "../src/organization.js";
import { ImprovementLoop } from "../src/improvement-loop.js";
import { ExecutiveChat } from "../src/executive-chat.js";

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-improvement-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const organization = new Organization(new JsonStore(path.join(directory, "state.json")), null);
  const employee = organization.createAgent({ name: "Software Engineer", jobType: "software_engineer", capabilities: ["build"] });
  const goal = organization.createGoal({ title: "Improve runtime", description: "Keep execution reliable." });
  return { organization, employee, goal, loop: new ImprovementLoop(organization) };
}

test("automatic scans create deduplicated signals and count changed observations", (t) => {
  const { organization, employee, goal, loop } = setup(t);
  const task = organization.createTask({ goalId: goal.id, title: "Run integration tests", assignedAgentId: employee.id,
    workType: "software_development", executionMode: "code" });
  organization.updateTask(task.id, { status: "failed", error: "Test command failed" });

  assert.equal(loop.scan().created.length, 1);
  assert.equal(loop.scan().created.length, 0);
  let signal = loop.list()[0];
  assert.equal(signal.category, "execution_failure");
  assert.equal(signal.severity, "high");
  assert.equal(signal.occurrenceCount, 1);

  organization.updateTask(task.id, { status: "failed", error: "Regression test failed again" });
  loop.scan();
  signal = loop.list()[0];
  assert.equal(signal.occurrenceCount, 2);
  assert.match(signal.summary, /again/);
  assert.equal(organization.list("events").filter((event) => event.type === "improvement.detected").length, 1);
});

test("expected control gates are ignored while missing capabilities are surfaced", (t) => {
  const { organization, employee, goal, loop } = setup(t);
  organization.createTask({ goalId: goal.id, title: "Choose repository", assignedAgentId: employee.id,
    workType: "software_development", executionMode: "code", status: "blocked",
    blockedReason: "Select a protected source-code asset in the project task before starting code work." });
  organization.createTask({ goalId: goal.id, title: "Publish draft", assignedAgentId: employee.id,
    workType: "operations", executionMode: "external", status: "blocked",
    blockedReason: "The provider has no scoped connector adapter available." });

  loop.scan();
  assert.equal(loop.list().length, 1);
  assert.equal(loop.list()[0].category, "capability_gap");
  assert.match(loop.list()[0].title, /Publish draft/);
});

test("recovered source conditions leave audit history without remaining active", (t) => {
  const { organization, employee, goal, loop } = setup(t);
  const task = organization.createTask({ goalId: goal.id, title: "Generate report", assignedAgentId: employee.id, workType: "general" });
  organization.updateTask(task.id, { status: "failed", error: "Runtime unavailable" });
  loop.scan();
  assert.equal(loop.list()[0].status, "open");

  organization.updateTask(task.id, { status: "pending", error: null });
  loop.scan();
  assert.equal(loop.list()[0].status, "superseded");
  assert.equal(loop.summary().open, 0);
});

test("Founder reports are redacted and become goals only after explicit confirmation", (t) => {
  const { organization, loop } = setup(t);
  const signal = loop.report({ title: "Failure under /Users/private-name/project", description: "password=secret-value was printed", severity: "critical" });
  assert.equal(signal.status, "open");
  assert.doesNotMatch(JSON.stringify(signal), /private-name|secret-value/);

  const result = loop.createGoal(signal.id);
  assert.equal(organization.list("goals").length, 2);
  assert.equal(result.signal.linkedGoalId, result.goal.id);
  assert.equal(result.signal.status, "goal_proposed");
  assert.throws(() => loop.createGoal(signal.id), /already/);

  organization.store.update((state) => {
    state.goals.find((goal) => goal.id === result.goal.id).executionStatus = "delivered";
    return state;
  });
  loop.scan();
  assert.equal(loop.get(signal.id).status, "ready_for_verification");
  loop.resolve(signal.id, { evidence: "Regression test passed and the corrected behavior was observed." });
  assert.equal(loop.get(signal.id).status, "resolved");
});

test("CEO snapshots receive the bounded active improvement backlog", (t) => {
  const { organization, loop } = setup(t);
  organization.createAgent({ name: "AI CEO", jobType: "ai_ceo", capabilities: ["iterate"] });
  const signal = loop.report({ title: "Unclear blocker", description: "The UI does not identify the blocked task.", severity: "high" });
  const chat = new ExecutiveChat(organization, { status: () => ({ available: true }) }, loop);
  const snapshot = chat.snapshot();
  assert.equal(snapshot.continuousImprovement.summary.open, 1);
  assert.equal(snapshot.continuousImprovement.signals[0].id, signal.id);
  assert.equal(JSON.stringify(snapshot.continuousImprovement).includes("fingerprint"), false);
});

test("dismissal and resolution require a recorded reason or evidence", (t) => {
  const { loop } = setup(t);
  const dismissed = loop.report({ title: "Expected behavior", description: "This signal is not actionable." });
  assert.throws(() => loop.dismiss(dismissed.id, {}), /reason/);
  assert.equal(loop.dismiss(dismissed.id, { reason: "The behavior is an intentional approval gate." }).status, "dismissed");

  const resolved = loop.report({ title: "Verified fix", description: "A regression needs confirmation." });
  assert.throws(() => loop.resolve(resolved.id, {}), /verification evidence/);
  assert.equal(loop.resolve(resolved.id, { evidence: "The regression test and manual check both passed." }).status, "resolved");
});

test("an existing goal can be linked without creating duplicate work", (t) => {
  const { organization, goal, loop } = setup(t);
  const signal = loop.report({ title: "Missing adapter", description: "An existing goal is already implementing the adapter." });
  const before = organization.list("goals").length;
  const result = loop.linkGoal(signal.id, { goalId: goal.id });
  assert.equal(organization.list("goals").length, before);
  assert.equal(result.signal.linkedGoalId, goal.id);
  assert.equal(result.signal.status, "goal_proposed");
  assert.throws(() => loop.resolve(signal.id, { evidence: "Too early" }), /must finish/);
});
