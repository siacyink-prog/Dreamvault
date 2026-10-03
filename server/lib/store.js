import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export class JsonDreamStore {
  constructor({ file, seedFile }) {
    this.file = file;
    this.seedFile = seedFile;
    this.ensureReady();
  }

  ensureReady() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    if (!fs.existsSync(this.file)) fs.copyFileSync(this.seedFile, this.file);
  }

  all() {
    return JSON.parse(fs.readFileSync(this.file, "utf8"));
  }

  replace(entries) {
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(entries, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  rename(id, title) {
    const entries = this.all();
    const entry = entries.find((item) => String(item.id) === String(id));
    if (!entry) return null;
    entry.title = title;
    this.replace(entries);
    return entry;
  }

  get(id) {
    return this.all().find((item) => String(item.id) === String(id)) || null;
  }

  create({ title, content, visibility }) {
    const entries = this.all();
    const entry = {
      id: `dream_${randomBytes(8).toString("hex")}`,
      author: "assistant",
      title: title || null,
      content,
      visibility,
      created_at: new Date().toISOString(),
    };
    entries.push(entry);
    this.replace(entries);
    return entry;
  }

  reveal(id) {
    const entries = this.all();
    const entry = entries.find((item) => String(item.id) === String(id));
    if (!entry) return null;
    entry.visibility = "public";
    delete entry.hidden_reason;
    this.replace(entries);
    return entry;
  }
}


