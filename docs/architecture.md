# Architecture

Agent Personal Memory has two host adapters and one shared data model, write policy and store. Pi loads TypeScript through `index.ts`; Claude Code loads a committed, self-contained Node.js runtime built from `src/claude/main.ts`. Personal data is outside the checkout.

```text
agent-personal-memory/
├── index.ts                       Pi entry
├── .claude-plugin/
│   ├── plugin.json                 Claude plugin manifest
│   └── marketplace.json            Installable GitHub marketplace
├── .mcp.json                       Claude stdio server definition
├── hooks/hooks.json               Session/turn injection and tool-session binding
├── commands/                      Native Claude Memory, Extraction and Advice flows
├── claude/runtime.mjs              Generated standalone runtime, committed for installation
├── src/
│   ├── extension.ts               Pi lifecycle, tool registration, context and footer
│   ├── application/
│   │   ├── capture.ts             Shared live capture/search authorization and evidence policy
│   │   ├── panel.ts               Pi navigation and Advice dispatch
│   │   ├── library.ts             Pi record management
│   │   └── extraction.ts          Pi single/batch task workflows
│   ├── claude/
│   │   ├── main.ts                Hooks, MCP schemas/transport and runtime entry
│   │   ├── sessions.ts            Host-supplied transcript/turn bindings
│   │   ├── service.ts             Shared-core orchestration and validated menu operations
│   │   └── extraction.ts          Claude process launcher and independent worker
│   ├── domain/                    Types, prompts, validation, keys and ranking
│   ├── history/
│   │   ├── sessions.ts            Pi branches, generic snapshot loading and evidence helpers
│   │   ├── claude.ts              Claude transcript branches and history discovery
│   │   ├── pi-files.ts            Pi history discovery without requiring Pi in Claude
│   │   ├── catalog.ts             Pi host catalog with both conversation sources
│   │   └── extraction.ts          Shared extraction, quote validation and separate review
│   ├── storage/
│   │   ├── location.ts            The common directory resolver
│   │   ├── store.ts               Locks, journal, records, versions and legacy migration
│   │   └── tasks.ts               Host-neutral task discovery, logs and cancellation
│   ├── agents/                    Pi launcher, host-SDK bootstrap and worker
│   ├── ui/                        Pi terminal components and footer
│   └── types/                     Dependency declarations
├── tests/                         Synthetic storage, cross-host, process, SDK and UI tests
├── scripts/                       Bundle, dependency-boundary and installation checks
└── docs/                          User guide, architecture and data handling
```

## Dependency boundaries

Domain modules depend on Domain. History depends on Domain/History; Storage on Domain/Storage. Pi Agents depend on Domain/History/Storage/Agents; UI on Domain/UI. Application coordinates the shared policy and Pi workflows. Claude imports only its own modules and the necessary Domain/History/Storage/Application modules. The bundle check rejects any Pi runtime dependency in the Claude artifact.

`check-structure` follows both production entries, static imports, the Pi runner URL and jiti imports. It rejects missing/unreachable modules and reverse-layer edges. Type declarations are checked by TypeScript. The extraction worker's self-launch uses the bundled entry's `import.meta.url`.

## Live capture

`CaptureSession` is used by both adapters. It tracks current-turn user messages, the user anchor, retrieved memory versions, Advice mode and automatic-write count. It validates exact quotes through the normalized history snapshot and enforces current-turn evidence, correction thresholds and explicit deletion requests. The store rechecks On/Off, duplicates and optimistic versions under its cross-process lock.

Pi resets capture state at session start and begins turns from public lifecycle events. Claude session/turn hooks register the host-supplied session ID and transcript path in the shared library's host-metadata directory. A pre-tool hook pins the plugin tools' `sessionId` to the current host event and refreshes source references. MCP requests resolve that binding rather than accepting a model-selected transcript path. Calls in a server process are serialized; each session has independent capture state.

Sources keep user-message identifiers distinct from generated memory-record IDs. Claude sessions are namespaced and source suppression keys include its host marker; old Pi records and suppression keys remain valid. Claude snapshots follow the active parent chain and exclude sidechains, synthetic summaries, command messages and tool-result content as user evidence. Pi snapshots retain branch/context-edit handling.

## Shared persistence

All hosts and new workers resolve one data directory. Existing Pi data is reused in place; custom directories are explicit. Ambiguous initialized libraries require `PERSONAL_MEMORY_DIR` instead of an automatic merge. Directory selection does not copy or migrate records.

Store transactions use a cross-process directory lock, durable write-ahead journal and atomic category/metadata replacement. Reads recover interrupted publication while holding the same lock. Version checks prevent stale overwrites; normalized content checks and suppression keys prevent exact duplicates and unintended re-extraction. Model-assisted comparison handles semantic duplicates, with the usual limits of model judgment.

Host-neutral task files expose progress/results from either adapter. Task launch locks prevent duplicate active workers for the same source across hosts. Both runtime types poll shared cancellation files and the shared enabled flag.

## Extraction runtimes

Both workers call the same `extractCandidates` pipeline. Each segment gets extraction in a fresh context; eligible candidates then get a separate fresh review. Exact user evidence, candidate limits, dates, update rules and complete review coverage are checked in code. Invalid output does not advance a checkpoint. Partial successful saves survive failure/cancellation; retry skips duplicates.

Pi starts its relative `runner.mjs`, which uses the parent Pi installation's jiti/SDK to load the worker. Its model configuration/authentication comes from that Pi agent directory. Every task explicitly records its shared memory directory, independently of its Pi configuration directory.

Claude launches the bundled runtime as a detached worker. Each model request starts tool-free `claude -p` with hooks disabled, no session persistence and an empty strict MCP configuration. It uses Claude's existing authentication/default model or a chosen model. It does not load Pi or copy Pi credentials. The worker can analyze histories from either host.

## User interfaces

Pi implements deterministic full-screen components with keyboard/mouse focus, scrolling and a custom footer. Claude command instructions guide its native question UI through the same page names, action order and current-value previews; the service enforces data-operation boundaries. Claude owns rendering, keybindings and tool visibility, so the plugin does not claim a full Pi TUI inside Claude or replace the user's status line.

Ordinary context contains collaboration habits. Advice retrieves relevant full records; ordinary searches return non-preference deduplication metadata. Pi rebuilds its section on every provider request. Claude refreshes additional context on session start/user prompts and cannot retract earlier context, as documented in [privacy](privacy.md).

## Distribution and verification

`npm run build:claude` creates the committed standalone artifact. MCP SDK, schema validation and bundled lock code are build dependencies; Pi installs only its small runtime dependency. Optional Pi peers are supplied by its host. Users installing the Claude marketplace do not run install scripts or npm.

`verify` checks formatting, types, module reachability, bundle freshness, synthetic tests and an actual packed runtime-only install. That install exercises Pi discovery, detached extraction/review and execution of the standalone Claude runtime without dev dependencies. Cross-host tests use real MCP transport and a fake Claude executable for background stages. The optional real-Claude host check runs plugin discovery, hooks and MCP continuation against a local Anthropic fixture server, with isolated configuration and no paid provider calls.
