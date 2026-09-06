import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GeneralAgentExecutor, validateWorkResult } from "../src/executors/general.js";
import { JsonStore } from "../src/store.js";
import { Organization, Scheduler } from "../src/organization.js";
import { createDefaultTools } from "../src/tools.js";

const delivered = () => ({ outcome: "delivered", summary: "Wrote the requested brief", questions: [], limitations: ["No live research"], artifacts: [{ filename: "brief.md", content: "# Brief\n\nA concrete delivery with acceptance criteria." }] });

function setup(t, responses = [delivered()]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-general-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const calls = [];
  const executor = new GeneralAgentExecutor({ runtime: { command: "codex", status: () => ({ available: true }) },
    processRunner: async (command, args, options) => {
      calls.push({ command, args, options });
      const response = responses.shift();
      return { code: 0, stderr: "", stdout: [
        { type: "item.completed", item: { type: "agent_message", text: JSON.stringify(response) } },
        { type: "turn.completed", usage: { input_tokens: 40, output_tokens: 60 } }
      ].map((event) => JSON.stringify(event)).join("\n") };
    } });
  const organization = new Organization(new JsonStore(path.join(root, "state.json")), null);
  organization.tools = createDefaultTools(organization, { generalExecutor: executor });
  const employee = organization.createAgent({ name: "Product Manager", jobType: "product_manager", capabilities: ["research", "design", "iterate"] });
  const asset = organization.createAsset({ name: "General service", type: "agent_runtime", tags: ["general-executor"] });
  const allow = () => organization.createPolicy({ name: "Use general service", employeeJobType: "product_manager", assetType: "agent_runtime", actions: ["execute"] });
  const create = () => organization.createWorkRequest({ instructions: "Write a product brief", workType: "product_strategy", context: "Keep it local", deliverable: "A Markdown brief", acceptanceCriteria: ["State three criteria"] }, { generalAvailable: true });
  return { organization, employee, asset, calls, allow, create };
}

test("general execution produces real downloadable content and only completes after acceptance", async (t) => {
  const { organization, calls, allow, create } = setup(t);
  allow();
  const task = create();
  const result = await organization.executeTask(task.id);
  assert.equal(result.status, "awaiting_review");
  assert.equal(result.output.artifacts[0].content, delivered().artifacts[0].content);
  assert.match(result.output.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(result.evidence.length, 1);
  assert.match(calls[0].options.input, /Keep it local/);
  assert.ok(calls[0].args.includes("--output-schema"));
  assert.ok(calls[0].args.includes("read-only"));
  assert.ok(calls[0].args.includes("web_search=\"disabled\""));
  assert.equal(fs.existsSync(calls[0].options.cwd), false);
  assert.equal(organization.acceptTask(task.id).status, "completed");
  await assert.rejects(organization.executeTask(task.id), /already running or requires review/);
  assert.equal(calls.length, 1);
});

test("denied service permissions and forged task context never reach the provider", async (t) => {
  const { organization, calls, create, employee, asset } = setup(t);
  const task = create();
  await assert.rejects(organization.executeTask(task.id), /authorization denied/);
  await assert.rejects(organization.tools.execute("agent.general", { assetId: asset.id }, { organization, agent: employee, task }), /running task/);
  assert.equal(calls.length, 0);
});

test("clarification and revision preserve prior artifacts and conversation before a new run", async (t) => {
  const question = { outcome: "needs_input", summary: "Need the audience", questions: ["Who is the audience?"], limitations: [], artifacts: [] };
  const { organization, calls, allow, create } = setup(t, [question, delivered(), delivered()]);
  allow();
  const task = create();
  assert.equal((await organization.executeTask(task.id)).status, "needs_input");
  assert.throws(() => organization.acceptTask(task.id), /requires a delivered artifact/);
  assert.throws(() => organization.resumeGeneralTask(task.id, {}, { generalAvailable: true }), /message is required/);
  organization.resumeGeneralTask(task.id, { message: "The audience is solo founders" }, { generalAvailable: true });
  assert.equal((await organization.executeTask(task.id)).status, "awaiting_review");
  organization.resumeGeneralTask(task.id, { message: "Add a timeline" }, { generalAvailable: true });
  const result = await organization.executeTask(task.id);
  assert.equal(result.executionHistory.length, 2);
  assert.equal(result.executionHistory[1].output.artifacts[0].filename, "brief.md");
  assert.match(calls[2].options.input, /solo founders/);
  assert.match(calls[2].options.input, /Add a timeline/);
});

test("unavailable external work stays blocked with no false completion", async (t) => {
  const { organization, allow, create } = setup(t, [{ outcome: "blocked", summary: "Live sources are required", limitations: ["Live research is unavailable"], questions: [], artifacts: [] }]);
  allow();
  const task = create();
  const result = await organization.executeTask(task.id);
  assert.equal(result.status, "blocked");
  assert.match(result.blockedReason, /Live research/);
  assert.throws(() => organization.acceptTask(task.id), /requires a delivered artifact/);
});

test("artifact validation rejects false delivery, path injection and oversized content", () => {
  for (const payload of [
    { ...delivered(), artifacts: [] },
    { ...delivered(), artifacts: [{ filename: "../secret.md", content: "bad" }] },
    { ...delivered(), artifacts: [{ filename: "page.html", content: "<script>bad()</script>" }] },
    { ...delivered(), artifacts: [{ filename: "huge.md", content: "a".repeat(120001) }] },
    { ...delivered(), artifacts: [{ filename: "bad.json", content: "not JSON" }] },
    { ...delivered(), outcome: "needs_input" },
    { ...delivered(), artifacts: [...delivered().artifacts, ...delivered().artifacts] }
  ]) assert.throws(() => validateWorkResult(payload), /invalid delivery contract/);
});

test("duplicate execution is refused and interrupted work is safely requeued", async (t) => {
  const { organization, allow, create, calls } = setup(t);
  allow();
  const task = create();
  const first = organization.executeTask(task.id);
  await assert.rejects(organization.executeTask(task.id), /already running/);
  await first;
  assert.equal(calls.length, 1);
  const interrupted = create();
  organization.updateTask(interrupted.id, { status: "running" });
  organization.recoverInterruptedTasks();
  assert.equal(organization.getTask(interrupted.id).status, "pending");
  assert.equal(organization.getTask(interrupted.id).leaseId, null);
});

test("expired leases are recovered while active leases remain claimed", (t) => {
  const { organization, allow, create } = setup(t);
  allow();
  const expired = create();
  const active = create();
  organization.updateTask(expired.id, { status: "running", leaseId: "expired", leaseExpiresAt: new Date(Date.now() - 1000).toISOString() });
  organization.updateTask(active.id, { status: "running", leaseId: "active", leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() });
  assert.equal(organization.recoverExpiredLeases(), 1);
  assert.equal(organization.getTask(expired.id).status, "pending");
  assert.equal(organization.getTask(active.id).status, "running");
});

test("an executor cannot persist output after losing its task lease", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-stale-lease-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const organization = new Organization(new JsonStore(path.join(root, "state.json")), null);
  organization.tools = {
    list: () => [{ name: "lease.test" }],
    execute: async (_name, _input, { task }) => {
      organization.updateTask(task.id, { leaseId: "replacement-lease" });
      return { evidence: [{ type: "test" }] };
    }
  };
  const task = organization.createTask({ title: "Lease test", toolName: "lease.test" });
  await assert.rejects(organization.executeTask(task.id), /output was discarded/);
  assert.equal(organization.getTask(task.id).output, null);
  assert.equal(organization.getTask(task.id).leaseId, "replacement-lease");
});

test("scheduler leaves another request for the same employee queued", async (t) => {
  const { organization, create } = setup(t);
  const first = create();
  const second = create();
  organization.updateTask(first.id, { status: "running" });
  await assert.rejects(organization.executeTask(second.id), /capacity is busy/);
  await new Scheduler(organization).tick();
  assert.equal(organization.getTask(second.id).status, "pending");
});

test("provider failure, incomplete output and tool attempts cannot become deliveries", async () => {
  for (const response of [
    { code: 1, stdout: "", stderr: "private provider error" },
    { code: 0, stdout: "not a completed turn" },
    { code: 0, stdout: JSON.stringify({ type: "turn.completed" }) },
    { code: 0, stdout: [
      { type: "item.completed", item: { type: "command_execution", command: "forbidden" } },
      { type: "turn.completed" }
    ].map(JSON.stringify).join("\n") }
  ]) {
    let workspace;
    const executor = new GeneralAgentExecutor({ runtime: { command: "codex", status: () => ({ available: true }) },
      processRunner: async (_command, _args, options) => { workspace = options.cwd; return response; } });
    await assert.rejects(executor.execute({ task: { title: "Test" }, agent: { name: "Employee" } }));
    assert.equal(fs.existsSync(workspace), false);
  }
});

test("employee capability and expired scope prevent general execution", async (t) => {
  const { organization, create, allow, calls } = setup(t);
  allow();
  const wrongEmployee = organization.createAgent({ name: "Engineer", capabilities: ["build"] });
  assert.throws(() => organization.createWorkRequest({ instructions: "Write a product brief", workType: "product_strategy", assignedAgentId: wrongEmployee.id }, { generalAvailable: true }), /capability/);
  const task = create();
  organization.updateTask(task.id, { accessExpiresAt: new Date(Date.now() - 1000).toISOString() });
  await assert.rejects(organization.executeTask(task.id), /authorization denied/);
  assert.equal(calls.length, 0);
});
