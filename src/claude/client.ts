import { config } from "../config.js";

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

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string } | string;
}

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 120_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Routes through the LiteLLM proxy (OpenAI-compatible) on the Alienware AI lab.
// LiteLLM maps model aliases (e.g. "llama3.1") to local Ollama by default and
// only to paid providers when explicitly requested — keeping inference free.
//
// Transport over the Windows netsh portproxy + WSL2 NAT can occasionally drop a
// reused keep-alive socket ("fetch failed"), so transient failures (network /
// timeout / 5xx) are retried with backoff. Client errors (4xx) fail fast.
export async function askModel(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    temperature: 0.1,
    max_tokens: opts.maxTokens ?? 1024,
  });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${config.litellm.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.litellm.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Transport-level failure (fetch failed / timeout / connection reset).
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(attempt * 750);
        continue;
      }
      break;
    }

    if (!res.ok) {
      const detail = await res.text();
      if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
        lastErr = new Error(`LiteLLM chat failed: ${res.status} ${detail}`);
        await sleep(attempt * 750);
        continue;
      }
      throw new Error(`LiteLLM chat failed: ${res.status} ${detail}`);
    }

    const resp = (await res.json()) as OpenAIChatResponse;
    if (resp.error) {
      const msg = typeof resp.error === "string" ? resp.error : resp.error.message;
      throw new Error(`LiteLLM chat failed: ${msg ?? "unknown error"}`);
    }

    recordUsage({
      input_tokens: resp.usage?.prompt_tokens ?? 0,
      output_tokens: resp.usage?.completion_tokens ?? 0,
      model: opts.model,
    });

    return resp.choices?.[0]?.message?.content?.trim() ?? "";
  }

  throw new Error(
    `LiteLLM chat failed after ${MAX_ATTEMPTS} attempts: ${(lastErr as Error)?.message ?? String(lastErr)}`
  );
}
