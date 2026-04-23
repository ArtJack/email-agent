import { config } from "../config.js";
import type { FetchedEmail } from "../email/imap.js";
import { askClaude } from "./client.js";

export type Route = "barrons_premium" | "barrons_daily" | "usps" | "spam" | "important" | "noteworthy" | "low";

export interface TriageResult {
  route: Route;
  reason: string;
}

export function hardMatchSender(email: FetchedEmail): Route | null {
  const from = email.from.toLowerCase();
  if (config.vipSenders.barronsPremium.includes(from)) return "barrons_premium";
  if (config.vipSenders.barronsDaily.includes(from)) return "barrons_daily";
  if (config.vipSenders.usps.includes(from)) return "usps";
  return null;
}

const TRIAGE_SYSTEM = `You are an email triage assistant. Classify a single email into one of:
- "spam": scam, phishing, marketing junk, unsolicited promotions, obvious bulk mail
- "important": action required, time-sensitive, personal, financial, security, account-related, from a known person/business with real content
- "noteworthy": legitimate but informational — newsletters, receipts, confirmations, notifications worth a one-line mention
- "low": background notifications of zero interest (automated "email preferences updated", social media ambient noise, etc.)

Return ONLY valid JSON of shape: {"route":"...","reason":"<one short phrase>"}`;

export async function triageEmail(email: FetchedEmail): Promise<TriageResult> {
  const hard = hardMatchSender(email);
  if (hard) return { route: hard, reason: "hard-matched VIP sender" };

  const snippet = (email.text || stripHtml(email.html)).slice(0, 2000);
  const user = `From: ${email.fromName} <${email.from}>
Subject: ${email.subject}

${snippet}`;

  const raw = await askClaude({
    model: config.models.triage,
    system: TRIAGE_SYSTEM,
    user,
    maxTokens: 150,
  });

  const parsed = safeJson(raw);
  if (!parsed || typeof parsed.route !== "string") {
    return { route: "noteworthy", reason: "triage parse fallback" };
  }
  const route = ["spam", "important", "noteworthy", "low"].includes(parsed.route)
    ? (parsed.route as Route)
    : "noteworthy";
  return { route, reason: String(parsed.reason ?? "") };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeJson(raw: string): { route?: string; reason?: string } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export { stripHtml };
