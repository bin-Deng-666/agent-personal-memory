# Architecture

The repository contains one host-independent core and two independently packaged adapters. Both hosts address the same persistent library; source/runtime distribution is separate from personal data.

```text
packages/
├── core/
│   └── src/
│       ├── capture.ts          Current-turn evidence, lookup/version and write policy
│       ├── domain/             Types, personal-value checks, prompts, ranking and status labels
│       ├── history/            Pi/Claude branches, source evidence, extraction/review
│       └── storage/            Directory resolution, records, journal, task discovery/cancellation
├── pi/
│   ├── package.json            agent-personal-memory-pi; Pi host peers only
│   ├── index.ts                Loads this package's generated runtime
│   ├── src/                    Pi lifecycle, workflows, TUI and background launcher
│   └── runtime/                Bundled extension/worker plus host-SDK runner
└── claude-code/
    ├── .claude-plugin/         Claude plugin manifest
    ├── .mcp.json               Bundled stdio server
    ├── hooks/                  Session/turn injection and host session binding
    ├── commands/               Personal Memory, Advice, Extraction, shortcut setup
    ├── src/                    Claude adapter, MCP service, sessions and worker
    └── runtime.mjs             Standalone bundled runtime
```

The repository root is a private development workspace. Its Pi manifest routes Git installs to `packages/pi/index.ts`; its marketplace manifest points Claude installs to `packages/claude-code`. Neither published host artifact contains the other adapter. Git-based Pi installation downloads a repository checkout but loads only the Pi route. Core is private source bundled into each runtime, avoiding an external core-package installation or version mismatch.

## Boundaries and builds

Core must not import either host runtime. Pi and Claude may import Core but must not import each other. `check-structure` traverses actual production entries and the Pi worker launcher chain, rejects missing/unreachable modules and host-crossing edges. Bundle checks additionally reject included foreign-host runtimes.

`npm run build:pi` produces the Pi extension/worker as bundled files consumed by Pi's TypeScript loader. Host-provided Pi packages and typebox remain external; bundled local persistence dependencies do not require an install step. The runner resolves the parent's exact Pi SDK/jiti to load the worker.

`npm run build:claude` bundles MCP/schema/persistence dependencies into a standalone Node.js runtime and generates third-party notices. Claude marketplace users do not run npm. Both generated runtimes are committed, and verification rejects stale artifacts.

## Capture and personal value

`CaptureSession` is used by both adapters. It tracks the current prompt, user-message IDs, retrieved record versions, Advice mode and per-turn automatic-write count. `makeSource` validates exact user evidence. Updates need retrieved current versions and a correction; deletions require a current explicit request. The store rechecks enabled state, normalized duplicates and versions while locked.

Capture and historical extraction also call the same conservative personal-evidence checks. Obvious project-only requirements, unsupported service/domain specifics and unsupported broad personality claims are rejected. Prompt instructions require usefulness beyond the current task, conditions and uncertainty. These checks supplement model judgment; they cannot prove semantic fidelity or recognize every nuanced task detail.

Historical extraction adds a separate model review for every eligible candidate. Bad or incomplete review output prevents checkpoint advancement. Existing partial saves remain on failure/cancellation, with duplicate suppression on retry.

## Sources and session isolation

Pi snapshots follow parent chains, context edits and original user/assistant messages. Claude snapshots follow the active parent chain and exclude sidechains, synthetic summaries, command messages and tool-result text as user evidence. Claude session IDs and source keys are namespaced; old Pi keys remain compatible.

Claude's hooks register host-supplied session/transcript paths and current-turn metadata. PreToolUse pins the plugin tool session ID to the current host event. The MCP model cannot choose a transcript path. Search returns current user source IDs because prompt hooks can precede transcript persistence. Each MCP session has separate capture state, and calls are serialized.

Management mode is entered through the plugin's commands or installed `/personal-memory` shortcut. Management operations validate versions and discovered extraction paths. Native menu presentation is model-driven; backend checks remain deterministic.

## Persistence and workers

The common resolver selects one directory with explicit override, custom Pi-profile compatibility, legacy reuse and a neutral new-install default. Ambiguous existing libraries require an explicit choice; no implicit merge/copy occurs.

Reads and writes share a cross-process lock. Multi-file changes use a durable journal and atomic replacement; recovery occurs before reads. Tasks are host-neutral files with shared progress, results, cancellation and launch locks. Workers poll enabled state and cancellation requests.

Pi workers retain the shared library path separately from their model/authentication directory. Claude workers launch tool-free `claude -p`, with hooks disabled, empty strict MCP configuration and no session persistence, using existing Claude authentication. A worker can analyze either host's selected history. Credentials are not copied between hosts.

## Presentation and context

Status labels and singular/plural habits are shared. Library displays each category and preserves scope internally without a separate Applies to field. Pi owns its full-screen UI and footer slot. Claude uses native questions, namespaced commands and an optional user shortcut; it leaves built-in `/memory` and status line alone.

Ordinary context includes only collaboration habits; all five categories can be captured. Advice retrieves relevant full records. Pi rebuilds its section on every request; Claude refreshes on session/turn hooks and cannot remove earlier injected context. [Privacy](privacy.md) documents that limitation.

## Verification

`verify` checks formatting, strict types, source boundaries, bundle freshness, synthetic behavioral/UI/MCP/process tests and separate packed installations. Packed Pi discovery and worker extraction/review run without development dependencies. Packed Claude runtime runs without Pi or npm dependencies.

`check-claude-host.mjs` uses a real Claude process with isolated configuration and a local model fixture. `check-configured-claude.mjs` optionally tests the installed plugin and configured provider against synthetic five-category statements in an isolated library; it can incur model usage. It does not turn those synthetic statements into user facts.
