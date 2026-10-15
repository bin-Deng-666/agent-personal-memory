import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../packages/claude-code/", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "agent-memory-real-claude-"));
const requests = [];
const server = createServer(async (req, res) => {
  if (!req.url.includes("/messages")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: [] }));
    return;
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  requests.push(body);
  res.writeHead(200, { "content-type": "text/event-stream" });
  const emit = (type, value) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", {
    message: {
      id: `fixture-${requests.length}`,
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 20, output_tokens: 0 },
    },
  });
  const memoryTool = body.tools?.find(
    (tool) => tool.name === "mcp__plugin_agent-personal-memory_memory__memory_search",
  );
  const text = JSON.stringify(body);
  const id = text.match(/Claude sessionId: ([a-f0-9-]+)/)?.[1];
  const alreadyCalled = body.messages?.some((message) =>
    JSON.stringify(message).includes('"type":"tool_result"'),
  );
  if (memoryTool && id && !alreadyCalled) {
    emit("content_block_start", {
      index: 0,
      content_block: { type: "tool_use", id: "fixture-tool", name: memoryTool.name, input: {} },
    });
    emit("content_block_delta", {
      index: 0,
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify({ sessionId: id, query: "结论" }),
      },
    });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", {
      delta: { stop_reason: "tool_use", stop_sequence: null },
      usage: { output_tokens: 30 },
    });
  } else {
    emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
    emit("content_block_delta", {
      index: 0,
      delta: { type: "text_delta", text: "Fixture response." },
    });
    emit("content_block_stop", { index: 0 });
    emit("message_delta", {
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: 4 },
    });
  }
  emit("message_stop", {});
  res.end();
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const memoryDir = join(dir, "memory");
  await mkdir(join(memoryDir, "records"), { recursive: true });
  await writeFile(
    join(memoryDir, "records", "preferences.json"),
    JSON.stringify({
      schemaVersion: 1,
      type: "稳定偏好",
      memories: [
        {
          id: "fixture-habit",
          version: 1,
          title: "先给结论",
          content: "回答时先给结论",
          type: "稳定偏好",
          scope: "对话",
          certainty: "明确",
          tags: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
          sources: [],
        },
      ],
    }),
  );
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: join(dir, "claude"),
    PERSONAL_MEMORY_DIR: memoryDir,
    ANTHROPIC_API_KEY: "local-test",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    DISABLE_AUTOUPDATER: "1",
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
  delete env.CLAUDECODE;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const result = await exec(
    "claude",
    [
      "--plugin-dir",
      root,
      "--setting-sources",
      "",
      "--permission-mode",
      "dontAsk",
      "--model",
      "claude-sonnet-4-6",
      "-p",
      "A synthetic collaboration question.",
      "--output-format",
      "json",
    ],
    { cwd: dir, env, timeout: 45000, maxBuffer: 2_000_000 },
  );
  const final = JSON.parse(result.stdout);
  assert.equal(final.is_error, false, JSON.stringify(final));
  assert.ok(
    requests.length >= 2,
    "The real Claude host should complete an MCP search and continue",
  );
  assert.ok(
    JSON.stringify(requests[0]).includes("回答时先给结论"),
    "Session/turn hooks must preload the persisted habit",
  );
  assert.ok(
    requests[0].tools.some(
      (tool) => tool.name === "mcp__plugin_agent-personal-memory_memory__memory_write",
    ),
    "Plugin MCP tools must be discovered by the real host",
  );
  assert.ok(
    requests.slice(1).some((request) => JSON.stringify(request.messages).includes("fixture-habit")),
    "The host must receive the actual shared-memory tool result",
  );
  console.log(
    "Claude Code host verified: plugin discovery, habit injection, MCP search and continuation; local fixture provider only.",
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
