import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization, Scheduler } from "../src/organization.js";
import { createDefaultTools } from "../src/tools.js";

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-os-"));
  const store = new JsonStore(path.join(dir, "state.json"));
  const organization = new Organization(store, null);
  organization.tools = createDefaultTools(organization);
  return organization;
}

async function waitFor(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for workflow");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("creates agents, goals and a dependency-ordered plan", () => {
  const organization = setup();
  organization.createAgent({ name: "Builder", capabilities: ["build"] });
  const goal = organization.createGoal({ title: "Ship MVP" });
  const tasks = organization.planGoal(goal.id);
  assert.equal(tasks.length, 5);
  assert.equal(tasks[2].assignedAgentId !== null, true);
  assert.deepEqual(tasks[1].dependsOn, [tasks[0].id]);
  assert.equal(tasks[0].toolName, "goal.analyze");
  assert.equal(tasks[0].acceptanceCriteria.length > 0, true);
});

test("scheduler executes ready tasks and then unlocks dependencies", async () => {
  const organization = setup();
  const first = organization.createTask({ title: "Write memory", toolName: "memory.write", input: { content: "MVP is local-first" } });
  const second = organization.createTask({ title: "Read memory", dependsOn: [first.id], toolName: "memory.search", input: { query: "local-first" } });
  const scheduler = new Scheduler(organization, 10);
  scheduler.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  scheduler.stop();
  const tasks = organization.list("tasks");
  assert.equal(tasks.find((task) => task.id === first.id).status, "completed");
  assert.equal(tasks.find((task) => task.id === second.id).status, "completed");
  assert.equal(organization.searchMemories("local-first").length, 1);
});

test("a planned goal completes with evidence and awaits human review", async () => {
  const organization = setup();
  organization.createAgent({ name: "COO", role: "coo", capabilities: ["research", "design", "validate", "iterate"] });
  organization.createAgent({ name: "Builder", capabilities: ["build"] });
  const goal = organization.createGoal({ title: "Validate the local workflow", description: "Produce an evidence-backed MVP validation" });
  organization.planGoal(goal.id);
  const scheduler = new Scheduler(organization, 10);
  scheduler.start();
  await waitFor(() => organization.summarizeGoal(goal.id).progress.completed === 5);
  scheduler.stop();
  const summary = organization.summarizeGoal(goal.id);
  assert.equal(summary.executionStatus, "awaiting_review");
  assert.equal(summary.evidence.length >= 5, true);
  assert.equal(summary.tasks.every((task) => task.status === "completed"), true);
  assert.equal(organization.list("events").some((event) => event.type === "task.completed"), true);
});

test("unknown tools fail safely", async () => {
  const organization = setup();
  const task = organization.createTask({ title: "Bad tool", toolName: "not-registered" });
  await assert.rejects(() => organization.executeTask(task.id), /Unknown tool/);
  assert.equal(organization.list("tasks")[0].status, "failed");
});
