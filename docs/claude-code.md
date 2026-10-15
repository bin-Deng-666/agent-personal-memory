# Claude Code installation and use

This guide is for **Claude Code**. Pi has [separate installation instructions](pi.md).

Requires Node.js 22+ and Claude Code. Tested on Claude Code 2.1.295 with a local provider fixture and an installed plugin using the configured model. Pi is not required.

## Install

Run these **inside Claude Code**:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart Claude Code. To configure the short command, run:

```text
/agent-personal-memory:setup
```

Restart once more, then use:

```text
/personal-memory
```

Setup adds a user-level shortcut for this plugin's menu. It preserves an unrelated existing command with the same name. The namespaced `/agent-personal-memory:personal-memory` works without setup. Claude Code's built-in `/memory` is unchanged. After updating the plugin, rerun setup to refresh the shortcut.

The marketplace installs only `packages/claude-code/`: a standalone Node runtime, hooks, native-menu commands and third-party notices. It does not load Pi's adapter or SDK, and needs no npm install step. Claude Code's own trust/permission controls still apply.

## Local testing

A checkout can be loaded for one session:

```sh
claude --plugin-dir /absolute/path/to/agent-personal-memory/packages/claude-code
```

For a persistent local test installation, run in your terminal:

```sh
claude plugin marketplace add /absolute/path/to/agent-personal-memory --scope user
claude plugin install agent-personal-memory@agent-personal-memory --scope user
```

This registers a local marketplace. Updating it reads that local checkout; it does not fetch GitHub. Keep one marketplace registration with this name. Use the plugin manager to switch sources later.

## Menus and classification

`/personal-memory` displays **Personal Memory On · N total · N habits loaded** (`1 habit` for singular) and **Library**, **Extraction**, **Advice**, **Personal Memory On/Off**.

Library uses labels of the form **[Background] Title** so every row's category is visible. All five category names appear as applicable: Background, Experiences, Goals & direction, Ideas & insights, Preferences. Detail shows **Type: category**, certainty and content, then **Edit**, **Original words**, **Delete**, **Back**. Edit offers **Content** and **Type** with current values. There is no separate Applies to display; scope is retained internally.

Claude owns the terminal UI. Commands guide its native selection questions and previews through the same navigation as Pi. Model presentation can vary; print mode uses text choices. The plugin does not replace Claude's status line or claim Pi-specific Tab/Esc behavior. MCP tool activity may be visible.

## Capture and context are different

Automatic capture considers **all five categories**. Hooks preload **only collaboration habits** and supply evidence references and capture instructions. The model uses `memory_search` and `memory_write` to save other personal information. A loaded-habit count is not the number of categories that can be saved.

Current source IDs come from the actual Claude transcript, including a refresh through memory_search when UserPromptSubmit precedes the transcript append. Ordinary lookup exposes other categories only as deduplication metadata. Use `/agent-personal-memory:advice <question>` for relevant full records and evidence.

## Extraction and On/Off

`/agent-personal-memory:extract` opens the shared conversation/task list. It includes Pi and Claude histories and the same three scan states as Pi. Batch selection starts independent, tool-free Claude processes with separate extraction/review contexts and hooks disabled. Return to chat while they run; view results, logs, cancel or retry from either host. Your configured Claude authentication and model are used.

On/Off is shared per library. Off blocks automatic writes and retrieval and requests worker cancellation. Hooks announce the Off state on the next prompt, but Claude cannot retract earlier context. `/clear` or a fresh session gives a clean context when required.

## Update and uninstall

Inside Claude Code:

```text
/plugin update agent-personal-memory@agent-personal-memory
/plugin uninstall agent-personal-memory@agent-personal-memory
```

Restart afterwards. Uninstall preserves shared records. If you installed the `/personal-memory` shortcut, remove its generated `commands/personal-memory.md` from your Claude configuration directory when no longer needed. Do not remove a user-created replacement. See [privacy](privacy.md) for data retention.

## Verification

The repository has synthetic MCP, storage, hook and worker tests. `node scripts/check-claude-host.mjs` verifies a real Claude process against a local fixture provider. `node scripts/check-configured-claude.mjs /tmp/personal-memory-report.json` is an optional paid-model check: it uses the installed plugin and current model, puts synthetic statements in an isolated memory directory, and checks five-category capture. It can create test transcripts in the configured Claude history; it never writes those fixtures to your personal library.
