import { config } from "../config.js";
import type { FetchedEmail } from "../email/imap.js";
import { askClaude } from "./client.js";
import { stripHtml } from "./triage.js";

const USPS_SYSTEM = `You extract the list of expected mail pieces from a USPS Informed Delivery email.

The email contains grayscale scans of envelope fronts and sometimes explicit sender names, plus a mailpieces count and separate notifications for packages.

Return ONLY valid JSON of this exact shape:
{
  "letters": [
    { "sender": "<visible sender name, or 'Unknown' if no name is readable>", "type": "<bill|personal|advertising|government|financial|healthcare|unknown>" }
  ],
  "packages": [
    { "description": "<one short phrase e.g. 'Amazon — arriving today'>" }
  ],
  "totals": { "letters_count": <number>, "packages_count": <number> }
}

No prose, no markdown, just JSON.`;

export interface UspsExtract {
  letters: { sender: string; type: string }[];
  packages: { description: string }[];
  totals: { letters_count: number; packages_count: number };
}

export async function extractUsps(email: FetchedEmail): Promise<UspsExtract> {
  const body = email.text || stripHtml(email.html);
  const raw = await askClaude({
    model: config.models.summary,
    system: USPS_SYSTEM,
    user: `Subject: ${email.subject}\n\n${body.slice(0, 15000)}`,
    maxTokens: 800,
  });
  const parsed = safeJson(raw);
  if (!parsed) {
    return { letters: [], packages: [], totals: { letters_count: 0, packages_count: 0 } };
  }
  return {
    letters: Array.isArray(parsed.letters) ? parsed.letters : [],
    packages: Array.isArray(parsed.packages) ? parsed.packages : [],
    totals: parsed.totals ?? { letters_count: 0, packages_count: 0 },
  };
}

function safeJson(raw: string): any {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
