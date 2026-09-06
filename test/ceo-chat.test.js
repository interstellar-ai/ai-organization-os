import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { Organization } from "../src/organization.js";
import { ExecutiveChat } from "../src/executive-chat.js";
import { CeoChatExecutor, validateCeoChatResult } from "../src/executors/ceo-chat.js";

function setup(t, reply = { reply: "One delivery is waiting for your review; no external action has run.", suggestedAction: { type: "none" } }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-ceo-chat-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const organization = new Organization(new JsonStore(path.join(directory, "state.json")), null);
  const ceo = organization.createAgent({ name: "AI CEO", jobType: "ai_ceo", capabilities: ["iterate"] });
  const product = organization.createAgent({ name: "Product Manager", jobType: "product_manager", capabilities: ["design"] });
  const goal = organization.createGoal({ title: "Improve the organization", description: "Make execution easier to understand." });
  const task = organization.createTask({ goalId: goal.id, title: "Review the workflow", assignedAgentId: product.id, workType: "product_strategy", status: "blocked", blockedReason: "Founder approval is required." });
  const calls = [];
  const executor = {
    status: () => ({ available: true, provider: "test" }),
    execute: async (input) => { calls.push(input); return { ...reply, provider: "test", usage: { input_tokens: 10 } }; }
  };
  return { organization, chat: new ExecutiveChat(organization, executor), ceo, goal, task, calls };
}

test("CEO chat receives a bounded operational snapshot and records a non-executing conversation", async (t) => {
  const { organization, chat, task, calls } = setup(t);
  const before = { goals: organization.list("goals").length, tasks: organization.list("tasks").length, agents: organization.list("agents").length };
  const result = await chat.send({ message: "What is blocking progress?" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message, "What is blocking progress?");
  assert.equal(calls[0].snapshot.activeTasks[0].id, task.id);
  assert.match(calls[0].snapshot.activeTasks[0].blocker, /Founder approval/);
  assert.equal(result.ceoMessage.role, "ceo");
  assert.equal(organization.list("ceoMessages").length, 2);
  assert.deepEqual({ goals: organization.list("goals").length, tasks: organization.list("tasks").length, agents: organization.list("agents").length }, before);
  assert.ok(organization.list("events").some((event) => event.type === "ceo.message_recorded"));
});

test("a CEO goal suggestion creates a goal only after Founder confirmation", async (t) => {
  const response = { reply: "This is a distinct outcome worth planning.", suggestedAction: { type: "propose_goal", title: "Launch a founder dashboard", description: "Define and validate a Founder-facing dashboard." } };
  const { organization, chat } = setup(t, response);
  const result = await chat.send({ message: "We should build a dashboard." });
  assert.equal(organization.list("goals").length, 1);
  const goal = chat.createGoalFromSuggestion(result.ceoMessage.id);
  assert.equal(goal.title, response.suggestedAction.title);
  assert.equal(organization.list("goals").length, 2);
  assert.equal(organization.list("ceoMessages").find((message) => message.id === result.ceoMessage.id).suggestedAction.createdGoalId, goal.id);
  assert.throws(() => chat.createGoalFromSuggestion(result.ceoMessage.id), /already been used/);
});

test("CEO chat validates the provider contract and disables all local tools", async (t) => {
  assert.throws(() => validateCeoChatResult({ reply: "Hello", suggestedAction: { type: "propose_goal", title: "Only a title" } }), /invalid/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-ceo-executor-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const executor = new CeoChatExecutor({ runtime: { command: "codex", status: () => ({ available: true }) }, processRunner: async (command, args, options) => {
    calls.push({ command, args, options });
    return { code: 0, stderr: "", stdout: [
      { type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ reply: "Current work is visible in the supplied snapshot.", suggestedAction: { type: "none" } }) } },
      { type: "turn.completed", usage: { input_tokens: 20, output_tokens: 30 } }
    ].map((event) => JSON.stringify(event)).join("\n") };
  } });
  const result = await executor.execute({ ceo: { name: "AI CEO", jobType: "ai_ceo" }, message: "Status?", history: [], snapshot: { generatedAt: "2026-01-01T00:00:00.000Z" } });
  assert.equal(result.suggestedAction.type, "none");
  assert.ok(calls[0].args.includes("read-only"));
  assert.ok(calls[0].args.includes("web_search=\"disabled\""));
  assert.ok(calls[0].args.includes("--output-schema"));
  assert.match(calls[0].options.input, /organizationSnapshot/);
  assert.equal(fs.existsSync(calls[0].options.cwd), false);
});
