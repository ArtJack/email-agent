import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  model: string;
}

const usageLog: Usage[] = [];

export function recordUsage(u: Usage): void {
  usageLog.push(u);
}

export function getTotalUsage(): { byModel: Record<string, { in: number; out: number; calls: number }>; calls: number } {
  const byModel: Record<string, { in: number; out: number; calls: number }> = {};
  for (const u of usageLog) {
    byModel[u.model] ??= { in: 0, out: 0, calls: 0 };
    byModel[u.model].in += u.input_tokens;
    byModel[u.model].out += u.output_tokens;
    byModel[u.model].calls += 1;
  }
  return { byModel, calls: usageLog.length };
}

// USD per 1M tokens. Update if Anthropic changes prices.
const PRICES_PER_MTOK: Record<string, { in: number; out: number }> = {
  "claude-opus-4-7": { in: 15, out: 75 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

export function estimateCostUsd(usage: ReturnType<typeof getTotalUsage>): number {
  let cost = 0;
  for (const [model, counts] of Object.entries(usage.byModel)) {
    const price = PRICES_PER_MTOK[model] ?? PRICES_PER_MTOK["claude-haiku-4-5-20251001"];
    cost += (counts.in / 1_000_000) * price.in + (counts.out / 1_000_000) * price.out;
  }
  return cost;
}

export async function askClaude(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const resp = await anthropic.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  recordUsage({
    input_tokens: resp.usage.input_tokens,
    output_tokens: resp.usage.output_tokens,
    model: opts.model,
  });
  const first = resp.content[0];
  if (first?.type !== "text") return "";
  return first.text;
}
