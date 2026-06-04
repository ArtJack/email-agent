import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";

dotenv.config({ override: true, quiet: true });

interface Summary {
  samples: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  assert.ok(value, `Missing required env var: ${name}`);
  return value;
}

function summarize(samples: number[]): Summary {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return {
    samples: sorted.length,
    averageMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted[sorted.length - 1],
  };
}

async function benchmark(
  name: string,
  iterations: number,
  thresholdP95Ms: number,
  fn: () => Promise<void>
): Promise<void> {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const started = performance.now();
    await fn();
    samples.push(performance.now() - started);
  }

  const result = summarize(samples);
  console.log(
    `${name}: samples=${result.samples} avg=${result.averageMs.toFixed(1)}ms p50=${result.p50Ms.toFixed(1)}ms ` +
      `p95=${result.p95Ms.toFixed(1)}ms max=${result.maxMs.toFixed(1)}ms threshold_p95=${thresholdP95Ms}ms`
  );
  assert.ok(result.p95Ms <= thresholdP95Ms, `${name} p95 ${result.p95Ms.toFixed(1)}ms exceeded ${thresholdP95Ms}ms`);
}

const samples = Number(process.env.PERF_LIVE_SAMPLES ?? "3");
const litellmBaseUrl = process.env.LITELLM_BASE_URL?.trim() || "http://192.168.1.159:4000";
const litellmKey = required("LITELLM_MASTER_KEY");
const model = process.env.TRIAGE_MODEL?.trim() || "llama3.1";

console.log(`Live performance benchmark: samples=${samples} model=${model}`);

await benchmark("imap connect + status", samples, Number(process.env.PERF_IMAP_P95_MS ?? "5000"), async () => {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST?.trim() || "imap.mail.yahoo.com",
    port: Number(process.env.IMAP_PORT?.trim() || "993"),
    secure: true,
    auth: {
      user: process.env.YAHOO_USER?.trim() || required("IMAP_USER"),
      pass: process.env.YAHOO_APP_PASSWORD?.trim() || required("IMAP_PASSWORD"),
    },
    logger: false,
  });

  await client.connect();
  try {
    await client.status("INBOX", { messages: true, unseen: true });
  } finally {
    await client.logout();
  }
});

await benchmark("litellm model list", samples, Number(process.env.PERF_LITELLM_LIST_P95_MS ?? "3000"), async () => {
  const response = await fetch(`${litellmBaseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${litellmKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.ok, true, `LiteLLM /v1/models returned ${response.status}`);
  await response.text();
});

await benchmark("litellm chat completion", samples, Number(process.env.PERF_LITELLM_CHAT_P95_MS ?? "30000"), async () => {
  const response = await fetch(`${litellmBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${litellmKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with OK only." }],
      max_tokens: 4,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const detail = await response.text();
  assert.equal(response.ok, true, `LiteLLM chat completion returned ${response.status}: ${detail}`);
});

console.log("Live performance thresholds passed.");
