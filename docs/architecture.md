# Architecture

One host-independent core supports two separately installed adapters. Both read/write the same library; UI and host runtime choices are independent from the stored records.

```text
packages/
  core/src/
    capture.ts             Shared current-turn evidence and write policy
    domain/                Types, quality checks, prompts, ranking and status labels
    history/               Pi/Claude snapshots, source quotes, extraction/review
    storage/               Location resolver, locks, journal and shared task metadata
  terminal/src/            Pi dashboard, lists, editor, preview and Library workflow
  pi/
    index.ts               Loads this package's bundled runtime
    src/                   Pi integration, workflows, worker and footer
    runtime/               Bundled extension/worker plus SDK bootstrap
  claude-code/
    .claude-plugin/        Plugin manifest; root marketplace points here
    hooks/                 Context, session binding and native-choice control
    commands/              Personal Memory, Advice, Extraction and setup
    src/native-menu.ts     Authoritative native screens and validated transitions
    src/main.ts            MCP tools, hooks and runtime entry
    src/sessions.ts        Session, run and pending native-tool state
    src/statusline.ts      Composition with an existing status command
    runtime.mjs            Standalone bundle without the Pi SDK or TUI library
```

The root is a private development workspace. Its Pi manifest routes Git installs to `packages/pi/index.ts`; its marketplace installs `packages/claude-code`. Neither host artifact includes the other adapter. Core is bundled into each. `check-structure` traverses production consumers, rejects orphans and prevents host-crossing imports. Bundle checks reject foreign host runtimes.

## Native Claude interaction

The normal `claude` command is supported. `/personal-memory` starts a model/tool workflow using Claude's native AskUserQuestion component. Public plugins cannot register the internal `/model` renderer. Native menu navigation requires model turns; it is not a zero-request local modal.

UserPromptSubmit initializes a session-scoped menu and supplies the first question. PreToolUse replaces AskUserQuestion input with backend-generated options and drops any model-supplied answers. It does not auto-approve the tool, which would bypass its user-interaction step. PostToolUse reads the host's actual answer and matches the pending tool ID before executing a transition or mutation. A Stop hook can correct a premature text-menu response once.

The controller owns screen definitions, pagination, record IDs/versions, type selection, search and task actions. Every question has two to four options to fit the native API. Free text uses the host's Other/Type something row; it is only accepted on search, content and Advice screens. New user turns reset menu scope. Wrong/replayed tool IDs cannot mutate records. A submitted Advice question closes the menu, changes retrieval mode and continues in the same conversation.

This keeps the data protocol deterministic while acknowledging model latency and host-owned rendering. Native-tool permission restrictions and noninteractive mode can prevent selection UI. Other uses of AskUserQuestion outside an active Personal Memory session are unaffected. There is no tmux, external terminal, browser server or launcher dependency.

## Capture and quality

Both adapters use CaptureSession. It tracks the current user anchor, message IDs, retrieved versions, Advice mode and automatic-write limit. Exact user quotes are validated before saving; updates require retrieved versions and corrections, deletions require current explicit authorization. The locked store independently enforces Off, duplicate checks and optimistic versions.

Shared personal-evidence checks conservatively reject obvious project requirements, unsupported domains, generalized temporary observations and unsupported personality claims. Prompts require usefulness beyond the current task while preserving personal conditions, experiences, goals and uncertainty. These checks do not establish full semantic fidelity.

Historical extraction additionally reviews each eligible candidate in a separate fresh context. Incomplete/invalid output preserves the source checkpoint. Partial successful saves survive failure/cancellation, and retries skip duplicates.

## Sources and shared storage

Pi snapshots follow active parent chains and context edits. Claude snapshots follow active user/assistant chains and exclude sidechains, synthetic summaries, command messages and tool-result content as user evidence. Claude IDs are namespaced; existing Pi source keys remain compatible.

Hooks bind tools to host-provided session/transcript paths. The model does not choose a transcript path. Search refreshes current user IDs when a submit hook ran before transcript persistence. Per-session capture state is isolated, and calls are serialized.

One directory resolver supports explicit override, custom Pi profiles, existing Pi reuse and a neutral default. Ambiguous initialized libraries require explicit selection; no implicit copy/merge occurs. Category publication uses cross-process locks, a durable journal and atomic replacement. Reads recover interrupted publication under the same lock.

## Workers and distribution

Task metadata, launch locks, progress, results and cancellation are shared. Workers poll the enabled flag and cancellation files. Pi's runner uses the parent's exact SDK/jiti, keeping its authentication directory separate from its shared library. Claude workers use fresh tool-free `claude -p` requests with hooks disabled and an empty strict MCP configuration; no credentials are copied between hosts. Either runtime can analyze selected histories from either host.

Pi runtime bundles exclude host-provided SDKs/typebox. Claude bundles its MCP/schema/persistence dependencies and third-party notices. Both artifacts are committed for install-without-build support; verification rejects stale output. The native status-line wrapper preserves previous output/settings. Setup refreshes the user shortcut and removes only this plugin's obsolete generated launcher.

## Verification

`npm run verify` checks formatting, types, boundaries, bundle freshness, synthetic behavior and independent packed installs. Native backend tests cover schema limits, pagination, host-bound answers, stale edits, all five types, deletion, settings and Advice scope.

`python3 scripts/check-native-menu.py` uses a real interactive Claude process, a local model fixture and a pseudo-terminal with no tmux environment. It verifies actual native rendering and text-entry behavior while attempting to inject wrong menu options/answers. Separate checks cover real host discovery/MCP and optional configured-provider five-category capture. The latter incurs model usage and uses an isolated library. See [verification](verification.md) and [privacy](privacy.md).
