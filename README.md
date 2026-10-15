# Pi Personal Memory

[![Verify](https://github.com/bin-Deng-666/pi-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/pi-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Useful personal context, carried across your [Pi](https://github.com/earendil-works/pi) conversations.

Pi Personal Memory captures meaningful things you share, preserves the original words behind each record, and helps Pi give advice that fits your circumstances. Routine capture stays quiet. You manage your memories through `/memory`.

[简体中文](README.zh-CN.md) · [User guide](docs/usage.md) · [Data & privacy](docs/privacy.md)

## Install

Use **Node.js 22+** with **`@earendil-works/pi-coding-agent` 1.2.0**. Tested on macOS and Linux; other Pi versions and Windows are not yet verified.

```sh
pi install git:github.com/bin-Deng-666/pi-personal-memory
```

Run `/reload` in an existing session, then open:

```text
/memory
```

The plugin uses your configured Pi model and credentials. Dependencies are installed automatically. Keep one installed copy; if you have an older manually copied extension, see the [migration note](docs/usage.md#installation-and-updates).

## What Pi remembers

Memories retain enough context to be useful in a later conversation: what happened, what mattered to you, when a view applied, and which conditions shaped a choice.

| Category          | Useful examples                                              |
| ----------------- | ------------------------------------------------------------ |
| Background        | Ongoing responsibilities, working conditions and constraints |
| Experiences       | Significant events, your choices, feelings and their effects |
| Goals & direction | Directions you are pursuing or seriously exploring           |
| Ideas & insights  | Principles, observations and ideas worth developing          |
| Preferences       | Lasting collaboration habits and important trade-offs        |

Capture instructions prioritize personal value and faithful restatement. Project progress, one-off formatting requests and unsupported personality judgments are excluded by those instructions. Records and conversation titles retain their original language; interface controls are in English.

Ordinary conversations load collaboration habits. Advice retrieves other memories according to the question. The footer shows the total record count and the collaboration habits selected for context, restored when Pi starts.

## Use your memories

### Library

Search, read, edit and delete existing memories. Type to search, use ↑↓ to select a result, and press Enter to open it. The active input or row is highlighted.

A memory opens with four actions: **Edit**, **Original words**, **Delete** and **Back**. Edit offers **Content** and **Type**, with the current value beside the selection. The text editor starts with the saved content; the category picker starts on the saved category. Original words shows the supporting user quotes and message dates.

### Extraction

Bring useful context from past conversations into your library. The list shows a conversation count and one row per conversation:

| Status                        | Meaning                                   |
| ----------------------------- | ----------------------------------------- |
| ○ Not extracted · blue/accent | No completed scan                         |
| ✓ Extracted · green           | Messages match the completed scan         |
| ↻ Updated · yellow            | Messages changed after the completed scan |

Select a conversation and press Enter to start extraction or open its results. Use **Select conversations** or Ctrl+R for a batch. Space marks rows with an empty search; Ctrl+Space marks while searching; Enter starts the selection.

Each conversation has an independent background agent. You can return to chatting and check progress later. Open a conversation to inspect saved memories, view its log, cancel or retry. A completed scan can produce zero new memories when nothing meets the value and evidence checks.

### Advice

Enter a question in **`Question │ …`** and press Enter. The answer continues in your main conversation, using relevant memories and their sources. Advice instructions preserve the distinction between your statements and the assistant's interpretation, and treat past or tentative goals accordingly.

Across the panel, **Tab** toggles Memory On/Off and **Esc** goes back. Detail actions use ←→ and Enter; PgUp/PgDn scroll text. Turning Memory Off blocks automatic writes, cancels extraction and removes memory context from the next provider request.

## Memory quality

Historical extraction checks exact user quotes and asks the model to review each candidate for future value, faithful meaning, conditions, uncertainty and duplicates. Extraction and review use separate fresh contexts. A record can cite several messages, and historical corrections are evaluated against the dates of the original evidence.

Model judgment can still be wrong. **Original words** lets you check the evidence and correct important records. Live capture validates evidence within the main conversation; the additional review request applies to historical extraction. That review increases model usage, and large batches can encounter provider rate limits.

## Your data

Records are stored as plaintext in **`~/.pi/agent/memory/`**, or under the agent directory selected by `PI_CODING_AGENT_DIR`. The plugin has no telemetry or hosted memory service. Extraction, review and Advice send necessary conversation content and memories to your configured model provider.

Deleting a memory removes its canonical record and suppresses automatic recovery from the same evidence. Original Pi sessions, task artifacts and backups can still contain the text. See [Data & privacy](docs/privacy.md) for storage, retention and erasure details.

## Update or uninstall

```sh
pi update git:github.com/bin-Deng-666/pi-personal-memory
pi remove git:github.com/bin-Deng-666/pi-personal-memory
```

Reload or restart Pi after changing the installation. Uninstalling preserves personal records. The plugin uses Pi's custom-footer slot; another extension that replaces the footer may affect its display.

## Contribute

```sh
git clone https://github.com/bin-Deng-666/pi-personal-memory.git
cd pi-personal-memory
npm ci --ignore-scripts
npm run verify
```

Verification covers formatting, types, module boundaries, behavior tests and installation of the packed plugin with runtime dependencies only. Tests use synthetic records and a local model server. CI runs on Node 22/24 and Linux/macOS.

[Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md) · [Report a bug](https://github.com/bin-Deng-666/pi-personal-memory/issues/new/choose) · [Security](SECURITY.md)

## License

[MIT](LICENSE).
