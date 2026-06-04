import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { formatDigestPlain, type DigestSections } from "../src/digest/format.js";
import { escapeMarkdownV2 } from "../src/telegram/send.js";

interface Summary {
  samples: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
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

function benchmark(name: string, iterations: number, thresholdP95Ms: number, fn: (index: number) => void): void {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const started = performance.now();
    fn(index);
    samples.push(performance.now() - started);
  }

  const result = summarize(samples);
  printResult(name, result, thresholdP95Ms);
  assert.ok(result.p95Ms <= thresholdP95Ms, `${name} p95 ${result.p95Ms.toFixed(3)}ms exceeded ${thresholdP95Ms}ms`);
}

function printResult(name: string, result: Summary, thresholdP95Ms: number): void {
  console.log(
    `${name}: samples=${result.samples} avg=${result.averageMs.toFixed(3)}ms p50=${result.p50Ms.toFixed(3)}ms ` +
      `p95=${result.p95Ms.toFixed(3)}ms max=${result.maxMs.toFixed(3)}ms threshold_p95=${thresholdP95Ms}ms`
  );
}

const sections: DigestSections = {
  date: new Date("2026-05-30T17:00:00Z"),
  barronsPremium: [{ subject: "Market Lab", analysis: "• WATCH: Rates — monitor policy changes." }],
  barronsDaily: [{ subject: "Daily", summary: "Stocks rose while breadth weakened." }],
  usps: [],
  important: Array.from({ length: 10 }, (_, index) => ({
    from: `Sender ${index}`,
    subject: `Important message ${index}`,
    summary: "A representative digest summary with a concrete action required today.",
  })),
  lowCount: 20,
  spamCount: 10,
  errorCount: 0,
  totalEmails: 42,
};

console.log("Local performance benchmark");
benchmark("digest format", 5_000, 2, () => {
  formatDigestPlain(sections, { byModel: { "llama3.1": { in: 30_000, out: 700, calls: 32 } }, calls: 32 });
});

benchmark("telegram markdown escape", 5_000, 2, () => {
  escapeMarkdownV2("Balance $9.00 (acct_1005) - urgent! [review](https://example.com).".repeat(20));
});

const originalCwd = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "email-agent-perf-"));
fs.mkdirSync(path.join(tmp, "data"));
process.chdir(tmp);

try {
  const db = await import(`../src/state/db.ts?perf=${Date.now()}`);
  benchmark("sqlite markProcessed", 1_000, 5, (index) => {
    db.markProcessed(`<perf-${index}@example.com>`, "done");
  });
  benchmark("sqlite isProcessed", 1_000, 2, (index) => {
    assert.equal(db.isProcessed(`<perf-${index}@example.com>`), true);
  });
  db.closeDb();
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("Local performance thresholds passed.");
