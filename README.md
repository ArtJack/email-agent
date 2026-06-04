# Email Agent

A self-hosted AI email assistant that runs daily on a Mac mini, reads your inbox over IMAP, uses local Ollama models to triage / summarize / analyze, and delivers a single digest to Telegram. Zero server cost. Zero LLM API cost.

**Stack:** TypeScript (Node.js 20+) · Ollama · Yahoo IMAP (imapflow + mailparser) · SQLite (better-sqlite3) · Telegram Bot API · macOS launchd

---

## Why this exists

Inbox triage eats 20–30 minutes every morning and 80% of what arrives is noise. This agent compresses a day's mail into one scannable Telegram message with:
- **Laconic, action-first analysis** of Barron's market newsletters (tagged `📈 BUY`, `⚠️ TRIM`, `🛢 WATCH`, etc. — no hedge-speak)
- **USPS Informed Delivery extraction** — what mail is arriving today
- **Local-model triage** of everything else — spam auto-filed, important items summarized in one sentence
- **All results pushed to Telegram**, delivered while I'm having coffee

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Mac mini (24/7)                                            │
│                                                             │
│  launchd (10:00 daily) --> node dist/run.cjs                │
│                                │                            │
│                                v                            │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────┐    │
│  │ Yahoo    │-->│ Deterministic│-->│ Route handler:   │    │
│  │ IMAP     │   │ VIP matcher  │   │ • Barron's       │    │
│  │ (26h     │   │ + Ollama     │   │   premium        │    │
│  │  window) │   │ triage for   │   │ • Barron's       │    │
│  │          │   │ rest         │   │   daily          │    │
│  └──────────┘   └──────────────┘   │ • USPS           │    │
│       │                            │ • Generic summary│    │
│       │                            │   (Ollama)       │    │
│       v                            └────────┬─────────┘    │
│  SQLite (dedupe by                          v              │
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
| **Model routing** | Ollama model knobs per route | Tune local quality/speed without changing code |
| **Output format** | Strict bullet tags (`📈 BUY`/`⚠️ TRIM`) | Forces the model to commit to an action; prevents wall-of-text drift |
| **Safety** | `.env` never committed; secrets never pass through chat | Credentials stay on the local machine |

### Model routing

The system can route each email type to a different Ollama model:

- **`barronsstats@barrons.com`** → `BARRONS_PREMIUM_MODEL`
- **`access@barrons.com`** → `BARRONS_DAILY_MODEL`
- **VIP USPS scans** → `SUMMARY_MODEL`
- **Everything else** → `TRIAGE_MODEL` + `SUMMARY_MODEL`

The default model is `llama3.1:8b`. Usage is logged to `logs/usage.jsonl` per run for observability.

---

## Setup

Assumes macOS with Homebrew and Node.js 20+ installed. On Apple Silicon, `node` lives at `/opt/homebrew/bin/node`.

### 1. Gather credentials

| Secret | Where |
|---|---|
| Yahoo App Password | https://login.yahoo.com/account/security (2-Step Verification required first) |
| Telegram Bot Token | Message [@BotFather](https://t.me/BotFather) → `/newbot` |
| Telegram Chat ID | Message [@userinfobot](https://t.me/userinfobot) — it replies with your ID |

Ollama must also be running locally:

```bash
ollama pull llama3.1:8b
ollama serve
```

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
npm run build                   # bundle TS -> dist/run.cjs
./scripts/install-launchd.sh    # installs per-user LaunchAgent
```

Verify:
```bash
launchctl list | grep email
tail -f ~/Library/Logs/email-agent/stdout.log
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
│   │   ├── client.ts              # Ollama chat wrapper + usage accounting
│   │   ├── triage.ts              # Classifier: spam/important/noteworthy/low
│   │   ├── barrons-analyst.ts     # Barron's deep-dive + daily one-liner
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
# Use a larger local model for premium analysis
BARRONS_PREMIUM_MODEL=llama3.3:70b

# Use the default local model everywhere
TRIAGE_MODEL=llama3.1:8b
SUMMARY_MODEL=llama3.1:8b
BARRONS_DAILY_MODEL=llama3.1:8b

# Look back 48h instead of 26h (catches weekend backlog on Monday)
LOOKBACK_HOURS=48
```

VIP sender addresses and prompt personas are in [`src/config.ts`](src/config.ts) and [`src/claude/barrons-analyst.ts`](src/claude/barrons-analyst.ts).

---

## Troubleshooting

**Ollama `connection refused`** — start Ollama with `ollama serve`, or check the LaunchAgent/service keeping Ollama alive. The app reads `OLLAMA_BASE_URL`, defaulting to `http://127.0.0.1:11434`.

**Yahoo `Invalid credentials`** — App Password must be 16 chars, no spaces or dashes. Regenerate via Yahoo security settings.

**Telegram `400 chat not found`** — you must send a message *to* your bot from your personal account before its chat ID is discoverable. The `@userinfobot` method is simpler.

**launchd agent not firing** — `launchctl list | grep email`. A nonzero exit status shows in the second column; check `~/Library/Logs/email-agent/stderr.log`. The Mac must be awake at 10:00, or the hourly catch-up runner will send once after the scheduled window when your user session is active.

---

## License

MIT — see [LICENSE](LICENSE).
