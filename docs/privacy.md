# Data and privacy

## What is stored

The default directory is `~/.pi/agent/memory/`. Setting `PI_CODING_AGENT_DIR` changes the agent root and therefore the memory location.

```text
memory/
├── settings.json         Global enabled flag
├── metadata.json         Counts, source scan fingerprints and suppression keys
├── records/
│   ├── background.json
│   ├── experiences.json
│   ├── goals.json
│   ├── ideas.json
│   └── preferences.json
├── transaction.json      Present while an interrupted/publication transaction needs recovery
└── tasks/<id>/
    ├── task.json         Model, source path, candidates, results and usage
    ├── launch.json       Process ID handoff
    ├── progress.log      Progress and model output
    ├── stderr.log        Worker errors
    ├── cancel            Present when cancellation was requested
    └── conversation/    Worker model-request/response session files
```

Records contain the summary, type, scope, certainty, tags, timestamps and supporting exact user quotes with session/message references. Storage uses file permissions, locks, atomic replacement and a journal. It is plaintext and is not an encrypted vault. Operating-system backups and filesystem snapshots can retain old data.

## Where data is sent

The plugin has no telemetry, hosted database or plugin-operated backend. Model requests go through Pi's selected provider:

- Ordinary requests receive eligible collaboration-habit summaries and small source references for current user messages.
- Live memory tools can send their requested query/results through the model conversation. In ordinary mode, non-preference records return deduplication metadata; Preferences can return full content.
- Historical extraction sends selected conversation segments, context exchanges and relevant existing memories/index information to the provider. Review sends evidence and candidates again.
- Advice can retrieve full records relevant to the question, including supporting sources.

Your provider's policies still apply. Local storage does not mean extraction or advice is performed offline. Instructions in this package are primarily written in Chinese; record content and session titles retain their original language, and model adherence varies.

## Automatic capture and control

Memory is On by default. There is no approval queue. Model instructions limit capture to useful personal information and exclude project/task logs. Automatic live writes require quoted current-run user messages and are limited to three per run. Exact evidence validation cannot establish that every generated restatement is semantically correct.

The historical extractor adds a separate model review before saving. That review can also make mistakes. Use Original words to inspect important claims.

Memory Off is global to the agent directory. It blocks non-manual storage writes, requests cancellation of background extraction and removes the plugin's context/tools on the next provider request. It cannot retract a request already sent to a provider. Existing memory content previously printed or used in the session transcript is not erased.

## Deletion and retention

Deleting a Library memory removes its canonical record and records content/source suppression hashes. Those hashes prevent automatic re-creation from the same evidence. Explicit future user requests can create a record again.

Library deletion does **not** erase:

- Original Pi session files.
- Task candidates, progress logs or worker conversation files.
- Existing session transcripts, exports or backups.
- Data already sent to a model provider.

This version has no automatic task-log retention policy. Stop running tasks before manually removing task artifacts, and use your filesystem/backup tools if you need broader erasure. Back up the complete memory directory while Pi and extraction processes are stopped if you need a consistent export; do not publish it as part of a source repository.

## Uninstall

```sh
pi remove git:github.com/bin-Deng-666/pi-personal-memory
```

Reload or restart Pi. The package removal does not delete personal records or original sessions. Full local erasure requires separately removing the agent's memory directory, relevant original sessions and any backups you control, after stopping running workers. No data-erasing uninstall hook is installed.

## Reporting issues

Use synthetic text, a fresh agent directory and a locally configured test model when possible. Do not attach a real `memory/`, `auth.json`, `.env` or session dump. Report private-data exposure or credential problems through the repository's [private security reporting](https://github.com/bin-Deng-666/pi-personal-memory/security/advisories/new).
