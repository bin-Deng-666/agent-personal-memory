# Pi installation and use

This guide is for **Pi**. For Claude Code, use [its separate guide](claude-code.md).

Requires Node.js 22+; tested with `@earendil-works/pi-coding-agent` 1.2.0 on macOS/Linux.

## Install

Run in your terminal:

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

Reload or restart Pi and open:

```text
/personal-memory
```

The root Pi manifest routes to `packages/pi/`. Only that adapter is loaded. Its published package is `agent-personal-memory-pi`, containing the bundled shared core and Pi runtime; it has no Claude hooks, commands or MCP server. A Git source downloads the repository, but discovery loads only the Pi package. npm publication is not currently required or advertised.

For a local checkout with committed runtimes:

```sh
pi install /absolute/path/to/agent-personal-memory/packages/pi
```

## Upgrade an old installation

If Pi lists the original source, remove that registration before adding the new one:

```sh
pi remove git:github.com/bin-Deng-666/pi-personal-memory
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

Move a manually copied old `extensions/memory/` code directory outside extension discovery before installing. Keep the separate `~/.pi/agent/memory/` data directory; both hosts reuse it. Keep only one installed Pi copy. The plugin's command is now `/personal-memory`, and its status reads `Personal Memory On · N total · N habits loaded` (`1 habit` when singular).

## Controls

The full-screen panel contains **Library**, **Extraction**, **Advice**. Use ↑↓ and Enter to choose, Esc to go back, and Tab to toggle Personal Memory On/Off. Search and the active row have visible focus.

Library shows **Type: category** on each result and in the selected preview/detail. The five categories are Background, Experiences, Goals & direction, Ideas & insights, Preferences. Detail actions are **Edit**, **Original words**, **Delete**, **Back**. Edit contains **Content** and **Type**, with current values and a blank row between choices. Scope remains internal; no separate Applies to field is displayed.

Extraction lists both Pi and Claude conversations. Its state labels are ○ Not extracted (accent/blue), ✓ Extracted (green) and ↻ Updated (yellow). Ctrl+R opens batch selection; Space marks rows with empty search, Ctrl+Space marks while searching. Background tasks continue when you return to chat. Progress, results, logs, cancellation and retry work across hosts.

Advice uses **Question │ …** and returns the answer to your main conversation. Ordinary conversations preload only collaboration habits; all five personal categories are eligible for capture, and Advice retrieves other relevant records.

The custom footer shows shared counts on the directory line. Another extension owning Pi's footer slot can replace it. The plugin mirrors public usage/model fields; advanced host-only indicators can differ.

## Update and remove

```sh
pi update git:github.com/bin-Deng-666/agent-personal-memory
pi remove git:github.com/bin-Deng-666/agent-personal-memory
```

Reload/restart afterwards. Removal preserves the shared library and any Claude Code installation. See [shared usage](usage.md) and [privacy](privacy.md).
