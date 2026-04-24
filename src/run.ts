import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { fetchRecentEmails, testConnection, type FetchedEmail } from "./email/imap.js";
import { isProcessed, markProcessed, cleanupOldRows, closeDb } from "./state/db.js";
import { triage } from "./claude/triage.js";
import { summarize } from "./claude/summary.js";
import { formatDigest, type DigestSections } from "./digest/format.js";
import { sendTelegram } from "./telegram/send.js";
import { getTotalUsage } from "./claude/client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../logs");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const TEST_CONN = args.has("--test-connection");

async function main(): Promise<void> {
  if (TEST_CONN) {
    await testConnection();
    return;
  }

  console.log(`[${new Date().toISOString()}] Starting run${DRY_RUN ? " (dry-run)" : ""}`);

  const emails = await fetchRecentEmails(config.lookbackHours);
  console.log(`Fetched ${emails.length} email(s) from the last ${config.lookbackHours}h`);

  const fresh = emails.filter((e) => !isProcessed(e.messageId));
  console.log(`${fresh.length} new, ${emails.length - fresh.length} already processed`);

  const sections: DigestSections = {
    date: new Date(),
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
      console.error(`Error handling "${email.subject}" from ${email.from}:`, (err as Error).message);
    }
  }

  const usage = getTotalUsage();
  const digest = formatDigest(sections, usage);
  console.log("\n" + digest + "\n");

  writeUsageLog(usage);

  if (DRY_RUN) {
    console.log("Dry-run — not sending to Telegram.");
  } else if (fresh.length === 0) {
    console.log("No new emails — skipping Telegram send.");
  } else {
    await sendTelegram(digest);
    console.log("Digest sent.");
  }

  cleanupOldRows(90);
  closeDb();
}

async function handleEmail(email: FetchedEmail, out: DigestSections): Promise<void> {
  const { route } = await triage(email);

  if (route === "spam") {
    out.spamCount++;
    return;
  }
  if (route === "low") {
    out.lowCount++;
    return;
  }

  const summary = await summarize(email);
  if (summary.trim().toUpperCase().startsWith("SKIP")) {
    out.lowCount++;
    return;
  }

  out.important.push({
    from: email.fromName || email.from,
    subject: email.subject,
    summary,
  });
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
  console.error("Fatal:", err);
  process.exit(1);
});
