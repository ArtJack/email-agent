# email-agent

A small Node script that reads my inbox, asks Claude what's worth reading, and sends a one-message digest to Telegram every morning. Runs on a Mac mini under my desk. Under $1 a month at my volume (~30 emails a day).

## What it does

Once a day it pulls the last ~26 hours of mail over IMAP, runs each message through Claude Haiku for a quick `important` / `low` / `spam` call, summarizes the important ones in one sentence, and posts the whole thing to Telegram.

A digest looks roughly like this:

```
Daily Email Digest — Thu, Apr 23, 2026
10 email(s) in the last 26h

Important (2):

• ACME Bank: April statement is available, no action required.
  — Your April statement is ready
• Jane Doe: wants a 30-min meeting Friday 2pm about the Q2 plan.
  — Q2 planning — 30 min?

Filtered: 6 low-priority · 2 spam/promo

$0.0224 · 20.6K in / 359 out · 15 calls
```

That last line is the real Claude spend for the run — a couple of cents, typically.

## Stack

TypeScript on Node 20, `imapflow` + `mailparser` for mail, `@anthropic-ai/sdk` for Claude, `better-sqlite3` for a small dedupe table so re-runs don't double-notify, the Telegram Bot API for delivery, and `launchd` for the schedule. No cloud, no Docker, one `.env` file.

## Setup

You need:

- An Anthropic API key — https://console.anthropic.com/settings/keys
- IMAP access on your mail account (Yahoo needs an App Password; enable 2FA first)
- A Telegram bot token (`/newbot` to `@BotFather`) and your chat ID (message `@userinfobot`)

Then:

```bash
git clone https://github.com/ArtJack/email-agent.git
cd email-agent
npm install
cp .env.example .env          # fill in the secrets
./run.sh test-connection      # does IMAP login work?
./run.sh dry-run              # run the whole pipeline, print the digest, don't send
./run.sh dev                  # for real — sends to Telegram
```

## Running it every morning

On macOS there's a LaunchAgent:

```bash
npm run build
./scripts/install-launchd.sh           # fires daily at 10:00
./scripts/install-launchd.sh uninstall # removes it
```

On Linux, cron is fine:

```
0 10 * * *  cd /path/to/email-agent && node dist/run.js
```

## How it decides what's important

Triage is a single Haiku call per email with this prompt:

> You classify a single email into exactly one of: important, low, spam.

That's it. Haiku is cheap enough that running it on every email is still pennies, and it's correct often enough that the digest actually saves me time. The prompt is in `src/claude/triage.ts` if you want to make it stricter.

If the triage returns `important`, a second Haiku call writes the one-sentence summary. Everything else gets counted but not displayed.

## Notes / things I'd change

- Only tested against Yahoo. IMAP is generic, so Gmail / Fastmail / anything IMAPS should work — change `IMAP_HOST` in `.env`.
- No retries on a failed Telegram or IMAP call. If a run fails I just catch it the next morning. SQLite remembers which message-ids have been processed so reruns are idempotent.
- No allowlist for priority senders yet. Would be useful but I haven't needed one.
- The cost model is baked into `src/claude/client.ts` — if Anthropic changes prices, update it there.

## License

MIT — see [LICENSE](LICENSE).
