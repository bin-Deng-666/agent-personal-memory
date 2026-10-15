# Pi Personal Memory

[![Verify](https://github.com/bin-Deng-666/pi-personal-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/bin-Deng-666/pi-personal-memory/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Personal memory for [Pi](https://github.com/earendil-works/pi): keep useful context from conversations, preserve the original evidence, and retrieve it when it matters.

[简体中文](README.zh-CN.md) · [Usage](docs/usage.md) · [Architecture](docs/architecture.md) · [Data & privacy](docs/privacy.md)

## Install

Requires **Node.js 22+** and **`@earendil-works/pi-coding-agent` 1.2.0**. Other Pi versions are not yet verified. macOS and Linux are the target platforms; Windows is not yet verified.

```sh
pi install git:github.com/bin-Deng-666/pi-personal-memory
```

Run `/reload` in an existing Pi session, then `/memory`. To try it for one invocation:

```sh
pi -e git:github.com/bin-Deng-666/pi-personal-memory
```

The package installs its runtime dependency automatically. It uses Pi's configured model and credentials; there is no separate memory service or account. Keep only one installed copy of the extension: remove an older manually copied `extensions/memory/` before installing this package. Your records live separately under the agent's `memory/` directory.

## What it does

- **Quiet capture.** Saves useful personal information without a confirmation queue or save notifications. Model instructions keep internal save details out of replies.
- **Evidence-based historical extraction.** Select conversations and launch an independent background agent for each. Candidates pass exact-quote validation and a separate model review for future value, faithful restatement, scope and uncertainty.
- **Selective context.** Ordinary conversations load only collaboration habits. Advice retrieves relevant experiences, background, goals and ideas on demand.
- **Simple management.** Library searches, displays, edits and deletes existing records. There is no manual Add action.
- **Shared, recoverable storage.** Five category files, process locks, version checks and a write-ahead journal support multiple Pi processes.
- **One switch.** Tab toggles Memory On/Off inside `/memory`. Off blocks automatic writes, cancels extraction and removes memory context on the next provider request.

The five categories are Background, Experiences, Goals & direction, Ideas & insights, and Preferences. The model is instructed to exclude project facts, task progress, temporary formatting requests and unsupported personality judgments.

## Use `/memory`

| View       | Purpose                                  | Main controls                                 |
| ---------- | ---------------------------------------- | --------------------------------------------- |
| Library    | Search and manage existing memories      | Type to search, ↑↓ select, Enter open         |
| Extraction | Select conversations and inspect results | ↑↓ select, Enter open, Ctrl+R batch selection |
| Advice     | Ask a question using relevant memories   | Type in `Question │ …`, Enter send            |

Tab toggles Memory. Esc returns to the menu, then to the conversation. The focused input, row or detail action is highlighted. Detail actions use ←→ and Enter; PgUp/PgDn scroll content. The footer places Memory counts on the right of the directory line and restores the collaboration-habit summary at startup. The edit menu contains only Content and Type, with spaced choices and a current-value preview.

Extraction lists are one line per conversation, with a count and three states:

| State                         | Meaning                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| ○ Not extracted — blue/accent | No completed scan                                             |
| ✓ Extracted — green           | The relevant user/assistant messages match the completed scan |
| ↻ Updated — yellow            | Messages changed since the completed scan                     |

Running progress is shown alongside the scan state. A completed scan may save zero memories: no useful, supported new content is a valid outcome. Logs, retry and saved results are available by opening the conversation.

## Quality and cost

Historical extraction and review use separate fresh model conversations. Review rejects overstated claims, lost conditions, unsupported motives and semantic duplicates. Every stored source quote must match an actual user message; memories can cite several messages. Historical corrections compare dates of user evidence rather than storage dates.

These checks reduce errors; they do not prove semantic accuracy. Both extraction and review are model judgments. Review adds another model request for each segment with eligible candidates. Selecting many conversations starts multiple agents and may hit provider rate limits. Check important memories through **Original words** before relying on them.

Live capture occurs through tools in the main agent run and uses instructions plus evidence validation; it does not have the historical extractor's separate review request. Quiet rendering does not eliminate model latency or guarantee every model will avoid announcing a save.

## Data and control

Records stay in `~/.pi/agent/memory/` (or the agent directory selected with `PI_CODING_AGENT_DIR`). They are plaintext, not encrypted. The selected provider receives the conversation segments and relevant memories needed for extraction, review or Advice. There is no plugin telemetry or plugin-operated backend.

Deleting a Library record removes it from the canonical store and suppresses automatic recovery from the same evidence. Original Pi sessions and extraction artifacts can still contain the text. See [data & privacy](docs/privacy.md) for the complete retention and uninstall behavior.

```sh
pi update git:github.com/bin-Deng-666/pi-personal-memory
pi remove git:github.com/bin-Deng-666/pi-personal-memory
```

Removal does not delete personal records. To pin a version, install a Git tag or commit ref supported by Pi.

## Develop

```sh
git clone https://github.com/bin-Deng-666/pi-personal-memory.git
cd pi-personal-memory
npm ci --ignore-scripts
npm run verify
```

No build step is required; Pi loads the TypeScript entry directly. `verify` checks formatting, strict types, module reachability, layer boundaries, behavior tests and a packed-package smoke test. Tests use synthetic data and a local model server, not your account or real memories. CI targets Node 22/24 on Linux/macOS.

```text
index.ts                 Pi entry
src/extension.ts         Tools, lifecycle and provider context
src/application/         Navigation, Library and Extraction workflows
src/domain/              Types, prompts, ranking and validation
src/history/             Session snapshots, catalog and extraction/review
src/storage/             Locked and recoverable persistence
src/agents/              Detached process launcher and worker
src/ui/                  Terminal views and footer
src/types/               Dependency declarations
tests/                   Core, quality, process, SDK and UI tests
scripts/                 Structure and distribution checks
docs/                    Usage, architecture and data handling
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing behavior. Report bugs using synthetic examples; do not upload private sessions or credentials. Security issues can be reported through [GitHub private vulnerability reporting](https://github.com/bin-Deng-666/pi-personal-memory/security/advisories/new).

## License

[MIT](LICENSE).
