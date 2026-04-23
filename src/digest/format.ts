import { config } from "../config.js";
import type { UspsExtract } from "../claude/usps-extractor.js";
import { estimateCostUsd, getTotalUsage } from "../claude/client.js";

export interface DigestSections {
  date: Date;
  barronsPremium: { subject: string; analysis: string }[];
  barronsDaily: { subject: string; summary: string }[];
  usps: { subject: string; extract: UspsExtract }[];
  important: { from: string; subject: string; summary: string }[];
  lowCount: number;
  spamCount: number;
  errorCount: number;
  totalEmails: number;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
}

function formatCostLine(usage: ReturnType<typeof getTotalUsage>): string {
  const cost = estimateCostUsd(usage);
  let totalIn = 0;
  let totalOut = 0;
  for (const counts of Object.values(usage.byModel)) {
    totalIn += counts.in;
    totalOut += counts.out;
  }
  return `💰 $${cost.toFixed(4)} · ${formatTokens(totalIn)} in / ${formatTokens(totalOut)} out · ${usage.calls} calls`;
}

export function formatDigestPlain(d: DigestSections, usage?: ReturnType<typeof getTotalUsage>): string {
  const lines: string[] = [];
  const dateStr = d.date.toLocaleDateString("en-US", {
    timeZone: config.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  lines.push(`📬 Daily Email Digest — ${dateStr}`);
  lines.push(`Processed ${d.totalEmails} emails in the last ${config.lookbackHours}h`);
  lines.push("");

  if (d.barronsPremium.length > 0) {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("📊 BARRON'S (PREMIUM ANALYSIS)");
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    for (const b of d.barronsPremium) {
      lines.push(`» ${b.subject}`);
      lines.push(b.analysis);
      lines.push("");
    }
  }

  if (d.barronsDaily.length > 0) {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`📰 BARRON'S DAILY (${d.barronsDaily.length})`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    for (const b of d.barronsDaily) {
      lines.push(`• ${b.summary}`);
    }
    lines.push("");
  }

  if (d.usps.length > 0) {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push("📮 USPS — EXPECTED TODAY");
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    for (const u of d.usps) {
      if (u.extract.letters.length === 0 && u.extract.packages.length === 0) {
        lines.push("(No mail pieces detected in the USPS scan)");
      }
      for (const letter of u.extract.letters) {
        lines.push(`• ${letter.sender} — ${letter.type}`);
      }
      for (const pkg of u.extract.packages) {
        lines.push(`📦 ${pkg.description}`);
      }
      const total = u.extract.totals.letters_count + u.extract.totals.packages_count;
      if (total > 0) lines.push(`Total: ${u.extract.totals.letters_count} letters, ${u.extract.totals.packages_count} packages`);
      lines.push("");
    }
  }

  if (d.important.length > 0) {
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    lines.push(`🔔 IMPORTANT (${d.important.length})`);
    lines.push("━━━━━━━━━━━━━━━━━━━━");
    for (const e of d.important) {
      lines.push(`• ${e.from}: ${e.summary}`);
      lines.push(`  └ re: ${e.subject}`);
    }
    lines.push("");
  }

  const tail: string[] = [];
  if (d.lowCount > 0) tail.push(`+${d.lowCount} low-priority filed`);
  if (d.spamCount > 0) tail.push(`🗑 ${d.spamCount} spam/promo filtered`);
  if (d.errorCount > 0) tail.push(`⚠️ ${d.errorCount} processing errors`);
  if (tail.length > 0) lines.push(tail.join(" · "));

  if (usage) {
    lines.push("");
    lines.push(formatCostLine(usage));
  }

  return lines.join("\n");
}
