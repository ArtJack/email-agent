import { config } from "../config.js";
import { estimateCostUsd, getTotalUsage } from "../claude/client.js";

export interface DigestSections {
  date: Date;
  important: { from: string; subject: string; summary: string }[];
  lowCount: number;
  spamCount: number;
  errorCount: number;
  totalEmails: number;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
}

function costLine(usage: ReturnType<typeof getTotalUsage>): string {
  const cost = estimateCostUsd(usage);
  let tIn = 0;
  let tOut = 0;
  for (const c of Object.values(usage.byModel)) {
    tIn += c.in;
    tOut += c.out;
  }
  return `$${cost.toFixed(4)} · ${formatTokens(tIn)} in / ${formatTokens(tOut)} out · ${usage.calls} calls`;
}

export function formatDigest(d: DigestSections, usage?: ReturnType<typeof getTotalUsage>): string {
  const lines: string[] = [];
  const dateStr = d.date.toLocaleDateString("en-US", {
    timeZone: config.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  lines.push(`Daily Email Digest — ${dateStr}`);
  lines.push(`${d.totalEmails} email(s) in the last ${config.lookbackHours}h`);
  lines.push("");

  if (d.important.length === 0) {
    lines.push("Nothing important.");
  } else {
    lines.push(`Important (${d.important.length}):`);
    lines.push("");
    for (const e of d.important) {
      lines.push(`• ${e.from}: ${e.summary}`);
      lines.push(`  — ${e.subject}`);
    }
  }

  const tail: string[] = [];
  if (d.lowCount > 0) tail.push(`${d.lowCount} low-priority`);
  if (d.spamCount > 0) tail.push(`${d.spamCount} spam/promo`);
  if (d.errorCount > 0) tail.push(`${d.errorCount} errors`);
  if (tail.length > 0) {
    lines.push("");
    lines.push("Filtered: " + tail.join(" · "));
  }

  if (usage) {
    lines.push("");
    lines.push(costLine(usage));
  }

  return lines.join("\n");
}
