import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
const { createJiti } = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))(
  "jiti",
);
const jiti = createJiti(import.meta.url);
const { planOrganization } = await jiti.import("../src/agents/organization.ts");
const { memoryFields } = await jiti.import("../src/domain/memory.ts");

test(
  "organization SDK: Pi runtime transports sparse edits and a separate coverage review through real structured streams",
  { timeout: 25000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "memory-organize-sdk-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const memories = [
      "During my career change last year, I needed stable income to support my family.",
      "During that career change last year, I could only study for half an hour each evening after caring for my family.",
    ].map((quote, index) => ({
      id: `memory-${index}`,
      version: 1,
      title: `Career change constraint ${index + 1}`,
      content: quote,
      type: "个人经历",
      scope: "Last year's career change",
      certainty: "明确",
      tags: [],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-01",
      sources: [
        {
          sessionId: "synthetic",
          entryId: `user-${index}`,
          fingerprint: `user-${index}`,
          quote,
          timestamp: "2023-01-01",
        },
      ],
    }));
    const change = {
      ids: memories.map((memory) => memory.id),
      ...memoryFields(memories[0]),
      title: "Family and study constraints during a career change",
      content:
        "During last year's career change, the user needed stable income to support their family and could only study for half an hour each evening after caring for family.",
      reason: "Complementary constraints from the same experience are more useful together.",
    };
    const requests = [];
    const errors = [];
    const server = createServer(async (request, response) => {
      try {
        let raw = "";
        for await (const part of request) raw += part;
        const body = JSON.parse(raw);
        requests.push(body);
        const user = body.messages.find((message) => message.role === "user");
        const text =
          typeof user.content === "string"
            ? user.content
            : user.content.map((block) => block.text || "").join("");
        const payload = JSON.parse(text);
        assert.equal(body.messages.filter((message) => message.role === "user").length, 1);
        assert.deepEqual(payload.records, memories);
        assert.equal(body.tools.length, 1);
        assert.equal(body.max_tokens ?? body.max_completion_tokens, 4096);
        const tool = body.tools[0].function;
        assert.equal(
          tool.name,
          payload.stage === "organize"
            ? "submit_memory_organization"
            : "submit_memory_organization_review",
        );
        assert.ok(tool.parameters.properties[payload.stage === "organize" ? "changes" : "reviews"]);
        const answer =
          payload.stage === "organize"
            ? { changes: [change] }
            : {
                reviews: [
                  {
                    index: 0,
                    verdict: "keep",
                    basis: "personal_context",
                    personalQuote: memories[0].sources[0].quote,
                    independentUse:
                      "Consider family income and study-time constraints in future career discussions.",
                    reason: "Both original constraints remain tied to last year's career change.",
                    coverage: memories.map((memory) => ({
                      id: memory.id,
                      quote: memory.sources[0].quote,
                      retainedMeaning: memory.content,
                    })),
                  },
                ],
              };
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.write(
          `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "submit", type: "function", function: { name: tool.name, arguments: JSON.stringify(answer) } }] }, finish_reason: null }] })}\n\n`,
        );
        response.write(
          `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
        );
        response.end("data: [DONE]\n\n");
      } catch (error) {
        errors.push(String(error));
        response.writeHead(500);
        response.end("Invalid synthetic request");
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    });
    await writeFile(
      join(dir, "models.json"),
      JSON.stringify({
        providers: {
          fixture: {
            api: "openai-completions",
            apiKey: "synthetic-only",
            baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
            models: [{ id: "organizer", contextWindow: 64000, maxTokens: 4096, reasoning: false }],
          },
        },
      }),
    );
    const modelRegistry = await ModelRuntime.create({
      authPath: join(dir, "auth.json"),
      modelsPath: join(dir, "models.json"),
      refreshOnCreate: false,
    });
    const result = await planOrganization(
      { modelRegistry, model: modelRegistry.getModel("fixture", "organizer") },
      memories,
      new AbortController().signal,
    );
    assert.deepEqual(errors, []);
    assert.equal(requests.length, 2);
    assert.deepEqual(result.groups, [change]);
    assert.deepEqual(result.filtered, []);
  },
);
