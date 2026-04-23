import { config } from "../config.js";
import type { FetchedEmail } from "../email/imap.js";
import { askClaude } from "./client.js";
import { stripHtml } from "./triage.js";

const SUMMARY_SYSTEM = `You are summarizing a single email for a busy professional's daily digest.

Write ONE sentence (max 25 words) that captures:
- What it is
- What matters about it (action required? just informational?)

No greeting, no preamble, no "the email says". Just the sentence. If the email is pure marketing with no useful content, return: SKIP`;

export async function summarizeGeneric(email: FetchedEmail): Promise<string> {
  const body = email.text || stripHtml(email.html);
  const snippet = body.slice(0, 3000);
  const result = await askClaude({
    model: config.models.summary,
    system: SUMMARY_SYSTEM,
    user: `From: ${email.fromName} <${email.from}>\nSubject: ${email.subject}\n\n${snippet}`,
    maxTokens: 120,
  });
  return result.trim();
}
