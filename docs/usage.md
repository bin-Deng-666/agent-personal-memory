# Shared behavior

For installation and host-specific controls, use the separate [Pi guide](pi.md) or [Claude Code guide](claude-code.md).

## Shared library location

Both hosts use this precedence:

1. `PERSONAL_MEMORY_DIR`: an explicit absolute path.
2. `PI_CODING_AGENT_DIR/memory` when that custom Pi profile is present in the environment.
3. An initialized legacy `~/.pi/agent/memory/` library.
4. `$XDG_DATA_HOME/agent-personal-memory/`, or `~/.local/share/agent-personal-memory/` by default.

Set the same `PERSONAL_MEMORY_DIR` in both launch environments when using different profiles, shells or GUI launchers. Changing the variable selects a directory; it does not move records. If both the neutral and legacy libraries are initialized, select one explicitly. The resolver does not silently merge or overwrite them.

Existing data remains compatible: IDs, versions, category files, sources and suppression hashes are preserved. Reads recover journaled publication under a shared lock. Stale edits are rejected, and simultaneous writes cannot overwrite category files outside a transaction.

## Personal value

Capture evaluates all five categories. A candidate should remain useful after the current task ends. Project requirements and debugging status do not belong in personal memory merely because the user says "remember". A project can still contain a personally important experience or ongoing constraint, but each claim needs user evidence. One situational instruction cannot support broad personality labels.

Live capture checks current-turn quotes, retrieved versions for edits, explicit current deletion requests and a three-automatic-write limit. Shared conservative checks reject obvious project-only evidence, unsupported domains and unsupported personality claims. They are not a general semantic classifier and can miss nuanced cases. Historical extraction also performs separate model review; important records should be inspected through Original words.

## Context and capture

All five categories are eligible for automatic capture. Ordinary context includes only eligible collaboration habits from Preferences; not every preference is a collaboration habit. Advice retrieves relevant records and evidence on demand. Ordinary lookup returns non-preference deduplication metadata.

Pi refreshes the memory section on each provider request. Claude refreshes habits on session start/user prompts, and its search returns fresh trusted source IDs if the prompt hook ran before transcript append. The model is instructed to search before saving and avoid announcing automatic operations.

Status is shared: `Personal Memory On · N total · N habits loaded`, with `1 habit` for singular. The total and loaded-habit count describe different things.

## Consistent operations

| Operation       | Pi                                             | Claude Code                                                       |
| --------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Open            | `/personal-memory`                             | `/personal-memory` after setup; namespaced command also available |
| Views           | Library, Extraction, Advice                    | Same                                                              |
| Record actions  | Edit, Original words, Delete, Back             | Same                                                              |
| Editable fields | Content, Type                                  | Same                                                              |
| Category        | Visible Type label on rows/details             | `[category] Title` labels and Type in detail                      |
| Scope           | Preserved internally; not separately displayed | Same                                                              |
| Toggle          | Tab                                            | Personal Memory On/Off choice                                     |
| Status          | Footer                                         | Same text in menu                                                 |
| Back            | Esc                                            | Back choice / host controls                                       |
| Tool display    | Hidden automatic rows                          | Host-controlled                                                   |

Claude menus are model-guided native questions, not a deterministic copy of Pi's terminal renderer. The service validates the underlying data actions. Print mode uses textual choices. The built-in Claude `/memory` and status line remain unchanged.

## Extraction

Lists include Pi and Claude conversations with host prefixes. ○ Not extracted means no completed checkpoint, ✓ Extracted means message fingerprints match, and ↻ Updated means messages changed. The checkpoint is not a claim that useful memories were saved. Unreadable/incomplete transcripts are omitted until readable.

Select one conversation or a batch; each source gets an independent worker. Task launch locks deduplicate active sources across hosts. Return to chatting while extraction runs, or open progress, results and logs. Cancel affects the chosen task; Off requests all running tasks to stop. Retry uses the host doing the retry and its model configuration.

Both runtimes use common extraction and separate review stages in fresh model contexts. Invalid output leaves the checkpoint unchanged. Already completed writes survive cancellation/failure; retry skips duplicates. Zero saved records is a valid outcome.

## Off, removal and recovery

The setting is global per library. Off blocks automatic writes and new retrieval and cancels extraction; explicit Library management remains available. Pi removes its section/tools on the next request. Claude can inject an Off instruction and disable its tools but cannot remove earlier context; use `/clear` or a new session for a clean context. No host can retract an already-sent provider request.

Uninstall preserves records. Record deletion suppresses automatic recovery from the same evidence but does not erase original transcripts, logs or backups. See [privacy](privacy.md) for retention and cleanup. Use synthetic examples when reporting issues.
