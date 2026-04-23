# Email Agent

A self-hosted AI email assistant that runs daily on a Mac mini, reads your inbox over IMAP, uses Claude to triage / summarize / deep-analyze, and delivers a single digest to Telegram. Zero server cost. Under $10/month in Claude API usage.

**Stack:** TypeScript (Node.js 20+) · Anthropic SDK · Yahoo IMAP (imapflow + mailparser) · SQLite (better-sqlite3) · Telegram Bot API · macOS launchd

---

## Why this exists

Inbox triage eats 20–30 minutes every morning and 80% of what arrives is noise. This agent compresses a day's mail into one scannable Telegram message with:
- **Laconic, action-first analysis** of Barron's market newsletters (tagged `📈 BUY`, `⚠️ TRIM`, `🛢 WATCH`, etc. — no hedge-speak)
- **USPS Informed Delivery extraction** — what mail is arriving today
- **Haiku-cheap triage** of everything else — spam auto-filed, important items summarized in one sentence
- **All results pushed to Telegram**, delivered while I'm having coffee

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Mac mini (24/7)                                            │
│                                                             │
│  launchd (10:00 daily) ──► node dist/run.js                 │
│                                │                            │
│                                ▼                            │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ Yahoo    │──►│ Deterministic│──►│ Route handler:   │    │
│  │ IMAP     │   │ VIP matcher  │   │ • Barron's       │    │
│  │ (26h     │   │ + Haiku      │   │   premium (Opus) │    │
│  │  window) │   │ triage for   │   │ • Barron's       │    │
│  │          │   │ rest         │   │   daily (Haiku)  │    │
│  └──────────┘   └──────────────┘   │ • USPS (Haiku)   │    │
│       │                            │ • Generic summary│    │
│       │                            │   (Haiku)        │    │
│       ▼                            └────────┬─────────┘    │
│  SQLite (dedupe by                          ▼              │
│  Message-Id across runs)       Telegram Bot sendMessage    │
└─────────────────────────────────────────────────────────────┘
```

### Key design choices

| Decision | Choice | Why |
|---|---|---|
| **Hosting** | Self-hosted on Mac mini | No cloud runtime cost; the machine is already on |
| **Scheduler** | macOS `launchd` (not cron) | Survives reboots; `StartCalendarInterval` handles missed runs on wake |
| **Email access** | Yahoo IMAP + App Password | 5-min setup vs. full OAuth; no client registration required |
| **State** | Single SQLite file | Dedupe across re-runs with zero config or running daemon |
| **Model tiering** | 3-tier Claude routing | Opus where depth matters, Haiku everywhere else — 10× cost difference |
| **Output format** | Strict bullet tags (`📈 BUY`/`⚠️ TRIM`) | Forces the model to commit to an action; prevents wall-of-text drift |
| **Safety** | `.env` never committed; secrets never pass through chat | Credentials stay on the local machine |

### Model tiering

The system routes each email to a different Claude model based on expected value:

- **`barronsstats@barrons.com`** → **Claude Opus 4.7** — weekly premium market analysis; worth the deep reasoning
- **`access@barrons.com`** → **Claude Haiku 4.5** — daily high-volume; one-sentence compression only
- **VIP USPS scans** → **Claude Haiku 4.5** — structured JSON extraction, Haiku is plenty
- **Everything else** → **Claude Haiku 4.5** — triage (spam/important/noteworthy/low) + short summary

Typical monthly cost: **$5–10**, depending on how often Barron's Premium fires and how chatty your inbox is. Usage is logged to `logs/usage.jsonl` per run for observability.

---

## Setup

Assumes macOS with Homebrew and Node.js 20+ installed. On Apple Silicon, `node` lives at `/opt/homebrew/bin/node`.

### 1. Gather credentials

| Secret | Where |
|---|---|
| Claude API key | https://console.anthropic.com/settings/keys |
| Yahoo App Password | https://login.yahoo.com/account/security (2-Step Verification required first) |
| Telegram Bot Token | Message [@BotFather](https://t.me/BotFather) → `/newbot` |
| Telegram Chat ID | Message [@userinfobot](https://t.me/userinfobot) — it replies with your ID |

### 2. Clone and install

```bash
git clone https://github.com/<your-username>/email-agent.git
cd email-agent
npm install
cp .env.example .env
# Edit .env with the secrets from step 1
```

### 3. Verify

```bash
./run.sh test-connection   # "IMAP OK. INBOX: N messages, M unread."
./run.sh dry-run           # runs full pipeline, prints digest, does NOT send to Telegram
./run.sh dev               # real run — sends to Telegram
```

### 4. Schedule (daily at 10:00)

```bash
npm run build                   # compile TS -> dist/run.js
./scripts/install-launchd.sh    # installs per-user LaunchAgent
```

Verify:
```bash
launchctl list | grep email
tail -f logs/stdout.log
```

Uninstall:
```bash
./scripts/install-launchd.sh uninstall
```

---

## Usage

`run.sh` is immune to directory mistakes — it always runs from the project folder regardless of where you call it.

| Command | Purpose |
|---|---|
| `./run.sh dry-run` | Full pipeline, print digest, don't send |
| `./run.sh dev` | Real run — send to Telegram |
| `./run.sh test-connection` | Verify IMAP credentials only |
| `./run.sh build` | Compile TypeScript |
| `LOOKBACK_HOURS=4 ./run.sh dry-run` | Shorter window for cheap testing |

---

## Project layout

```
email-agent/
├── src/
│   ├── run.ts                     # Entry point, orchestration, error isolation
│   ├── config.ts                  # Env var loading + fail-fast validation
│   ├── email/imap.ts              # Yahoo IMAP fetch (imapflow + mailparser)
│   ├── state/db.ts                # SQLite dedupe (Message-Id tracking)
│   ├── claude/
│   │   ├── client.ts              # Anthropic SDK wrapper + usage accounting
│   │   ├── triage.ts              # Haiku classifier: spam/important/noteworthy/low
│   │   ├── barrons-analyst.ts     # Opus deep-dive + Haiku one-liner
│   │   ├── usps-extractor.ts      # Structured JSON from USPS scans
│   │   └── generic-summary.ts     # One-sentence summary of non-VIP mail
│   ├── telegram/send.ts           # Bot API with 4000-char chunking
│   └── digest/format.ts           # Compose the Telegram message
├── launchd/email-agent.plist.template
├── scripts/install-launchd.sh
├── run.sh                         # Path-safe npm wrapper
└── data/                          # SQLite state (gitignored)
```

---

## Tuning

All knobs are in `.env`, so changing cost/quality tradeoffs doesn't need a code change:

```env
# Send the daily Barron's through Opus too (higher cost, deeper analysis)
BARRONS_DAILY_MODEL=claude-opus-4-7

# Or force everything to Haiku for minimum cost
BARRONS_PREMIUM_MODEL=claude-haiku-4-5-20251001

# Look back 48h instead of 26h (catches weekend backlog on Monday)
LOOKBACK_HOURS=48
```

VIP sender addresses and prompt personas are in [`src/config.ts`](src/config.ts) and [`src/claude/barrons-analyst.ts`](src/claude/barrons-analyst.ts).

---

## Troubleshooting

**`Missing required env var: ANTHROPIC_API_KEY`** — your shell has an empty global `ANTHROPIC_API_KEY=""` exported (e.g. from an old `~/.zshrc`). `dotenv` respects existing env vars by default; this project forces `override: true` in `src/config.ts`. If still failing, `unset ANTHROPIC_API_KEY` and re-run.

**Yahoo `Invalid credentials`** — App Password must be 16 chars, no spaces or dashes. Regenerate via Yahoo security settings.

**Telegram `400 chat not found`** — you must send a message *to* your bot from your personal account before its chat ID is discoverable. The `@userinfobot` method is simpler.

**launchd agent not firing** — `launchctl list | grep email`. A nonzero exit status shows in the second column; check `logs/stderr.log`. The Mac must be awake at 10:00 (macOS queues missed runs on wake, but sleep/hibernate kills the timer).

---

## License

MIT — see [LICENSE](LICENSE).
