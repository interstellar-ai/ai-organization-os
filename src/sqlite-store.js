import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EMPTY_STATE, normalizeState } from "./store.js";

export class SqliteStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.database = new DatabaseSync(filePath);
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;");
    this.database.exec(`CREATE TABLE IF NOT EXISTS organization_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      schema_version INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    if (!this.database.prepare("SELECT singleton FROM organization_state WHERE singleton = 1").get()) {
      const legacy = options.importJsonPath && fs.existsSync(options.importJsonPath)
        ? JSON.parse(fs.readFileSync(options.importJsonPath, "utf8"))
        : EMPTY_STATE;
      this.database.prepare("INSERT INTO organization_state VALUES (1, 1, 0, ?, ?)")
        .run(JSON.stringify(normalizeState(legacy)), new Date().toISOString());
    }
  }

  readRaw() {
    const row = this.database.prepare("SELECT state_json FROM organization_state WHERE singleton = 1").get();
    if (!row) throw new Error("SQLite organization state is unavailable");
    return JSON.parse(row.state_json);
  }

  read() {
    return normalizeState(this.readRaw());
  }

  write(state) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE organization_state SET state_json = ?, revision = revision + 1, updated_at = ? WHERE singleton = 1")
        .run(JSON.stringify(normalizeState(state)), new Date().toISOString());
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  update(mutator) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const state = normalizeState(this.readRaw());
      const result = normalizeState(mutator(state) || state);
      this.database.prepare("UPDATE organization_state SET state_json = ?, revision = revision + 1, updated_at = ? WHERE singleton = 1")
        .run(JSON.stringify(result), new Date().toISOString());
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.database.close();
  }
}
