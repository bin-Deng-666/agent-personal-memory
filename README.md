# Agent Personal Memory

[![Verify](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Personal context for Pi that stays useful after the current task is over.**

Agent Personal Memory is a [Pi](https://github.com/earendil-works/pi) extension for meaningful background, experiences, goals, ideas and collaboration habits. Capture runs quietly, records retain original user quotes, and `/personal-memory` gives you a full-screen interface to inspect, edit and delete them.

[简体中文](README.zh-CN.md) · [User guide](docs/usage.md) · [Data & privacy](docs/privacy.md) · [Architecture](docs/architecture.md)

## Install

Requires **Node.js 22+**. Tested with **Pi 1.2.0** on macOS and Linux; other Pi versions and Windows are not yet verified.

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

Reload or restart Pi, then open:

```text
/personal-memory
```

The extension uses your configured Pi model and credentials. Pi installs its small runtime dependency automatically. There is no separate account, memory service or build step.

Keep one installed copy. Existing memory records live outside the extension source and remain in place during updates. Local directories can also be installed with `pi install /absolute/path/to/agent-personal-memory`.

## What belongs in personal memory

| Category          | Useful personal context                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| Background        | Ongoing responsibilities, working conditions and constraints              |
| Experiences       | Important events, choices, self-described feelings and effects            |
| Goals & direction | Directions seriously pursued or explored, with conditions and uncertainty |
| Ideas & insights  | Principles and observations worth developing beyond one task              |
| Preferences       | Explicit, lasting collaboration habits and important trade-offs           |

A candidate should still help in another conversation after the current task ends. Project requirements, implementation choices, installation steps, debugging status and one-off response requests do not meet that standard. Removing a project name does not turn its requirements into a personal preference; a request for caution on one error does not establish a cautious personality.

Personally meaningful experiences can occur in project discussions. Capture preserves the user's actual choices, feelings and ongoing circumstances, with dates and conditions, rather than inventing motives or labeling their character. When nothing qualifies, zero saved memories is the correct result.

**Capture considers all five categories. Ordinary conversations preload collaboration habits only. Advice retrieves other relevant records according to the question.**

## Use `/personal-memory`

The panel opens directly in Pi without a model request. Arrow keys select, Enter opens, Esc goes back and **Tab** toggles Personal Memory On/Off.

### Library

Search saved records and see their category on each row. Wide terminals show a selected-record preview. Details offer **Edit**, **Original words**, **Delete**, **Back**.

Edit contains **Content** and **Type**, with current-value previews. The text editor starts with the saved content and the category picker starts on the existing category. Scope and certainty remain part of the record; scope is not shown as a separate Applies to field. Original words shows exact user quotes and message dates.

### Extraction

Browse Pi conversations with three scan states: **○ Not extracted**, **✓ Extracted**, **↻ Updated**. Select one or use **Select conversations** for a batch. Each conversation gets an independent background process with extraction and separate review stages.

Return to chatting while workers run. Open a conversation for progress, saved memories, logs, cancellation or retry. A completed scan can save zero records when no new content meets the personal-value and evidence checks.

### Advice

Enter a question in **`Question │ …`**. The panel closes and Pi continues in the main conversation, retrieving relevant memories and their original evidence. Instructions preserve dates, scope and uncertainty and distinguish user statements from the assistant's analysis.

The footer shows status such as `Personal Memory On · 1 total · 1 habit loaded`; multiple habits use `habits`. Off blocks automatic writes and new retrieval, removes memory context/tools on the next provider request and cancels extraction. Library remains available for explicit management.

## Quality and model usage

Live and historical capture submit model output through a stage-specific Pi custom tool with a TypeBox schema. The schema validates the result shape before the worker receives it; the model has no write access to the canonical library. The worker then checks exact original-user evidence, authorized message IDs, personal value, duplicates and current versions before any write. Live capture requires exact current-run user evidence and limits automatic writes to three per turn. Historical extraction additionally reviews candidates in a separate fresh model context.

These checks reduce errors; they cannot prove every summary is correct. Use **Original words** to check important records. Historical review adds model usage, and large batches can encounter provider limits. Quiet tool display does not remove model latency or guarantee that every model will avoid mentioning a save.

## Your data

The default library is **`~/.pi/agent/memory/`**. A custom Pi agent directory changes that location; `PERSONAL_MEMORY_DIR` explicitly selects another absolute path. Existing supported libraries are reused without copying or merging records.

Files are local plaintext, with process locks, version checks and journaled recovery. The extension has no telemetry or hosted backend. Necessary conversations and memories are still sent to your configured model provider.

Deleting a record removes it from the canonical library and suppresses automatic recovery from the same evidence. Original sessions, task artifacts and backups can retain text. Uninstalling preserves personal records. See [Data & privacy](docs/privacy.md).

## Update and remove

```sh
pi update git:github.com/bin-Deng-666/agent-personal-memory
pi remove git:github.com/bin-Deng-666/agent-personal-memory
```

Reload or restart Pi afterwards. Pi has one custom-footer slot; another extension that replaces it may affect the memory display.

## Develop

```sh
git clone https://github.com/bin-Deng-666/agent-personal-memory.git
cd agent-personal-memory
npm ci --ignore-scripts
npm run verify
```

Pi loads the TypeScript entry directly. `verify` checks formatting, strict types, source reachability and layer boundaries, behavior/UI tests, and installation of the packed extension with runtime dependencies only. Tests use synthetic records, temporary directories and a local model fixture.

[Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md) · [Report a bug](https://github.com/bin-Deng-666/agent-personal-memory/issues/new/choose) · [Security](SECURITY.md)

## License

[MIT](LICENSE).
