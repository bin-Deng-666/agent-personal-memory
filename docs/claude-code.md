# Claude Code installation and use

This guide is for **Claude Code**. Pi has [separate instructions](pi.md).

Requires Node.js 22+ and Claude Code. The same-window configuration panel also needs **tmux 3.2+**. Pi is not required; the terminal drawing library is bundled with this plugin.

## Install and configure

Inside Claude Code:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
```

Restart Claude Code and run:

```text
/agent-personal-memory:setup
```

Setup installs the `/personal-memory` shortcut, configures the shared memory status line, and creates `bin/personal-memory-claude` under your Claude configuration directory. Existing unrelated shortcuts are preserved. An existing status-line command is backed up and its output is retained above the memory status. Model, provider and permission settings are unchanged.

Install tmux with your operating system's package manager if needed (macOS: `brew install tmux`). Exit Claude Code and start it in the **same terminal window** using:

```sh
~/.claude/bin/personal-memory-claude
```

For a custom `CLAUDE_CONFIG_DIR`, use the launcher path returned by setup. The launcher starts an isolated tmux session and runs Claude with your usual configuration; it forwards command-line arguments. It neither opens another terminal window nor replaces your `claude` executable.

Now run:

```text
/personal-memory
```

The plugin opens a real terminal panel over the current Claude screen **from the prompt-submit hook, before any model request**. Closing it restores the same conversation and cancels the command without an agent response. Only submitting an Advice question proceeds to the model. The namespaced `/agent-personal-memory:personal-memory` is also available; Claude's built-in `/memory` is unchanged.

A Claude session started normally still gets the memory status line, but cannot host this popup unless it is already running inside tmux. In that case the command explains how to restart with the launcher instead of pretending to open a menu. Setup itself does not move an already-running Claude process into tmux.

## Status and panel controls

The Claude status line displays:

```text
Personal Memory On · 1 total · 1 habit loaded
```

Zero and multiple habits use `habits`. The setting and counts come from the same library used by Pi. Refresh timing follows Claude Code's status-line updates.

The panel shares its actual components with Pi. Opening, editing, toggling and closing use zero model requests; submitting Advice then starts the agent:

- **Library:** search, visible Type/category, current-value preview, **Edit**, **Original words**, **Delete**, **Back**. Edit offers Content and Type. Scope remains internal.
- **Extraction:** Pi/Claude conversations, three scan states, batch selection, task progress, results, logs, cancellation and retry. Workers continue when the panel closes.
- **Advice:** enter a question, press Enter, and the panel closes. The question is returned to the active tool call; Claude retrieves relevant full memories and answers in the original conversation.

Use arrow keys and Enter, Esc to go back, Tab to toggle Personal Memory On/Off, and PgUp/PgDn to scroll. Text fields use the same editor and focus handling as Pi. The terminal popup covers most of the current window; no separate window or browser is opened. MCP tool activity remains controlled by Claude.

## Capture and context

Automatic capture considers all five personal categories. Ordinary context preloads collaboration habits only; the habit count is not a capture-category restriction. Hooks provide capture rules and trusted source references. `memory_search` refreshes current user IDs if a prompt hook preceded transcript append. Advice retrieves other relevant full records.

Off blocks automatic writes/new retrieval and requests worker cancellation across both hosts. Claude cannot remove earlier injected context; use `/clear` or a new session when a clean context is required.

## Local installation

The marketplace installs only `packages/claude-code/`. Its standalone runtime includes the common Core and Terminal components, without the Pi agent SDK. No npm installation is needed by end users.

For a checkout:

```sh
claude plugin marketplace add /absolute/path/to/agent-personal-memory --scope user
claude plugin install agent-personal-memory@agent-personal-memory --scope user
```

This registers a local source. Updates read that folder rather than fetching GitHub. After changes, update the plugin and rerun setup to refresh the shortcut, status command and launcher paths. To test the panel directly in an interactive terminal, run `node packages/claude-code/runtime.mjs panel`.

## Update and remove

Inside Claude Code:

```text
/plugin update agent-personal-memory@agent-personal-memory
/plugin uninstall agent-personal-memory@agent-personal-memory
```

After updates, rerun setup and restart. Uninstall preserves the shared library. To remove integration completely, remove the generated command/launcher and restore the previous `statusLine` from `personal-memory-statusline.json` in your Claude configuration directory. Preserve unrelated settings. See [privacy](privacy.md).

## Verification

`npm run verify` covers shared components, persistence, host adapters, status-line composition and separate package installs. `python3 scripts/check-terminal.py` uses a real tmux popup and pseudo-terminal to navigate Library, edit/save a fixture, toggle On/Off, submit Advice and check restoration of the same parent pane. `python3 scripts/check-terminal.py --claude --interactive --close` types the actual short command into Claude's input and checks that opening, editing, toggling and closing cause zero model requests. Without `--close`, the same real-Claude interactive test checks that exactly one request is made only after submitting Advice. Both use a local fixture provider and an isolated library.

`node scripts/check-claude-host.mjs` checks actual host discovery/hooks/MCP against a local model fixture. The optional configured-model check incurs usage and validates five-category capture in a temporary library. None of these checks guarantees the accuracy of every model-generated memory.
