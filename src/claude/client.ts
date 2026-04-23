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
