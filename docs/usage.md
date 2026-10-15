# User guide

Agent Personal Memory has one local library and two host adapters. Record contents, evidence, scan checkpoints, task results and the On/Off setting are shared. Each host performs model requests using its own configuration.

## Installation and updates

Pi:

```sh
pi install git:github.com/bin-Deng-666/agent-personal-memory
pi update git:github.com/bin-Deng-666/agent-personal-memory
pi remove git:github.com/bin-Deng-666/agent-personal-memory
```

Reload or restart Pi after installation changes. Open `/memory`. For a single invocation, use `pi -e git:github.com/bin-Deng-666/agent-personal-memory`.

Claude Code:

```text
/plugin marketplace add bin-Deng-666/agent-personal-memory
/plugin install agent-personal-memory@agent-personal-memory
/plugin update agent-personal-memory@agent-personal-memory
/plugin uninstall agent-personal-memory@agent-personal-memory
```

Restart Claude Code after installation changes. Open `/agent-personal-memory:memory`. The committed Claude runtime includes its dependencies and runs with Node.js; Pi and npm are unnecessary for Claude-only users. To test a checkout for one session, use `claude --plugin-dir /absolute/path/to/agent-personal-memory`.

Removal from either host preserves the shared library and the other host's installation.

## Upgrading the original Pi package

The project was originally named `pi-personal-memory`. GitHub redirects old repository URLs, but Pi can still treat old and new source strings as different installations. Remove the old package registration before adding the new one:

```sh
pi remove git:github.com/bin-Deng-666/pi-personal-memory
pi install git:github.com/bin-Deng-666/agent-personal-memory
```

If the old code was manually copied into the agent's `extensions/memory/` directory, move that code directory outside extension discovery instead. Keep the separate `~/.pi/agent/memory/` data directory in place. Both hosts detect and reuse it. No conversion, copying or record-ID changes are needed. Keep one installed copy per host.

## Shared library location

Both hosts and all newly launched workers use this precedence:

1. `PERSONAL_MEMORY_DIR`, an absolute path selected explicitly.
2. `PI_CODING_AGENT_DIR/memory` when a custom Pi agent directory is explicitly present in the process environment.
3. An initialized legacy `~/.pi/agent/memory/` library.
4. `$XDG_DATA_HOME/agent-personal-memory/`, or `~/.local/share/agent-personal-memory/` by default.

For custom Pi profiles, GUI launches or different shell environments, set `PERSONAL_MEMORY_DIR` to the same existing library in both hosts. The variable selects a location and does not migrate files. If initialized legacy and neutral libraries both exist, the resolver asks for an explicit directory through an error and modifies neither. Back up and merge deliberately rather than silently choosing between two libraries.

Pi refreshes counts periodically and context on each provider request. Claude Code refreshes habits on session start and each user prompt; tool reads always consult the shared store. Updates use the current record version, so a stale editor cannot overwrite another host's changes.

## Navigation

| Operation | Pi                          | Claude Code                     |
| --------- | --------------------------- | ------------------------------- |
| Open      | `/memory`                   | `/agent-personal-memory:memory` |
| Home      | Library, Extraction, Advice | Same choices                    |
| Select    | Arrow keys and Enter        | Native selection question       |
| Back      | Esc                         | Back choice / native navigation |
| Toggle    | Tab                         | Memory On/Off choice            |
| Status    | Footer                      | Same label in the menu          |

Pi implements deterministic full-screen components. Claude commands guide the assistant through native `AskUserQuestion` menus with previews when supported. The backend validates record versions, evidence, session mode, shared settings and extraction paths. Model-driven menu presentation can vary; it does not reproduce Pi's keybindings or replace the Claude status line. In print mode, the same choices are presented as text.

## Library

Library searches and manages existing records. New records come from automatic capture or Extraction.

Search shows titles, categories and content previews. Pi highlights the active field/row and shows a right-hand preview when space allows. Claude uses native selections and current-value descriptions/previews. Search and pagination keep all records reachable.

Opening a record offers these actions in order:

- **Edit:** select **Content** or **Type**, with the existing value visible. Content starts from the saved text in Pi, or displays that text before asking for replacement in Claude Code. Type marks the current category. Scope and certainty are preserved.
- **Original words:** inspect exact user quotes, message dates and source host when recorded. Message dates are not necessarily event dates. Older Pi sources without a host field remain valid.
- **Delete:** remove the canonical record and suppress automatic re-extraction from the same evidence. There is no extra confirmation queue.
- **Back:** return to the list.

Pi's edit choices have a blank row between them and show the selected field's current value on the right in wide terminals. Detail actions use left/right and Enter, while PgUp/PgDn scroll. Claude uses its native question controls and retains these action names and order.

Concurrent changes reject stale versions; refresh the record before trying again. Library remains available for explicit user management when Memory is Off.

## Extraction

Both hosts list original conversations from Pi and Claude Code with host prefixes. Rows retain the original title language and show a completed-scan state:

| State           | Meaning                                                      |
| --------------- | ------------------------------------------------------------ |
| ○ Not extracted | No completed checkpoint                                      |
| ✓ Extracted     | User/assistant message fingerprints match the checkpoint     |
| ↻ Updated       | Messages were added, changed or removed since the checkpoint |

Pi uses accent/blue, green and yellow. Claude uses the same symbols and labels; color depends on native rendering. A checkpoint describes a scan, not the existence or correctness of a saved memory.

Select a new/updated conversation to start extraction; open existing tasks for progress, saved memories, logs, cancellation or retry. **Select conversations** starts a batch, one independent process per conversation. Pi also offers Ctrl+R and Space/Ctrl+Space selection. Claude uses native multi-select and pagination. Returning to chat leaves workers running. A task started in either host is visible from the other. A retry uses the host performing the retry and its configured model.

Pi workers use the configured Pi provider in fresh sessions. Claude workers launch fresh, tool-free `claude -p` requests with hooks disabled and use Claude's existing authentication/default model, or an explicitly selected model. Workers share extraction, exact-evidence validation, separate review and persistence rules. No private credentials are copied between hosts.

An invalid model response or incomplete review fails the task without advancing its checkpoint. Partial writes completed before a failure/cancellation remain saved; retry skips duplicates. A completed task can save zero records. Off prevents new extraction and requests cancellation across both hosts.

## Advice

Pi's Advice view has a `Question │ …` field that returns the question to the main conversation. Claude Code provides `/agent-personal-memory:advice <question>`; the Memory menu points to that command.

Advice searches by the question's topics and reads relevant records with original evidence. Instructions require the assistant to distinguish user statements from analysis, retain dates and uncertainty, and avoid treating past goals as current facts. Without relevant records, general advice remains possible. Ordinary chats expose non-preference records only as deduplication metadata.

## On/Off and context

The setting is shared per library. Off blocks automatic writes and new retrieval, and cancels running tasks. Pi removes its memory section/tools on the next provider request. Claude injects an Off instruction on the next user prompt; its tools return disabled immediately. Claude cannot remove messages already in its conversation. Use `/clear` or a fresh session for a clean context after switching Off. Neither host can retract requests already sent to a provider.

## Footer coexistence

Pi supports one custom footer slot. This extension places Memory on the directory line and preserves other status texts, using public usage/model information. Another footer-owning extension can replace it. Advanced host-only routing/subscription indicators may differ from Pi's default footer. Claude Code's existing status line is left intact.

## Troubleshooting

- **Different libraries:** inspect the launch environments and set the same `PERSONAL_MEMORY_DIR`. From a checkout, `PERSONAL_MEMORY_DIR=/absolute/library node claude/runtime.mjs status` shows the selected directory and counts.
- **Duplicate commands:** remove an older manual/package installation. Use `pi list` or Claude's plugin manager to inspect registrations.
- **Claude tools unavailable:** check `/mcp`, Node.js availability, plugin enablement and local plugin trust; restart after plugin changes.
- **Pi worker cannot find its model:** persist the provider/model configuration under that Pi agent directory. Runtime-only provider definitions may not reach a detached worker.
- **Claude extraction fails:** inspect its task error and confirm `claude` is available on the host's PATH and authenticated. Original checkpoints are retained on failure.
- **No new records:** inspect progress/logs; task-only discussion, duplicates and insufficient evidence legitimately yield zero saves.
- **Unexpected restatement:** compare Original words, correct/delete the record, and report a synthetic reproduction.

Read [Data & privacy](privacy.md) before sharing logs, moving libraries or erasing data.
