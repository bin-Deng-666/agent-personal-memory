import { randomUUID } from "node:crypto";
import { mkdir, readFile, open, rename, unlink, access } from "node:fs/promises";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import {
  TYPES,
  TYPE_FILES,
  emptyState,
  isDuplicate,
  normalize,
  sourceKey,
  proposalKeys,
  contentKey,
  validateProposal,
  validateState,
} from "../domain/memory.ts";
import { organizedMemories } from "../domain/organization.ts";
import type { OrganizationGroup } from "../domain/organization.ts";
import type { Memory, MemoryType, Proposal, Scan, Settings, State } from "../domain/memory.ts";

async function jsonFile<T>(path: string, fallback: () => T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback();
    throw new Error(`Cannot read ${path}; original file was preserved: ${String(e)}`);
  }
}
async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
async function atomic(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value, null, 2) + "\n");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export class MemoryStore {
  readonly file: string;
  readonly settingsFile: string;
  readonly recordsDir: string;
  readonly journalFile: string;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly dir: string) {
    this.file = join(dir, "metadata.json");
    this.settingsFile = join(dir, "settings.json");
    this.recordsDir = join(dir, "records");
    this.journalFile = join(dir, "transaction.json");
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue
      .catch(() => {})
      .then(async () => {
        await mkdir(this.dir, { recursive: true, mode: 0o700 });
        const release = await lockfile.lock(this.dir, {
          realpath: false,
          stale: 30000,
          retries: { retries: 30, minTimeout: 50, maxTimeout: 300 },
        });
        try {
          return await fn();
        } finally {
          await release();
        }
      });
    this.queue = task;
    return task;
  }
  private async publish(state: State) {
    await mkdir(this.recordsDir, { recursive: true, mode: 0o700 });
    for (const type of TYPES)
      await atomic(join(this.recordsDir, TYPE_FILES[type]), {
        schemaVersion: 1,
        type,
        memories: state.memories.filter((m) => m.type === type),
      });
    const counts = Object.fromEntries(
      TYPES.map((type) => [type, state.memories.filter((m) => m.type === type).length]),
    );
    await atomic(this.file, {
      schemaVersion: state.schemaVersion,
      suppressed: state.suppressed,
      scans: state.scans,
      counts,
    });
  }
  private async commit(state: State) {
    validateState(state);
    // Durable write-ahead journal makes type changes and multi-file publication recoverable.
    await atomic(this.journalFile, state);
    await this.publish(state);
    await unlink(this.journalFile);
  }
  private async recover() {
    if (await exists(this.journalFile)) {
      const state = await jsonFile<State>(this.journalFile, emptyState);
      validateState(state);
      await this.publish(state);
      await unlink(this.journalFile);
    }
    const legacy = join(this.dir, "memories.json");
    if (await exists(legacy)) {
      if (!(await exists(this.file))) {
        const state = await jsonFile<State>(legacy, emptyState);
        validateState(state);
        await this.commit(state);
      }
      // Migration completes before removing the old plaintext copy.
      await unlink(legacy);
    }
  }
  private async readRecords(type: MemoryType): Promise<Memory[]> {
    const value = await jsonFile(join(this.recordsDir, TYPE_FILES[type]), () => ({
      schemaVersion: 1,
      type,
      memories: [] as Memory[],
    }));
    if (
      value.schemaVersion !== 1 ||
      value.type !== type ||
      !Array.isArray(value.memories) ||
      value.memories.some((m) => m.type !== type)
    )
      throw new Error(`Invalid ${TYPE_FILES[type]}; file was preserved`);
    const state = { ...emptyState(), memories: value.memories };
    validateState(state);
    return state.memories;
  }
  private async readUnlocked(): Promise<State> {
    await this.recover();
    const metadata = await jsonFile<Omit<State, "memories">>(this.file, () => {
      const { memories, ...rest } = emptyState();
      return rest;
    });
    const memories = (await Promise.all(TYPES.map((type) => this.readRecords(type)))).flat();
    // Select live metadata fields explicitly; retired approval records are ignored.
    const state: State = {
      schemaVersion: metadata.schemaVersion,
      suppressed: metadata.suppressed,
      scans: metadata.scans,
      memories,
    };
    validateState(state);
    return state;
  }
  async read(): Promise<State> {
    return this.exclusive(() => this.readUnlocked());
  }
  async readType(type: MemoryType): Promise<Memory[]> {
    return this.exclusive(async () => {
      await this.recover();
      return this.readRecords(type);
    });
  }
  async count(): Promise<number> {
    return this.exclusive(async () => {
      await this.recover();
      const metadata = await jsonFile<any>(this.file, () => ({}));
      if (
        metadata.counts &&
        TYPES.every((t) => Number.isInteger(metadata.counts[t]) && metadata.counts[t] >= 0)
      )
        return TYPES.reduce((n, t) => n + metadata.counts[t], 0);
      return (await this.readUnlocked()).memories.length;
    });
  }
  async initialize() {
    await this.exclusive(async () => {
      const state = await this.readUnlocked();
      if (!(await exists(this.file))) await this.commit(state);
      const settings = await this.settings();
      await atomic(this.settingsFile, settings);
    });
  }
  async settings(): Promise<Settings> {
    const value = await jsonFile<any>(this.settingsFile, () => ({ enabled: true }));
    if (value.enabled === undefined && typeof value.ask === "boolean") return { enabled: true };
    if (typeof value.enabled !== "boolean") throw new Error("Invalid memory settings");
    return { enabled: value.enabled };
  }
  async setEnabled(enabled: boolean) {
    await this.exclusive(() => atomic(this.settingsFile, { enabled }));
  }
  private async change<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const state = await this.readUnlocked();
      const value = await fn(state);
      await this.commit(state);
      return value;
    });
  }
  async apply(p: Proposal): Promise<Memory | undefined> {
    validateProposal(p);
    return this.change(async (s) => {
      if (p.origin !== "manual" && !(await this.settings()).enabled)
        throw new Error("Memory is off; no changes were saved");
      const now = new Date().toISOString();
      if (p.action === "add") {
        if (isDuplicate(s, p) && p.origin !== "manual" && p.origin !== "explicit")
          throw new Error("Already saved or excluded; no duplicate was saved");
        if (s.memories.some((m) => normalize(m.content) === normalize(p.content)))
          throw new Error("This memory already exists");
        const m: Memory = {
          id: randomUUID(),
          version: 1,
          title: p.title.trim(),
          content: p.content.trim(),
          type: p.type,
          scope: p.scope,
          certainty: p.certainty,
          tags: p.tags,
          createdAt: now,
          updatedAt: now,
          sources: p.sources,
        };
        s.memories.push(m);
        return m;
      }
      const index = s.memories.findIndex((m) => m.id === p.targetId);
      if (index < 0 || s.memories[index].version !== p.targetVersion)
        throw new Error(
          "This memory was changed or deleted in another session; retrieve its latest version",
        );
      const old = s.memories[index];
      if (p.action === "delete") {
        s.suppressed = [...new Set([...s.suppressed, ...proposalKeys(old)])];
        s.memories.splice(index, 1);
        return undefined;
      }
      if (s.memories.some((m) => m.id !== old.id && normalize(m.content) === normalize(p.content)))
        throw new Error("The new content duplicates another memory; no changes were saved");
      s.suppressed = [...new Set([...s.suppressed, contentKey(old.content)])];
      const m: Memory = {
        ...old,
        version: old.version + 1,
        title: p.title.trim(),
        content: p.content.trim(),
        type: p.type,
        scope: p.scope,
        certainty: p.certainty,
        tags: p.tags,
        updatedAt: now,
        sources: [...old.sources, ...p.sources].filter(
          (v, i, a) => a.findIndex((x) => sourceKey(x) === sourceKey(v)) === i,
        ),
      };
      s.memories[index] = m;
      return m;
    });
  }
  async organize(snapshot: Memory[], groups: OrganizationGroup[]) {
    return this.change((state) => {
      const next = organizedMemories(state, snapshot, { groups });
      // Suppress old wording only. Merged evidence remains valid and must not be blacklisted.
      const retired = snapshot.filter(
        (old) => !next.some((memory) => normalize(memory.content) === normalize(old.content)),
      );
      state.suppressed = [
        ...new Set([...state.suppressed, ...retired.map((memory) => contentKey(memory.content))]),
      ];
      state.memories = next;
      return next;
    });
  }
  async recordScan(sessionId: string, scan: Scan) {
    await this.change((s) => {
      s.scans[sessionId] = scan;
    });
  }
}
