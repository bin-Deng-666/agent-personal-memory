# Data and privacy

## Shared storage

Both hosts use the same directory resolver. New installations default to `~/.local/share/agent-personal-memory/`; an initialized legacy `~/.pi/agent/memory/` library is reused in place. `PERSONAL_MEMORY_DIR` explicitly selects an absolute path for both hosts. See [directory precedence](usage.md#shared-library-location), including custom Pi profiles and ambiguous existing libraries.

```text
<shared-library>/
├── settings.json              Shared enabled flag
├── metadata.json              Counts, scan fingerprints and suppression hashes
├── records/
│   ├── background.json
│   ├── experiences.json
│   ├── goals.json
│   ├── ideas.json
│   └── preferences.json
├── transaction.json           Write-ahead recovery journal, when needed
├── hosts/claude/sessions/      Local session binding and current-run evidence metadata
└── tasks/<id>/
    ├── task.json              Runtime, source path, candidates, results and statistics
    ├── launch.json            Worker process handoff
    ├── progress.log           Progress; Pi can also retain raw model output
    ├── stderr.log             Worker diagnostics
    ├── cancel                 Cancellation request, when present
    └── conversation/          Pi worker model sessions, when created
```

Records contain summaries, categories, scope, certainty, tags, timestamps and exact supporting user quotes. Sources identify original sessions/messages; Claude sources carry a host marker and namespaced session ID. Existing Pi sources remain compatible.

Files are local plaintext, protected by directory/file permissions, process locks, atomic replacement and a recovery journal. They are not encrypted. Filesystem snapshots, exports and backups can retain old data. Never commit a real library to a source repository.

## Model providers

The plugin has no telemetry, hosted database or plugin-operated backend. Each host sends requests through its own configured model provider and authentication:

- Ordinary conversations receive eligible collaboration-habit summaries and small current-message source references.
- Live tools return deduplication metadata for non-preference records in ordinary mode. Preferences can return full content.
- Historical extraction sends selected conversation segments and relevant existing records/index information. Review sends evidence and candidates in a separate fresh context.
- Advice can retrieve full relevant records and their quotes.

A Claude worker may analyze a Pi conversation, or a Pi worker a Claude conversation, when the user selects it in Extraction. This sends that selected history to the provider of the host doing the extraction. Credentials are not transferred between hosts. Local storage does not imply offline model processing. Provider retention policies still apply.

## Automatic capture

Memory is On by default. There is no approval queue. Both adapters share evidence validation, current-run authorization, duplicate checks, update/deletion conditions and a three-automatic-write limit per turn. Explicit library edits are manual management. Instructions limit capture to useful personal information and exclude project/task logs, assistant suggestions and unsupported claims.

Exact quote matching validates that words occurred in a user message; it cannot prove the fidelity of a generated summary. Historical extraction adds separate model review, which can also make mistakes. Use Original words to inspect important records.

Claude's hooks bind memory tools to the current host-supplied session and transcript. The model does not choose a transcript path. Historical extraction paths must match the discovered conversation list. The Claude runtime opens no network listener. Automatic search/write permission decisions apply only to this plugin's named memory tools; other tools and user permission settings retain their normal behavior.

Pi hides its automatic memory tool rows. Claude Code owns MCP tool rendering and may show tool activity. Instructions ask both models to keep automatic saves out of replies, but model adherence and latency can vary.

## Shared Off behavior

Off is global to the selected library and blocks non-manual writes inside the store transaction. New retrieval returns disabled. Both hosts request cancellation through the same task files; workers also poll the shared setting.

Pi removes its memory section/tools on the next provider request. Claude Code refreshes context on session start and each user prompt, injecting an Off instruction when disabled. Claude cannot remove previously injected messages or records already present in its context; use `/clear` or a new session if that is required. Neither host can retract a provider request already sent, erase earlier responses or remove data from a provider's systems.

## Deletion and retention

Library deletion removes the canonical record and stores content/source suppression hashes to inhibit automatic recovery from that evidence. Explicit later requests can create a record again.

Deletion does not erase original Pi/Claude transcripts, task candidates, logs, worker sessions, exports or backups. Claude session bindings retain a transcript path, current prompt and source identifiers locally. This version does not implement automatic task/session-metadata retention. Stop workers before removing task artifacts or host bindings. Back up the complete library while both hosts and workers are stopped for a consistent export.

## Uninstall and erasure

```sh
pi remove git:github.com/bin-Deng-666/agent-personal-memory
```

```text
/plugin uninstall agent-personal-memory@agent-personal-memory
```

Reload/restart the affected host. Removal preserves the shared library and the other host's installation. Full local erasure requires separately removing the chosen library, relevant original transcripts and backups after stopping running workers. There is no data-erasing uninstall hook.

## Reporting issues

Use synthetic records, isolated data/configuration directories and a local model fixture. Do not attach a real library, authentication file, environment file or transcript dump. Report sensitive exposure through [private security reporting](https://github.com/bin-Deng-666/agent-personal-memory/security/advisories/new).
