import test from "node:test";
import assert from "node:assert/strict";
import { formatDigestPlain, type DigestSections } from "../../src/digest/format.js";

test("formatDigestPlain renders sections, counts, and usage", () => {
  const sections: DigestSections = {
    date: new Date("2026-05-30T17:00:00Z"),
    barronsPremium: [{ subject: "Market Lab", analysis: "• WATCH: Rates — policy signal" }],
    barronsDaily: [{ subject: "Daily", summary: "Stocks rose while breadth weakened." }],
    usps: [
      {
        subject: "USPS",
        extract: {
          letters: [{ sender: "PG&E", type: "bill" }],
          packages: [{ description: "USPS package — arriving today" }],
          totals: { letters_count: 1, packages_count: 1 },
        },
      },
    ],
    important: [{ from: "Wells Fargo", subject: "Balance alert", summary: "Account balance is below $10." }],
    lowCount: 3,
    spamCount: 2,
    errorCount: 1,
    totalEmails: 10,
  };

  const digest = formatDigestPlain(sections, {
    byModel: { "llama3.1": { in: 1250, out: 90, calls: 4 } },
    calls: 4,
  });

  assert.match(digest, /Daily Email Digest/);
  assert.match(digest, /Processed 10 emails/);
  assert.match(digest, /BARRON'S \(PREMIUM ANALYSIS\)/);
  assert.match(digest, /USPS — EXPECTED TODAY/);
  assert.match(digest, /IMPORTANT \(1\)/);
  assert.match(digest, /\+3 low-priority filed · 🗑 2 spam\/promo filtered · ⚠️ 1 processing errors/);
  assert.match(digest, /🦙 Ollama local · 1\.3K in \/ 90 out · 4 calls/);
});

test("formatDigestPlain handles an empty digest without fake sections", () => {
  const digest = formatDigestPlain({
    date: new Date("2026-05-30T17:00:00Z"),
    barronsPremium: [],
    barronsDaily: [],
    usps: [],
    important: [],
    lowCount: 0,
    spamCount: 0,
    errorCount: 0,
    totalEmails: 0,
  });

  assert.match(digest, /Processed 0 emails/);
  assert.doesNotMatch(digest, /IMPORTANT/);
  assert.doesNotMatch(digest, /processing errors/);
});
