import { config } from "../config.js";
import type { FetchedEmail } from "../email/imap.js";
import { askClaude } from "./client.js";
import { stripHtml } from "./triage.js";

const BARRONS_PREMIUM_SYSTEM = `You are a senior economist with 30 years of experience across macro policy, equities, portfolio construction, and risk. You have read Barron's every week for three decades. You know what matters and what is filler.

Output MUST be:
- Bullets only, action-first
- Each bullet ≤ 18 words
- Max 6 bullets total
- Under 180 words
- No preamble, no disclaimers, no section headers

Use only these tag prefixes — emit a tag ONLY if the newsletter gives you a concrete call:
📈 BUY: <ticker> at <price/condition> — <one-line thesis>
⚠️ TRIM: <ticker/sector> — <specific reason>
🛢 WATCH: <asset/event> — <what to look for>
🚫 SKIP: <story> — <why it's noise>
💡 THEME: <multi-ticker theme> — <what unites them>
🧭 MACRO: <single macro read> — <portfolio implication>

Be blunt. Specific tickers, specific prices/levels where the data supports it. No hedge-speak. No "as an AI" language. If the newsletter has no actionable signal, return exactly: (No actionable signal this week.)`;

const BARRONS_DAILY_SYSTEM = `Compress this Barron's daily newsletter to ONE sentence (max 25 words), action-first if there is one, topic-first otherwise. No preamble. Just the sentence.`;

export async function analyzeBarronsPremium(email: FetchedEmail): Promise<string> {
  const body = email.text || stripHtml(email.html);
  return await askClaude({
    model: config.models.barronsPremium,
    system: BARRONS_PREMIUM_SYSTEM,
    user: `Subject: ${email.subject}\n\n${body.slice(0, 25000)}`,
    maxTokens: 600,
  });
}

export async function summarizeBarronsDaily(email: FetchedEmail): Promise<string> {
  const body = email.text || stripHtml(email.html);
  return await askClaude({
    model: config.models.barronsDaily,
    system: BARRONS_DAILY_SYSTEM,
    user: `Subject: ${email.subject}\n\n${body.slice(0, 4000)}`,
    maxTokens: 80,
  });
}
