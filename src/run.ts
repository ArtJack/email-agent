import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { fetchRecentEmails, testConnection, type FetchedEmail } from "./email/imap.js";
import {
  isProcessed,
  markProcessed,
  hasDailyDigestRun,
  markDailyDigestRun,
  cleanupOldRows,
  closeDb,
} from "./state/db.js";
import { triageEmail, hardMatchSender } from "./claude/triage.js";
import { analyzeBarronsPremium, summarizeBarronsDaily } from "./claude/barrons-analyst.js";
import { extractUsps } from "./claude/usps-extractor.js";
import { summarizeGeneric } from "./claude/generic-summary.js";
import { formatDigestPlain, type DigestSections } from "./digest/format.js";
import { sendTelegram } from "./telegram/send.js";
import { getTotalUsage } from "./claude/client.js";

const LOG_DIR = path.resolve(process.cwd(), "logs");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const TEST_CONN = args.has("--test-connection");
const SCHEDULED = args.has("--scheduled");

async function main(): Promise<void> {
  if (TEST_CONN) {
    await testConnection();
    return;
  }

  const scheduledDate = SCHEDULED && !DRY_RUN ? getScheduledRunDate(new Date()) : null;
  if (scheduledDate) {
    if (!scheduledDate.isDue) {
      console.log(
        `[${new Date().toISOString()}] Scheduled run skipped — ${scheduledDate.timeLabel} ${config.schedule.timezone} is before ${scheduledDate.targetLabel}.`
      );
      closeDb();
      return;
    }
    if (hasDailyDigestRun(scheduledDate.dateKey)) {
      console.log(`[${new Date().toISOString()}] Scheduled run skipped — digest already sent for ${scheduledDate.dateKey}.`);
      closeDb();
      return;
    }
  }

  console.log(`[${new Date().toISOString()}] Starting run${DRY_RUN ? " (DRY RUN)" : ""}`);

  const emails = await fetchRecentEmails(config.lookbackHours);
  console.log(`Fetched ${emails.length} email(s) from the last ${config.lookbackHours}h`);

  const fresh = emails.filter((e) => !isProcessed(e.messageId));
  console.log(`${fresh.length} new, ${emails.length - fresh.length} already processed`);

  const sections: DigestSections = {
    date: new Date(),
    barronsPremium: [],
    barronsDaily: [],
    usps: [],
    important: [],
    lowCount: 0,
    spamCount: 0,
    errorCount: 0,
    totalEmails: fresh.length,
  };

  for (const email of fresh) {
    try {
      await handleEmail(email, sections);
      if (!DRY_RUN) markProcessed(email.messageId, "done");
    } catch (err) {
      sections.errorCount++;
      console.error(`Error handling ${email.subject} from ${email.from}:`, (err as Error).message);
    }
  }

  const usage = getTotalUsage();
  const digest = formatDigestPlain(sections, usage);
  console.log("\n========== DIGEST ==========");
  console.log(digest);
  console.log("========== END ==========\n");

  console.log("Token usage:", JSON.stringify(usage, null, 2));
  writeUsageLog(usage);

  if (DRY_RUN) {
    console.log("DRY RUN — not sending to Telegram.");
  } else {
    if (fresh.length > 0 && sections.errorCount === fresh.length) {
      console.error(
        "All emails failed during processing; skipping Telegram send and daily sent marker so scheduled catch-up can retry."
      );
      cleanupOldRows(90);
      closeDb();
      process.exitCode = 1;
      return;
    }
    await sendTelegram(digest);
    if (scheduledDate) markDailyDigestRun(scheduledDate.dateKey);
    console.log("Digest sent to Telegram.");
  }

  cleanupOldRows(90);
  closeDb();
}

async function handleEmail(email: FetchedEmail, out: DigestSections): Promise<void> {
  const fromLabel = email.fromName ? `${email.fromName}` : email.from;

  const hard = hardMatchSender(email);
  if (hard === "barrons_premium") {
    const analysis = await analyzeBarronsPremium(email);
    out.barronsPremium.push({ subject: email.subject, analysis });
    return;
  }
  if (hard === "barrons_daily") {
    const summary = await summarizeBarronsDaily(email);
    out.barronsDaily.push({ subject: email.subject, summary });
    return;
  }
  if (hard === "usps") {
    const extract = await extractUsps(email);
    out.usps.push({ subject: email.subject, extract });
    return;
  }

  const triage = await triageEmail(email);
  if (triage.route === "spam") {
    out.spamCount++;
    return;
  }
  if (triage.route === "low") {
    out.lowCount++;
    return;
  }

  const summary = await summarizeGeneric(email);
  if (summary.trim().toUpperCase().startsWith("SKIP")) {
    out.lowCount++;
    return;
  }

  if (triage.route === "important") {
    out.important.push({ from: fromLabel, subject: email.subject, summary });
  } else {
    out.lowCount++;
  }
}

function getScheduledRunDate(now: Date): { dateKey: string; isDue: boolean; timeLabel: string; targetLabel: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.schedule.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const targetHour = config.schedule.hour;

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    isDue: hour >= targetHour,
    timeLabel: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    targetLabel: `${String(targetHour).padStart(2, "0")}:00`,
  };
}

function writeUsageLog(usage: ReturnType<typeof getTotalUsage>): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...usage }) + "\n";
    fs.appendFileSync(path.join(LOG_DIR, "usage.jsonl"), line);
  } catch (err) {
    console.error("Failed to write usage log:", (err as Error).message);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
