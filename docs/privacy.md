# Data and privacy

## Local storage

The default library is `~/.pi/agent/memory/`. `PI_CODING_AGENT_DIR` selects a Pi agent directory, and an absolute `PERSONAL_MEMORY_DIR` explicitly selects a library. Existing initialized alternate libraries remain readable; ambiguous locations require explicit selection. See [library location](usage.md#library-location).

```text
<library>/
  settings.json              Enabled setting
  metadata.json              Counts, scan fingerprints and suppression hashes
  records/
    background.json
    experiences.json
    goals.json
    ideas.json
    preferences.json
  transaction.json           Recovery journal while publication needs it
  tasks/<id>/
    task.json                Source, model, candidates, results and statistics
    launch.json              Process handoff
    progress.log             Progress and model output
    stderr.log               Worker diagnostics
    cancel                   Cancellation request, when present
    conversation/            Worker model sessions
```

Records contain summaries, type, scope, certainty, tags, timestamps and exact source quotes with session/message identifiers. Existing supported metadata and source namespaces are preserved when records are read or edited. Personal data belongs outside the extension checkout.

Storage is plaintext. Directory/file permissions, process locks, atomic replacement and a recovery journal protect ordinary access/publication; they do not encrypt content. Filesystem snapshots, exports and backups may retain older text.

## Model requests

The extension has no telemetry, hosted database or extension-operated backend. Requests use Pi's configured provider and authentication:

- Ordinary conversation context receives eligible collaboration-habit summaries and small current-user source references.
- Ordinary searches can return full Preferences; other categories return deduplication metadata.
- Historical extraction sends selected message segments and relevant existing records/index information. Separate review sends candidates and evidence again.
- Advice can retrieve relevant full records and their exact sources.

Provider policies apply. Local records do not imply offline model processing. Extraction/review add model usage, and concurrent batches can hit provider limits. Prompt instructions are primarily in Chinese; record content and session titles retain their original language. Model adherence varies.

## Capture and control

Memory is On by default. There is no approval queue. Live capture requires exact current-run user evidence and permits at most three automatic writes per turn. Conservative checks reject obvious project-only requirements, unsupported domains and unsupported personality claims. Historical extraction adds separate model review. Neither exact matching nor review establishes full semantic fidelity; inspect important claims through Original words.

Pi hides automatic memory-tool rows, including expanded views. Instructions ask the model not to announce automatic saves, but cannot guarantee every model's reply behavior or eliminate latency.

Off blocks automatic writes inside store transactions, returns disabled for new retrieval, requests worker cancellation and removes memory context/tools on the next provider request. Explicit Library management remains available. Off cannot retract already-sent requests or erase text already present in a session.

## Deletion and retention

Library deletion removes the canonical record and retains content/source suppression hashes to inhibit automatic recovery from the same evidence. Explicit later requests can create a record again.

Deletion does not erase original Pi sessions, extraction candidates/logs, worker sessions, exports or backups. This version has no automatic artifact-retention policy. Stop workers before removing task artifacts. Stop Pi/workers before copying the complete library for a consistent backup.

## Uninstall and erasure

```sh
pi remove git:github.com/bin-Deng-666/agent-personal-memory
```

Reload/restart Pi. Removal preserves the library and original sessions. Full local erasure requires separately removing the chosen library, relevant sessions and backups after stopping workers. No data-erasing uninstall hook is installed.

## Reporting issues

Use synthetic examples, an isolated agent/library directory and a local fixture model where possible. Do not attach a real library, authentication file, environment file or transcript dump. Report sensitive exposure through [private security reporting](https://github.com/bin-Deng-666/agent-personal-memory/security/advisories/new).
