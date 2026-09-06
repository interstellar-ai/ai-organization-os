import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteStore } from "../src/sqlite-store.js";

test("SQLite store imports legacy state and persists atomic revisions", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-org-sqlite-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const legacy = path.join(dir, "state.json");
  fs.writeFileSync(legacy, JSON.stringify({ goals: [{ id: "goal_one", title: "Imported", executionStatus: "not_started" }] }));
  const file = path.join(dir, "organization.sqlite");
  const store = new SqliteStore(file, { importJsonPath: legacy });
  assert.equal(store.read().goals[0].title, "Imported");
  store.update((state) => { state.goals[0].title = "Persisted"; return state; });
  assert.throws(() => store.update((state) => { state.goals[0].title = "Rolled back"; throw new Error("stop"); }), /stop/);
  store.close();
  const reopened = new SqliteStore(file);
  assert.equal(reopened.read().goals[0].title, "Persisted");
  reopened.close();
});
