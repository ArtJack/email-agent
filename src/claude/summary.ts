import { config } from "../config.js";
import type { FetchedEmail } from "../email/imap.js";
import { askClaude } from "./client.js";
import { stripHtml } from "./triage.js";

const SYSTEM = `Summarize this email in ONE sentence (max 25 words) that tells the reader what it is and whether they need to act.

No greeting, no preamble, no "the email says". Just the sentence. If it's pure marketing with nothing useful, return: SKIP`;

export async function summarize(email: FetchedEmail): Promise<string> {
  const body = email.text || stripHtml(email.html);
  const snippet = body.slice(0, 3000);
  const result = await askClaude({
    model: config.models.summary,
    system: SYSTEM,
    user: `From: ${email.fromName} <${email.from}>\nSubject: ${email.subject}\n\n${snippet}`,
    maxTokens: 120,
  });
  return result.trim();
}
