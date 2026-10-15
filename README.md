# Agent Personal Memory

[![Verify](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/agent-personal-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Personal context that stays useful after the current task is over.**

Agent Personal Memory supports **Pi** and **Claude Code** through separate installable packages. Both read and write the same local library. Keep meaningful background, experiences, goals, ideas and collaboration habits, with original user quotes and controls to inspect, edit or delete them.

[简体中文](README.zh-CN.md) · [Pi guide](docs/pi.md) · [Claude Code guide](docs/claude-code.md) · [Data & privacy](docs/privacy.md)

## Install for your host

Requires Node.js 22+ on macOS/Linux. Tested with Pi 1.2.0 and Claude Code 2.1.295. Other host versions and Windows are not yet verified.

### Pi — terminal command

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

Reload/restart Pi, then use `/personal-memory`. The Git package routes to `packages/pi/`; the independent Pi artifact contains no Claude hooks, commands or MCP server. [Pi installation, upgrade and controls →](docs/pi.md)

### Claude Code — commands inside Claude Code

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart, run `/agent-personal-memory:setup` once to install the `/personal-memory` shortcut, then restart. Without the shortcut, use `/agent-personal-memory:personal-memory`. Claude's built-in `/memory` is unchanged. The marketplace installs `packages/claude-code/`, which needs neither Pi nor npm. [Claude Code setup, update and controls →](docs/claude-code.md)

## What belongs in personal memory

| Category          | Valuable personal context                                                 |
| ----------------- | ------------------------------------------------------------------------- |
| Background        | Ongoing responsibilities, working conditions and constraints              |
| Experiences       | Important events, choices, self-described feelings and effects            |
| Goals & direction | Directions seriously pursued or explored, with conditions and uncertainty |
| Ideas & insights  | Principles and observations worth developing beyond one task              |
| Preferences       | Explicit, lasting collaboration habits and important trade-offs           |

A useful memory should still help in another conversation after the current task is finished. Project requirements, UI choices, installation instructions, temporary debugging observations and one-off response requests are excluded. Removing a project name does not turn its requirements into a personal preference. Asking for caution on one error does not establish a cautious personality.

Personal experiences can occur during a project: a user-described feeling or lasting work constraint can be valuable when faithfully supported. Capture preserves that personal meaning without inventing motives or broadly labeling the person. Zero saved memories is the correct result when no candidate meets these standards.

**Automatic capture considers all five categories. Ordinary conversations preload only collaboration habits. Advice retrieves other relevant records.** The loaded-habit count describes context, not the capture categories.

## One shared library

New installations use `~/.local/share/agent-personal-memory/` (`XDG_DATA_HOME` supported). An existing `~/.pi/agent/memory/` library is reused by both hosts. Set the same absolute `PERSONAL_MEMORY_DIR` in both launch environments to choose a directory explicitly; this selects a library, not a file migration.

Both adapters share record IDs, evidence rules, duplicate checks, process locks, versions, deletion suppression and the On/Off setting. A write becomes visible in the other host on its next read. No copying or synchronization service runs between them. [Directory selection and shared behavior →](docs/usage.md)

## Library, Extraction, Advice

- **Library:** search records with a visible category. Details offer **Edit**, **Original words**, **Delete**, **Back**. Edit has **Content** and **Type**, showing the saved value before changing it. Scope remains internal rather than appearing as an Applies to field.
- **Extraction:** select Pi or Claude conversations with **○ Not extracted**, **✓ Extracted**, **↻ Updated** states. Each selected conversation runs in an independent background agent with extraction and separate review. Progress, results, logs, cancellation and retry are shared across hosts.
- **Advice:** ask a question in the main conversation using relevant memories and their evidence. Keep dates, conditions and uncertainty; distinguish the user's statements from the assistant's interpretation.

Status uses `Personal Memory On · N total · N habits loaded`, with `1 habit` in the singular. Off blocks automatic writes/new retrieval and cancels running extraction; explicit Library management remains available.

Pi provides a full-screen panel, keyboard controls and footer. Claude uses native selection questions guided by its commands, with the same view/action names. Claude owns keyboard handling, tool visibility and the status line; the plugin leaves its built-in status line intact. Its model-driven presentation may vary. [Interface comparison →](docs/usage.md)

## Quality, cost and privacy

Exact-source validation and conservative checks reject obvious project-only requirements, unsupported service/domain details and unsupported personality claims. Historical extraction also reviews candidates in a separate fresh model context. These checks reduce errors, but cannot prove semantic accuracy. Important records should be checked through **Original words**.

Model requests use the host's configured provider and credentials. Review adds usage; batch extraction can hit provider limits. Records and artifacts are local plaintext, with no plugin telemetry or hosted memory service. Necessary conversation content and memories still go to the configured model provider.

Deletion removes the canonical record; original transcripts, task artifacts and backups may retain text. Uninstalling preserves the library. Claude cannot retract already injected context; Off disables tools and refreshes instructions, while `/clear` or a fresh session provides a clean context. [Data, retention and erasure →](docs/privacy.md)

## Project structure and development

```text
packages/
  core/          Shared model, capture policy, history, search and storage
  pi/            Pi adapter, terminal UI and independent package
  claude-code/   Claude hooks, MCP tools, commands and independent package
```

```sh
git clone https://github.com/bin-Deng-666/agent-personal-memory.git
cd agent-personal-memory
npm ci --ignore-scripts
npm run verify
```

Change source under `packages/*/src/`, then run `npm run build`. Committed host runtimes bundle the common core so end users need no build step. Verification covers types, formatting, host boundaries, bundle freshness, shared-store and UI tests, and separate packed installations. An optional real-Claude check uses a local fixture provider; a separate configured-model check validates five-category capture against an isolated library.

[Contributing](CONTRIBUTING.md) · [Architecture](docs/architecture.md) · [Report a bug](https://github.com/bin-Deng-666/agent-personal-memory/issues/new/choose) · [Security](SECURITY.md)

## License

[MIT](LICENSE).
