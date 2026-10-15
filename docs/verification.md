# Verification

The current UI is tested against Claude Code 2.1.295 and Pi 1.2.0. All fixtures use isolated memory directories; synthetic statements are not saved to a personal library.

## Normal Claude native UI

```sh
python3 scripts/check-native-menu.py
```

This starts a real interactive Claude process with a local model fixture and no tmux environment. It types `/personal-memory` into the actual input and checks:

- Native choices appear in the existing Claude window.
- Model-supplied wrong questions and prefilled answers are replaced before rendering.
- Library categories, details and original content are visible.
- The native text row saves the exact replacement with a new version.
- On/Off changes shared state and the status count.
- Close returns to the conversation.

The fixture drives real UI interactions; it does not prove every provider/model will choose tools reliably. Menu navigation requires model turns. Native dialogs are not the internal `/model` implementation.

The installed 0.3.0 native workflow was also smoke-tested with the existing configured provider/model in an isolated configuration and memory directory: ordinary Claude startup → native Home → Settings → Close. It completed without a special launcher or writes to the personal library. The wider edit/settings regression above uses a local fixture so it is repeatable without paid API access.

## Automated backend and distribution checks

```sh
npm ci --ignore-scripts
npm run verify
```

The suite checks current-turn evidence, duplicates, process locking, stale versions, journal recovery, extraction/review, cancellation, five-category reachability, UI category labels, singular/plural status, status-line preservation, native-menu schema limits, host-bound/replayed answers, typed edits and Advice scope. Pi and Claude artifacts are installed independently without development dependencies or copies of host SDKs.

`node scripts/check-claude-host.mjs` separately checks real host discovery, habit injection, MCP lookup and continuation against a local provider fixture.

## Configured-provider capture check

```sh
node scripts/check-configured-claude.mjs /tmp/personal-memory-report.json
```

This optional command incurs model usage. It uses the installed plugin and configured provider with synthetic statements in a temporary library. The exercised cases saved one record in each of Background, Experiences, Goals & direction, Ideas & insights and Preferences. Ordinary context selected one collaboration habit. Advice retrieved non-preference records, while a project-only acceptance request added no records.

The configured-provider check can leave synthetic transcripts in Claude's configured history. The checks do not establish semantic correctness of every generated summary; inspect important memories through Original words. Personal data and credentials must not be attached to test reports.
