# Agent Personal Memory

[![Verify](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

One personal memory library for **[Pi](https://github.com/earendil-works/pi)** and **Claude Code**.

Keep useful background, experiences, goals, ideas and collaboration habits across conversations. Both assistants read and write the same local records, preserve original user quotes, and retrieve relevant memories when giving advice. You can use either host on its own, or switch between them without importing and synchronizing separate libraries.

[简体中文](README.zh-CN.md) · [User guide](docs/usage.md) · [Data & privacy](docs/privacy.md)

## Install

Requires **Node.js 22+** on macOS or Linux. Tested with Pi **1.2.0** and Claude Code **2.1.295**. Other host versions and Windows are not yet verified.

### Pi

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

Run `/reload` or restart Pi, then open `/memory`.

### Claude Code

In Claude Code:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart Claude Code, then open `/agent-personal-memory:memory`. The plugin includes its runtime; installing Pi or running npm is unnecessary. Each host uses its own configured model and credentials.

If you already use the original Pi Personal Memory package, see [upgrading an existing installation](docs/usage.md#upgrading-the-original-pi-package). Keep one copy per host; your existing records stay in place.

## A shared library

New installations use `~/.local/share/agent-personal-memory/`, with support for `XDG_DATA_HOME`. An existing Pi library in `~/.pi/agent/memory/` is reused by both hosts. No background copy or synchronization service is involved.

To choose a library explicitly, set the same absolute path in the environment of both hosts:

```sh
export PERSONAL_MEMORY_DIR="$HOME/.local/share/agent-personal-memory"
```

For an existing library, use its current path. Changing this variable selects a directory; it does not move records. [Directory selection and custom Pi profiles](docs/usage.md#shared-library-location) explains the precedence and migration behavior.

A record saved in either host becomes available to the other on its next read. Writes use a shared process lock, duplicate checks and version checks. Deletes and the Memory On/Off setting are shared as well.

## What gets remembered

| Category          | Useful personal context                                      |
| ----------------- | ------------------------------------------------------------ |
| Background        | Ongoing responsibilities, working conditions and constraints |
| Experiences       | Significant events, choices, feelings and their effects      |
| Goals & direction | Directions you are pursuing or seriously exploring           |
| Ideas & insights  | Principles, observations and ideas worth developing          |
| Preferences       | Lasting collaboration habits and important trade-offs        |

Capture rules require future personal value and faithful restatement. They exclude project progress, one-off formatting requests, assistant suggestions and unsupported personality judgments. Memory content and conversation titles retain their original language; controls are in English.

Ordinary conversations preload collaboration habits. Advice retrieves other categories according to the question. Routine capture is instructed to stay quiet and uses the same evidence and write policy in both hosts.

## Library, Extraction and Advice

Both hosts use the same three views and action order.

**Library** searches and manages saved memories. Open a record for **Edit → Original words → Delete → Back**. Edit offers **Content** and **Type**, showing the current value before a change. Other record metadata is preserved. Original words shows the supporting user quotes, dates and source host when available.

**Extraction** lists conversations from Pi and Claude Code. Each row shows its host, original title and scan state: **○ Not extracted**, **✓ Extracted**, or **↻ Updated**. Select one conversation or use **Select conversations** for a batch. Each starts an independent background agent with extraction and review stages. Progress, saved memories, logs, cancellation and retry are accessible from either host. Completed scans can produce zero new records.

**Advice** brings a question back into the main conversation and retrieves relevant memories with their evidence. Pi provides a `Question │ …` field; Claude Code also provides `/agent-personal-memory:advice <question>`.

Memory On/Off is available from the main menu. Off blocks automatic writes, stops new retrieval and cancels running extraction. Library remains available for explicit management.

### How the interfaces compare

|                        | Pi                         | Claude Code                                      |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| Open Memory            | `/memory`                  | `/agent-personal-memory:memory`                  |
| Navigation             | Full-screen terminal panel | Native selection questions guided by the command |
| Choose and go back     | Arrow keys, Enter, Esc     | Claude Code's native controls                    |
| Toggle                 | Tab                        | Memory On/Off menu entry                         |
| Status                 | Counts in the footer       | Same status text in the menu                     |
| Automatic tool display | Hidden by the extension    | Controlled by Claude Code                        |

Claude Code owns its screen, keybindings and tool rendering. The plugin preserves Pi's navigation and labels while using the host's native selection UI. It leaves your Claude Code status line intact. A noninteractive session uses textual choices instead of native questions.

## Quality and model usage

Every captured source quote must match an original user message. Historical extraction additionally reviews candidates in a separate fresh model context for future value, faithful meaning, conditions, uncertainty and duplicates. Corrections are evaluated against evidence dates. Both hosts use the same extraction and review policy.

Model judgments can still be wrong. Check important records through **Original words** and edit them when needed. Historical review adds model usage; large batches can encounter provider limits. Claude Code extraction runs separate tool-free `claude -p` processes with hooks disabled, using its existing authentication. Pi extraction uses its configured model in independent Pi sessions.

## Your data

Records and task artifacts are local plaintext. There is no plugin telemetry or hosted memory service. Necessary conversations and memories are sent to the model provider configured in the host performing the request.

Deletion removes the canonical record and suppresses automatic recovery from the same evidence. Original conversations, logs and backups can still contain the text. Uninstalling preserves your shared library. See [Data & privacy](docs/privacy.md) for retention and cleanup details, including Claude Code's context limitations.

## Develop

```sh
git clone https://github.com/bin-Deng-666/agent-personal-memory.git
cd agent-personal-memory
npm ci --ignore-scripts
npm run verify
```

Edit `src/` and run `npm run build:claude` to rebuild the committed, self-contained Claude runtime. Verification checks types, formatting, module boundaries, bundle freshness, shared-store behavior, both host adapters and packed installation. Tests use synthetic data and local fixtures. With Claude Code installed, `node scripts/check-claude-host.mjs` also verifies actual host discovery, hooks and MCP calls against a local model server.

[Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md) · [Report a bug](https://github.com/bin-Deng-666/agent-personal-memory/issues/new/choose) · [Security](SECURITY.md)

## License

[MIT](LICENSE).
