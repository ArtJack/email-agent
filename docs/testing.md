# Testing Plan

This project has live dependencies: Yahoo IMAP, LiteLLM/Ollama, SQLite, launchd, and Telegram. The default automated tests avoid real network calls. Live system checks should be run intentionally.

## Test Activities

1. Test planning: identify the risk for each path, especially scheduled delivery, model failures, and duplicate sends.
2. Test design: choose unit, integration, implementation, and system cases from the techniques below.
3. Test implementation: write deterministic automated tests first; keep live tests as explicit smoke checks.
4. Test execution: run `npm test` before reinstalling launchd; run live smoke checks after config or service changes.
5. Defect reporting: capture command, timestamp, expected result, actual result, and relevant log lines.
6. Regression testing: add a test for every production failure that should not recur.

## Automated Tests

| Level | Command | Purpose |
| --- | --- | --- |
| Unit | `npm run test:unit` | Pure formatting/routing/escaping behavior. |
| Integration | `npm run test:integration` | Local module integration with mocked Telegram and isolated SQLite. |
| Implementation | `npm run test:implementation` | Build artifact and launchd-template checks. |
| Local performance | `npm run test:performance` | Formatter, escaping, and SQLite microbenchmarks with p95 thresholds. |
| Live performance | `npm run test:performance:live` | Read-only Yahoo IMAP and LiteLLM latency checks. |
| Full local suite | `npm test` | Runs unit, integration, and implementation tests. |

## System Tests

Run these only when you want to touch live services:

1. IMAP credential check: `./run.sh test-connection`
2. End-to-end dry run: `cd "/Users/artjack/Library/Application Support/email-agent" && /opt/homebrew/bin/node dist/run.cjs --dry-run`
3. Telegram delivery smoke test: send a short known message with the configured bot token and chat ID, or run the app once with a small test mailbox batch.
4. Scheduler check: `launchctl list | grep email` and inspect `/Users/artjack/Library/Logs/email-agent/stdout.log`.
5. Failure recovery check: temporarily point the model to a bad name, confirm no daily sent marker is written for an all-error batch, then restore and rerun.

## Performance Tests

Run `npm run test:performance` during ordinary development. It is deterministic, local-only, and fails when formatter, Telegram escaping, or SQLite p95 latency exceeds its threshold.

Run `npm run test:performance:live` after network, proxy, model, or machine changes. It makes read-only IMAP requests and tiny `Reply with OK only` LiteLLM requests. Override sample count or thresholds when needed:

```sh
PERF_LIVE_SAMPLES=5 PERF_LITELLM_CHAT_P95_MS=45000 npm run test:performance:live
```

The live benchmark does not send Telegram messages and does not mutate email state.

## Test Design Techniques

| Technique | Project example |
| --- | --- |
| Equivalence partitioning | Email routes: VIP sender, spam, low, noteworthy, important. |
| Boundary value analysis | Telegram chunking at 3999, 4000, and 4001 characters. |
| Decision table testing | Send/skip behavior for dry-run, no new mail, partial errors, all errors, scheduled duplicate. |
| State transition testing | `daily_digest_runs`: not sent -> sent -> scheduled skip; all-fail -> not sent -> retry. |
| Error guessing | LiteLLM down, model missing, Telegram 400, IMAP parse failure. |
| Pairwise testing | Model route x email category x body source (`text` vs stripped `html`). |
| Regression testing | Any observed production failure gets a focused test before the fix is considered done. |

## Current Highest-Value Regression Cases

1. All emails fail during processing: do not send an error-only Telegram digest and do not mark the day sent.
2. LiteLLM model alias mismatch: detect before the scheduled run when possible.
3. Telegram API failure: fail loudly and preserve logs.
4. Duplicate scheduled trigger: send only one digest per calendar day after a successful scheduled send.
