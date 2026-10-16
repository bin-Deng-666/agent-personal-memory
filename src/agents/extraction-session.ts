import {
  createAgentSession,
  createExtensionRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type {
  ModelRuntime,
  ExtensionContext,
  AgentSession,
  ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import { EXTRACTION_RULES } from "../domain/prompts.ts";
import {
  extractionToolSchema,
  reviewResultSchema,
  validateExtractionResult,
  validateReviewResult,
} from "../domain/extraction.ts";
import type { ExtractionRequest } from "../domain/extraction.ts";
import { join } from "node:path";

const SUBMIT = "submit_memory_result";

/** One fresh Pi session per stage; only a schema-validated result tool is available. */
export async function extractionSession(options: {
  dir: string;
  agentDir: string;
  runtime: ModelRuntime;
  model: NonNullable<ExtensionContext["model"]>;
  payload: ExtractionRequest;
  cancelled: () => boolean;
  setSession: (session: AgentSession) => void;
  onEvent: Parameters<AgentSession["subscribe"]>[0];
}) {
  const { payload } = options;
  const count =
    payload.stage === "review" && Array.isArray(payload.candidates) ? payload.candidates.length : 0;
  const schema =
    payload.stage === "extract"
      ? extractionToolSchema(
          Array.isArray(payload.allowedUserIds) ? payload.allowedUserIds : [],
          Array.isArray(payload.conversation)
            ? payload.conversation
                .filter((message) => message.role === "user")
                .map((message) => message.id)
            : [],
        )
      : reviewResultSchema(count);
  const validate = (value: unknown) =>
    payload.stage === "extract"
      ? validateExtractionResult(value)
      : validateReviewResult(value, count);
  const loader: ResourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => EXTRACTION_RULES,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources() {},
    reload: async () => {},
  };
  let submitted: unknown;
  let duplicate = false;
  let turns = 0;
  let exhausted = false;
  const { session } = await createAgentSession({
    cwd: options.dir,
    agentDir: options.agentDir,
    modelRuntime: options.runtime,
    model: options.model,
    thinkingLevel: "off",
    resourceLoader: loader,
    tools: [SUBMIT],
    noTools: "all",
    customTools: [
      {
        name: SUBMIT,
        label: "Submit memory result",
        description:
          payload.stage === "extract"
            ? "Submit up to five evidence-backed personal memories; use an empty array when nothing qualifies."
            : `Review all ${count} candidates exactly once. A keep needs a personal-value basis, original quote and independent future use.`,
        parameters: schema,
        constrainedSampling: { type: "json_schema", strict: "prefer" },
        executionMode: "sequential",
        execute: async (_id, params) => {
          if (options.cancelled()) throw new Error("Extraction cancelled");
          const result = validate(params);
          if (submitted !== undefined) {
            duplicate = true;
            throw new Error("More than one result submitted");
          }
          submitted = result;
          return {
            content: [{ type: "text", text: "Structured result accepted." }],
            details: undefined,
            terminate: true,
          };
        },
      },
    ],
    sessionManager: SessionManager.create(options.dir, join(options.dir, "conversation")),
    settingsManager: SettingsManager.inMemory({
      retry: { enabled: true, maxRetries: 2 },
      cacheWarming: "off",
    }),
  });
  options.setSession(session);
  session.subscribe(options.onEvent);
  session.subscribe((event) => {
    if (event.type === "message_start" && event.message.role === "assistant") turns++;
    if (event.type === "turn_end" && turns >= 3 && submitted === undefined) {
      exhausted = true;
      void session.abort();
    }
  });
  try {
    if (options.cancelled()) throw new Error("Extraction cancelled");
    await session.prompt(JSON.stringify(payload));
    // A prose answer is not an empty result. Offer one explicit protocol reminder, never parse prose.
    if (submitted === undefined && !exhausted && !options.cancelled()) {
      const last = [...session.messages].reverse().find((message) => message.role === "assistant");
      if (last?.role === "assistant" && last.stopReason === "stop")
        await session.prompt(
          `Call ${SUBMIT} to submit the ${payload.stage} result. Text responses are not accepted.`,
        );
    }
    if (options.cancelled()) throw new Error("Extraction cancelled");
    if (exhausted)
      throw new Error("Model exceeded the structured submission limit; checkpoint preserved");
    if (duplicate) throw new Error("Model submitted multiple results; checkpoint preserved");
    const last = [...session.messages].reverse().find((message) => message.role === "assistant");
    if (last?.role !== "assistant" || !["stop", "toolUse"].includes(last.stopReason))
      throw new Error(
        last?.role === "assistant"
          ? last.errorMessage || `Model did not finish: ${last.stopReason}`
          : "No model response",
      );
    if (submitted === undefined)
      throw new Error("Model did not submit a structured result; checkpoint preserved");
    return submitted;
  } finally {
    session.dispose();
  }
}
