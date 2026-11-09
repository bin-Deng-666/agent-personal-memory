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
    organization.ts         Whole-library review, cancellable analysis and apply preview
    extraction.ts           Single/batch workflows and task actions
  domain/
    memory.ts               Types, validation and duplicate/suppression keys
    evidence.ts             Conservative personal-value/fidelity checks
    prompts.ts              Capture, extraction, review and Advice rules
    search.ts               Ranking and collaboration-habit budget
    presentation.ts         Command name and shared status grammar
    task.ts                 Conversation/task/review types and labels
    extraction.ts           Stage schemas, structured results and review support
    organization.ts         Complete plans, evidence-preserving consolidation
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
    worker.ts               Source analysis, publication and checkpoint lifecycle
    extraction-session.ts   Fresh Pi stage sessions and bounded structured submission
    organization.ts         Full-library plan through the current Pi model registry
  ui/
    dashboard.ts            Home, Library, Extraction and Advice input
    picker.ts               Search, choices and batch selection
    editor.ts               Field preview and prefilled text editor
    organization.ts         Per-group selection, complete field/evidence previews
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

A single PERSONAL_VALUE_RULES definition drives live capture, historical extraction and organization. It separates project implementation facts from personal experiences, attempts, views, conditions and scoped principles. Validation/reuse principles can be inferred conservatively from user choices; repeated task instructions do not establish a universal habit.

Domain evidence guards catch obvious unsupported details and task-only candidates. Historical review must cover each candidate with a personal-value basis, a quote from its verified sources and a future use independent of the implementation task. Reviewer conversation input includes user messages only. Program checks enforce the protocol and evidence support; semantic fidelity remains model judgment. [Quality and evaluation](extraction-quality.md) covers the boundary and opt-in synthetic model evaluation.

History snapshots follow the active Pi parent chain and explicit context edits, including original messages before compaction. Synthetic Advice requests do not count as personal evidence. Invalid or partially appended transcripts are retried instead of checkpointed.

## Persistence and extraction

Library selection supports Pi's default/profile directory, explicit override and existing alternate data. Ambiguous initialized libraries require an explicit choice. Supported historical record fields and suppression namespaces remain stable so cleanup does not change stored evidence or resurrect deleted records.

Store transactions hold a cross-process lock, write a durable journal, publish category files/metadata atomically and recover interrupted publication before reading. Optimistic versions prevent stale overwrites. New tasks record the library directory separately from their Pi model/authentication directory.

TaskManager coordinates task files and a launch lock so the same active source is not started twice. The detached runner uses the parent's Pi SDK/jiti and ordinary runtime dependencies. A source is coordinated by history/extraction; extraction-session owns fresh Pi sessions with one stage-specific submit tool and bounded recovery. Domain schemas constrain original user IDs, candidate fields and complete review coverage. Free-text JSON parsing is not part of the pipeline. Workers poll enabled/cancel state and publish only accepted candidates, advancing the scan after completion. Partial writes survive cancellation/failure; retries check duplicates.

Library organization reads the complete library but asks the current Pi model for sparse edits only. Untouched records are restored by code. Duplicate statements and complementary fragments about one event, ongoing constraint or scoped preference may consolidate while preserving their individual details and conditions. Missing original words, increased certainty and obvious evidence failures reject proposed edits. A fresh request independently reviews suggestions; each kept group must cite every original record and state its retained meaning. Structured submission has at most one correction retry per stage, and input estimates include schemas/output headroom without truncating records.

The UI reuses searchable choices and detail previews to include/exclude each suggestion, inspect all fields and source words, then explicitly apply a final preview whose default action is Back. Store validates the complete selection under the same lock and journal, checking every snapshot ID/version. Merges retain the earliest record's ID (ID breaks date ties), preserve exact distinct provenance and suppress retired wording without blacklisting evidence. Untouched records keep their fields/versions; no-op plans skip publication. Concurrent library changes reject the whole stale plan. Semantic grouping/fidelity still need human review.

## Verification and distribution

`npm run verify` checks formatting, types, layer/reachability boundaries, behavior/UI/process/SDK tests and a real packed runtime-only install. The package smoke check discovers the shipped entry through Pi and executes its shipped runner/worker against a local model fixture, including the schema-validated submit tool. Host SDKs and `typebox` remain wildcard peers supplied by Pi; `proper-lockfile` is an ordinary runtime dependency.

Tests use synthetic evidence and temporary directories. CI covers Node 22/24 on Linux/macOS. Pi's public extension API is the production integration boundary; internal Pi TUI fixtures appear only in regression tests. Footer ownership and model-driven fidelity limits are documented in the [user guide](usage.md) and [privacy](privacy.md).
