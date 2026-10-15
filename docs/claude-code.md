# Claude Code installation and use

This guide is for **Claude Code**. Pi has [separate instructions](pi.md).

Requires Node.js 22+ and an interactive Claude Code session. Tested with Claude Code 2.1.295. Pi, tmux and a special launcher are not required.

## Install

Inside Claude Code:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart Claude Code and run:

```text
/agent-personal-memory:setup
```

Setup installs the `/personal-memory` shortcut and configures the memory status line, preserving existing status output and unrelated settings. Restart Claude normally, then use:

```text
/personal-memory
```

The namespaced `/agent-personal-memory:personal-memory` also works. Claude's built-in `/memory` is unchanged. Upgrading from 0.2 removes this plugin's generated launcher, refreshes the command and drops the terminal-popup requirement; just start `claude` normally.

## Native selection interface

Personal Memory uses Claude Code's native **AskUserQuestion** chooser in the existing terminal. Arrow keys and Enter select options. The native **Type something** row accepts search text, replacement content or an Advice question; move to that row, type directly, then press Enter. Esc/Close returns to the conversation.

The home chooser shows shared status such as:

```text
Personal Memory On · 1 total · 1 habit loaded
```

It offers **Library**, **Extraction**, **Advice**, **Settings**. Settings contains On/Off, Back and Close. The status line remains visible during ordinary Claude use; existing status-command output is kept above the memory status. Singular/plural habits use the same function as Pi.

This is a supported native selection tool, not an extension of Claude's internal `/model` renderer. Opening and moving between screens require model/tool turns and can incur usage. It does not have `/model`'s zero-model-request behavior. No browser, terminal popup or second window is involved.

## Library

Record choices include their category: Background, Experiences, Goals & direction, Ideas & insights or Preferences. Pagination and Search keep all records reachable. Detail shows the saved content and **Edit**, **Original words**, **Delete**, **Back**.

Edit offers Content and Type with the current value shown. Enter replacement content through the native text row; it is saved verbatim. Type selection pages expose all five categories. Scope is preserved internally and does not appear as a separate Applies to field. Version checks reject changes to records updated by another host; refresh before deciding again. Delete applies the explicit native choice without a second confirmation queue.

## Extraction and Advice

Extraction lists Pi and Claude conversations and shared tasks. Browse a source or use **Select conversations** for native multi-select. A batch can start independent workers for multiple displayed sources; More exposes further sources. Progress, saved records, logs, cancellation and retry use the same task store as Pi.

Advice accepts a question through the native text row, closes the menu and enables relevant full-record retrieval in the original conversation. Ordinary conversations preload collaboration habits only; capture still considers all five categories.

Off blocks automatic writes/new retrieval and cancels running workers. Explicit Library management remains available. Claude cannot remove earlier injected context; use `/clear` or a new session when needed.

## How native choices are enforced

The command asks Claude to invoke AskUserQuestion. The submit hook supplies the first screen; PreToolUse replaces tool input with backend-generated questions/options and discards model-supplied answers. PostToolUse binds the host's actual answer to its pending tool call, performs the validated operation and supplies the next screen. A Stop hook gives one corrective instruction if the model tries to end with a text menu instead.

Record IDs, versions and navigation are handled in code. The model cannot substitute a different set of options or submit a mutation through a fabricated menu answer. Other uses of AskUserQuestion outside an active Personal Memory menu are unaffected. The model still initiates tool turns, so native-menu availability and permission handling remain host behavior. Noninteractive print mode cannot present a chooser; the command reports that limitation instead of pretending to display one.

## Update, local testing and uninstall

```text
/plugin update agent-personal-memory@agent-personal-memory
/plugin uninstall agent-personal-memory@agent-personal-memory
```

After updates, rerun setup and restart. Uninstall preserves records. Remove the generated shortcut and restore the previous `statusLine` from `personal-memory-statusline.json` if removing all integration. Preserve unrelated settings.

A local checkout can be registered from the terminal:

```sh
claude plugin marketplace add /absolute/path/to/agent-personal-memory --scope user
claude plugin install agent-personal-memory@agent-personal-memory --scope user
```

The marketplace installs only `packages/claude-code/`: a standalone runtime, hooks and commands with no Pi SDK, terminal-drawing dependency or npm install step.

`python3 scripts/check-native-menu.py` starts a real ordinary Claude process against a local model fixture, with no tmux environment. It exercises native choices, authoritative option replacement, category/detail display, free-text edit/save, On/Off and closing. Automated backend tests additionally cover pagination, stale versions, forged answer IDs, category changes and Advice scope. The optional configured-model capture check incurs usage but uses an isolated memory library. See [verification](verification.md) and [privacy](privacy.md).
