import { config } from "../config.js";
import type { FetchedEmail } from "../email/imap.js";
import { askClaude } from "./client.js";

export type Route = "spam" | "important" | "low";

export interface TriageResult {
  route: Route;
  reason: string;
}

const SYSTEM = `You classify a single email into exactly one of:
- "important": action required, time-sensitive, personal, financial, security, or account-related — something a real person needs to see today
- "low": newsletters, receipts, confirmations, routine notifications — legitimate but not worth reading
- "spam": promotions, marketing, phishing, bulk junk

Return ONLY valid JSON: {"route":"...","reason":"<short phrase>"}`;

export async function triage(email: FetchedEmail): Promise<TriageResult> {
  const snippet = (email.text || stripHtml(email.html)).slice(0, 2000);
  const raw = await askClaude({
    model: config.models.triage,
    system: SYSTEM,
    user: `From: ${email.fromName} <${email.from}>\nSubject: ${email.subject}\n\n${snippet}`,
    maxTokens: 150,
  });

  const parsed = safeJson(raw);
  if (!parsed || !["spam", "important", "low"].includes(parsed.route ?? "")) {
    return { route: "low", reason: "triage fallback" };
  }
  return { route: parsed.route as Route, reason: String(parsed.reason ?? "") };
}

export function stripHtml(html: string): string {
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
