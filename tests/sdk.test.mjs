import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
const { createJiti } = createRequire(
  fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")),
)("jiti");
const jiti = createJiti(import.meta.url);
const factory = (await jiti.import("../index.ts")).default;
const { MemoryStore } = await jiti.import("../src/storage/store.ts");
const textOf = (m) =>
  typeof m.content === "string"
    ? m.content
    : (m.content || [])
        .filter((p) => p.type === "text")
        .map((p) => p.text)
        .join("\n");

test(
  "SDK integration: a switch during an in-flight response blocks the write and changes the next request",
  { timeout: 25000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-memory-sdk-"));
    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = dir;
    const store = new MemoryStore(join(dir, "memory"));
    await store.initialize();
    const record = (content) => ({
      action: "add",
      title: content,
      content,
      type: "稳定偏好",
      scope: "",
      certainty: "明确",
      tags: [],
      reason: "Manual test record",
      origin: "manual",
      sources: [],
    });
    await store.apply(record("回答时先给结论"));
    await store.apply({
      ...record("PRIVATE_EXPERIENCE_SHOULD_NOT_BE_PRELOADED"),
      type: "个人经历",
    });
    const requests = [];
    const errors = [];
    let session;
    const userPrompt = "我长期在内网环境工作，很多工具无法访问外网。";
    const server = createServer(async (request, response) => {
      try {
        let raw = "";
        for await (const part of request) raw += part;
        const body = JSON.parse(raw);
        requests.push(body);
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        if (requests.length === 1) {
          const referenceText = body.messages
            .map(textOf)
            .find((t) => t.includes("Source IDs for memory_write"));
          assert.ok(referenceText, "Source IDs should be available to the real model request");
          const refs = JSON.parse(
            referenceText.slice(referenceText.indexOf("{"), referenceText.lastIndexOf("}") + 1),
          );
          const source = refs.sources.at(-1);
          // Same setting transaction that /memory uses, while the provider request is already in flight.
          await store.setEnabled(false);
          const args = {
            action: "add",
            title: "内网工作条件",
            content: userPrompt,
            type: "个人背景",
            reason: "未来工具选型需考虑离线可用性",
            entryId: source.entryId,
            quote: userPrompt,
          };
          response.write(
            `data: ${JSON.stringify({ id: "call", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "memory-call", type: "function", function: { name: "memory_write", arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\n`,
          );
          response.write(
            `data: ${JSON.stringify({ id: "call", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
          );
        } else {
          response.write(
            `data: ${JSON.stringify({ id: "answer", choices: [{ index: 0, delta: { role: "assistant", content: "Done." }, finish_reason: null }] })}\n\n`,
          );
          response.write(
            `data: ${JSON.stringify({ id: "answer", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`,
          );
        }
        response.end("data: [DONE]\n\n");
      } catch (error) {
        errors.push(String(error));
        response.end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      await writeFile(
        join(dir, "models.json"),
        JSON.stringify({
          providers: {
            fake: {
              baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
              api: "openai-completions",
              apiKey: "local-test",
              models: [
                { id: "fake-model", contextWindow: 64000, maxTokens: 4096, reasoning: false },
              ],
            },
          },
        }),
      );
      const runtime = await ModelRuntime.create({
        authPath: join(dir, "auth.json"),
        modelsPath: join(dir, "models.json"),
        refreshOnCreate: false,
      });
      const loader = new DefaultResourceLoader({
        cwd: dir,
        agentDir: dir,
        noSkills: true,
        noContextFiles: true,
        noThemes: true,
        noPromptTemplates: true,
        extensionFactories: [factory],
        systemPrompt: "You are a test assistant.",
      });
      await loader.reload();
      ({ session } = await createAgentSession({
        cwd: dir,
        agentDir: dir,
        model: runtime.getModel("fake", "fake-model"),
        modelRuntime: runtime,
        resourceLoader: loader,
        thinkingLevel: "off",
        sessionManager: SessionManager.inMemory(dir),
        tools: ["memory_search", "memory_write"],
        settingsManager: SettingsManager.inMemory({
          retry: { enabled: false },
          cacheWarming: "off",
        }),
      }));
      await session.bindExtensions({
        mode: "print",
        onError: (error) => errors.push(String(error)),
      });
      await session.prompt(userPrompt);
      assert.deepEqual(errors, []);
      assert.equal(requests.length, 2);
      assert.ok(requests[0].tools.some((t) => t.function?.name === "memory_write"));
      assert.ok(
        !JSON.stringify(requests[0]).includes("PRIVATE_EXPERIENCE_SHOULD_NOT_BE_PRELOADED"),
      );
      assert.ok(!requests[1].tools?.some((t) => t.function?.name?.startsWith("memory_")));
      assert.ok(!requests[1].messages.some((m) => textOf(m).includes("个人记忆功能已开启")));
      assert.ok(
        requests[1].messages.some((m) => m.role === "tool" && textOf(m).includes("disabled")),
      );
      assert.equal((await store.read()).memories.length, 2);
      await store.setEnabled(true);
      await session.prompt("继续讨论");
      assert.ok(requests[2].tools.some((t) => t.function?.name === "memory_write"));
      assert.ok(requests[2].messages.some((m) => textOf(m).includes("回答时先给结论")));
    } finally {
      session?.dispose();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previous;
      await rm(dir, { recursive: true, force: true });
    }
  },
);
