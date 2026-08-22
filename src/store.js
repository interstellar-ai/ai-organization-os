import fs from "node:fs";
import path from "node:path";

const EMPTY_STATE = {
  agents: [],
  goals: [],
  tasks: [],
  memories: []
};

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (!fs.existsSync(filePath)) this.write(EMPTY_STATE);
  }

  read() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  }

  write(state) {
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, this.filePath);
  }

  update(mutator) {
    const state = this.read();
    const result = mutator(state) || state;
    this.write(result);
    return result;
  }
}
