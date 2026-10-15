# Architecture

`index.ts` loads `src/extension.ts` as a Pi extension. Source is TypeScript and requires no compilation or bundled runtime. Personal records and worker artifacts are outside the checkout.

```text
index.ts
src/
  extension.ts              Pi tools, lifecycle, context and footer integration
  application/
    capture.ts              Live search/write policy and current-run evidence
    panel.ts                Navigation and Advice dispatch
    library.ts              Record detail, edit, sources and deletion
    extraction.ts           Single/batch workflows and task actions
  domain/
    memory.ts               Types, validation and duplicate/suppression keys
    evidence.ts             Conservative personal-value/fidelity checks
    prompts.ts              Capture, extraction, review and Advice rules
    search.ts               Ranking and collaboration-habit budget
    presentation.ts         Command name and shared status grammar
    task.ts                 Conversation/task/review types and labels
  history/
    sessions.ts             Pi branches, context edits, chunks and exact evidence
    catalog.ts              Pi conversation discovery and scan states
    extraction.ts           Candidate validation and complete separate review
  storage/
    store.ts                Locked category records, versions and journal recovery
    location.ts             Library selection without implicit copying/merging
  agents/
    tasks.ts                Task IO, launch locking, detached start and cancellation
    runner.mjs              Bootstrap through the parent's exact Pi SDK/jiti
    worker.ts               Fresh extract/review sessions and checkpointing
  ui/
    dashboard.ts            Home, Library, Extraction and Advice input
    picker.ts               Search, choices and batch selection
    editor.ts               Field preview and prefilled text editor
    preview.ts              Record/source display and detail actions
    task-viewer.ts          Progress, results and optional logs
    footer.ts               Pi footer and extension-status composition
    screen.ts               Width, focus and viewport helpers
  types/                    Dependency declarations
```

## Dependency direction

Domain depends on Domain. History depends on Domain/History; Storage on Domain/Storage. Agents depend on Domain/History/Storage/Agents. UI depends on Domain/UI. Application coordinates workflows across these layers, and the extension entry composes them.

`check-structure` follows imports, the relative runner URL and jiti worker import. It rejects missing sources, modules with no production consumer and reverse-layer dependencies. TypeScript checks strict types and unused locals/parameters. Tests reference concrete components for rendering/focus regression coverage.

## Live capture and context

CaptureSession owns current-turn message IDs, the user anchor, retrieved record versions, Advice mode and the automatic-write limit. Sources must match original user messages exactly. Updates need retrieved current versions and a correction; deletion needs a current explicit user request. The store independently rechecks enabled state, versions and duplicate content while locked.

Ordinary provider context contains only eligible collaboration habits. Advice searches relevant full records. The extension rebuilds its memory section and tool declarations on each provider request while preserving unrelated sections/tools. Pi tool renderers suppress automatic rows. Stored record IDs and source-message IDs serve different internal purposes.

## Personal value

The same evidence checks are used by capture and historical extraction. They conservatively reject obvious project requirements, unsupported domains, temporary observations generalized into personal background and unsupported personality claims. Prompts require usefulness beyond the current task, conditions and uncertainty. These checks supplement model judgment rather than prove semantic fidelity.

History snapshots follow the active Pi parent chain and explicit context edits, including original messages before compaction. Synthetic Advice requests do not count as personal evidence. Invalid or partially appended transcripts are retried instead of checkpointed.

## Persistence and extraction

Library selection supports Pi's default/profile directory, explicit override and existing alternate data. Ambiguous initialized libraries require an explicit choice. Supported historical record fields and suppression namespaces remain stable so cleanup does not change stored evidence or resurrect deleted records.

Store transactions hold a cross-process lock, write a durable journal, publish category files/metadata atomically and recover interrupted publication before reading. Optimistic versions prevent stale overwrites. New tasks record the library directory separately from their Pi model/authentication directory.

TaskManager coordinates task files and a launch lock so the same active source is not started twice. The detached runner uses the parent's Pi SDK/jiti without installing a second SDK. Every extraction/review request gets a fresh model context with tools/extensions disabled. Workers poll enabled/cancel state, save approved records and advance the scan only after completion. Partial saves survive failure/cancellation; retry skips duplicates.

## Verification and distribution

`npm run verify` checks formatting, types, layer/reachability boundaries, behavior/UI/process/SDK tests and a real packed runtime-only install. The package smoke check discovers the shipped entry through Pi and executes its shipped runner/worker against a local model fixture. Host SDKs remain wildcard peers supplied by Pi; the only ordinary runtime dependency is `proper-lockfile`.

Tests use synthetic evidence and temporary directories. CI covers Node 22/24 on Linux/macOS. Pi's public extension API is the production integration boundary; internal Pi TUI fixtures appear only in regression tests. Footer ownership and model-driven fidelity limits are documented in the [user guide](usage.md) and [privacy](privacy.md).
