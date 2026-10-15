# Architecture

The package has one entry (`index.ts`) and no build step. Pi loads `src/extension.ts`, which owns tools, session lifecycle, automatic-write authorization and provider context. Application workflows coordinate storage and terminal views. Personal data lives outside the checkout.

```text
pi-personal-memory/
├── index.ts
├── src/
│   ├── extension.ts             Pi composition, tools and session state
│   ├── application/
│   │   ├── panel.ts             Navigation, dashboard data and Advice dispatch
│   │   ├── library.ts           Memory detail, editing, deletion and result lists
│   │   └── extraction.ts        Shared single/batch extraction and task actions
│   ├── domain/
│   │   ├── memory.ts            Types, validation and duplicate/suppression keys
│   │   ├── task.ts              Task, review and conversation-summary types
│   │   ├── prompts.ts           Capture, extraction, review and Advice rules
│   │   └── search.ts            Keyword ranking and collaboration-habit budget
│   ├── history/
│   │   ├── sessions.ts          Branch snapshots, chunks, checkpoints and evidence
│   │   ├── catalog.ts           One shared conversation list and status calculation
│   │   └── extraction.ts        Model requests, evidence validation and review gates
│   ├── storage/
│   │   └── store.ts             Locks, records, journal, versions and migration
│   ├── agents/
│   │   ├── tasks.ts             Process launch, task discovery and cancellation
│   │   ├── runner.mjs           Node bootstrap using the parent's Pi SDK
│   │   └── worker.ts            Fresh model contexts, review and persistence
│   ├── ui/
│   │   ├── dashboard.ts         Menu, Library, conversation list and Advice input
│   │   ├── picker.ts            Searchable selection, multi-select and choices
│   │   ├── editor.ts            Full-terminal memory text editor
│   │   ├── preview.ts           Memory/source text and detail actions
│   │   ├── task-viewer.ts       Summary, optional log and agent actions
│   │   ├── footer.ts            Path, memory counts, usage and base model
│   │   └── screen.ts            Focus/input/status styling and viewport helpers
│   └── types/
│       └── proper-lockfile.d.ts
├── tests/                       Storage, quality, SDK, processes and native UI
├── scripts/
│   ├── check-structure.mjs      Reachability and dependency boundaries
│   └── check-package.mjs        Packed runtime-only install and worker smoke test
├── docs/                        Usage, architecture and data handling
├── .github/                     CI, dependency updates and issue/PR templates
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Dependency direction

| Layer           | May depend on                                     |
| --------------- | ------------------------------------------------- |
| Domain          | Domain and external libraries                     |
| History         | Domain, History                                   |
| Storage         | Domain, Storage                                   |
| Agents          | Domain, History, Storage, Agents                  |
| UI              | Domain, UI                                        |
| Application     | Domain, History, Storage, Agents, UI, Application |
| Extension entry | Composition of the above                          |

UI imports task types/labels from Domain rather than loading a process launcher. Application modules contain user workflows; rendering helpers do not write records. The store is the final enforcement point for Off, optimistic versions, duplicate content and recoverable publication.

## Why these modules

Navigation, record management and extraction have independent responsibilities and test seams, so they are separate application modules. Both the default list and batch picker consume `history/catalog.ts`; both open results through the same extraction workflow and Library list. Single-purpose dialog editors remain separate from the searchable picker, while its trivial choice wrapper lives with the picker. No barrel modules or catch-all utility directory are needed.

The entry keeps automatic capture and request-local context together because they share current-run authorization and per-session state. The dashboard keeps keyboard focus and its render layout together so changes to visible focus and key behavior stay coordinated.

## Background loading

`tasks.ts` starts `runner.mjs` through a URL relative to the package. The runner uses the parent Pi installation's jiti and SDK to import `worker.ts`. The worker does not install a second host SDK or load user extensions. Each extraction/review model request gets a fresh session; credentials and model configuration come from the selected agent directory.

`npm run check:structure` follows static imports, the runner URL and jiti imports. It rejects missing sources, unreachable modules and reverse layer dependencies. It recognizes the import conventions used here, not arbitrary dynamic JavaScript. Type declarations are checked by TypeScript. `check:package` exercises the actual runtime-only artifact and detached loading chain, beyond a graph check.

## Persistence and evidence

The store publishes category files and metadata through a journal. Reads recover interrupted publication while holding a cross-process lock. Updates require a current record version. Deletion removes the canonical record and retains suppression hashes. Exact source matching proves that a quote occurred in a user message; the model review evaluates whether a restatement is warranted and worth keeping.

Ordinary provider requests include only eligible collaboration habits. Advice retrieves records on demand. Sources include user-message IDs; generated memory IDs identify separate stored records. These identifiers and automatic operations are internal and have no visible tool transcript rows.

## Compatibility boundaries

The package is tested against the pinned Pi development SDK, while runtime peers use Pi's documented wildcard convention. Native UI tests use some internal Pi components as test fixtures; production code uses public extension/context APIs. A future Pi version may require adaptation.

The custom footer owns Pi's single footer slot; it cannot compose with another footer owner automatically. It mirrors public usage/model information and preserves other status texts. Host-only routing/subscription indicators are not fully replicated. See [usage](usage.md) and [data & privacy](privacy.md) for operational behavior and retention limits.
