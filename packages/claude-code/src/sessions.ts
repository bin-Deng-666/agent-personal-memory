import type { MenuState } from "./native-menu.ts";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import lockfile from "proper-lockfile";
import { digest } from "../../core/src/domain/memory.ts";
import type { Snapshot } from "../../core/src/history/sessions.ts";
import { readClaudeSnapshot } from "../../core/src/history/claude.ts";

export interface ClaudeSession {
  id: string;
  transcriptPath: string;
  cwd: string;
  runId: string;
  prompt: string;
  beforeIds: string[];
  anchor: string;
  menu?: MenuState;
  mode: "ordinary" | "library" | "advice" | "extraction" | "setup";
}
export class ClaudeSessions {
  readonly dir: string;
  constructor(memoryDir: string) {
    this.dir = join(memoryDir, "hosts", "claude", "sessions");
  }
  private path(id: string) {
    if (!id || id.length > 200) throw new Error("Missing Claude session ID");
    return join(this.dir, `${digest(id)}.json`);
  }
  async read(id: string): Promise<ClaudeSession> {
    const state = JSON.parse(await readFile(this.path(id), "utf8"));
    if (state.id !== id || !isAbsolute(state.transcriptPath))
      throw new Error("Invalid Claude session registry");
    return state;
  }
  async update(id: string, patch: Partial<Pick<ClaudeSession, "mode" | "menu">>) {
    const release = await lockfile.lock(this.dir, {
      realpath: false,
      stale: 30000,
      retries: { retries: 20, minTimeout: 20, maxTimeout: 100 },
    });
    try {
      const state = await this.read(id);
      Object.assign(state, patch);
      const path = this.path(id),
        temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(state) + "\n", { mode: 0o600 });
      await rename(temp, path);
    } finally {
      await release();
    }
  }
  async setMode(id: string, mode: ClaudeSession["mode"]) {
    await this.update(id, { mode });
  }
  async snapshot(state: ClaudeSession): Promise<Snapshot> {
    try {
      return await readClaudeSnapshot(state.transcriptPath, state.id);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        return { host: "claude", sessionId: `claude:${state.id}`, messages: [], entries: {} };
      throw e;
    }
  }
  async register(
    input: {
      session_id: string;
      transcript_path: string;
      cwd?: string;
      prompt?: string;
      user_prompt?: string;
    },
    turn: boolean,
  ) {
    if (!isAbsolute(input.transcript_path))
      throw new Error("Claude must provide an absolute transcript path");
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const release = await lockfile.lock(this.dir, {
      realpath: false,
      stale: 30000,
      retries: { retries: 20, minTimeout: 20, maxTimeout: 100 },
    });
    try {
      const old = await this.read(input.session_id).catch((e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return undefined;
        throw e;
      });
      const prompt = turn ? (input.prompt ?? input.user_prompt ?? "") : old?.prompt || "";
      const mode = /^\/agent-personal-memory:setup(?:\s|$)/.test(prompt.trim())
        ? "setup"
        : /^\/(?:agent-personal-memory:)?personal-memory(?:\s|$)/.test(prompt.trim())
          ? "library"
          : /^\/agent-personal-memory:advice(?:\s|$)/.test(prompt.trim())
            ? "advice"
            : /^\/agent-personal-memory:extract(?:\s|$)/.test(prompt.trim())
              ? "extraction"
              : "ordinary";
      const state: ClaudeSession = {
        id: input.session_id,
        transcriptPath: input.transcript_path,
        cwd: input.cwd || old?.cwd || "",
        runId: turn || !old ? randomUUID() : old.runId,
        prompt,
        mode: turn ? mode : old?.mode || "ordinary",
        beforeIds: old?.beforeIds || [],
        anchor: old?.anchor || "",
      };
      if (turn) {
        const snapshot = await this.snapshot(state);
        state.beforeIds = snapshot.messages.map((m) => m.id);
        state.anchor =
          [...snapshot.messages].reverse().find((m) => m.role === "user" && m.text === prompt)
            ?.id || "";
      }
      const path = this.path(state.id),
        temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(state) + "\n", { mode: 0o600 });
      await rename(temp, path);
      return state;
    } finally {
      await release();
    }
  }
}
