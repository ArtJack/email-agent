import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("state db persists processed messages and daily digest run markers", async () => {
  const originalCwd = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "email-agent-db-"));
  fs.mkdirSync(path.join(tmp, "data"));
  process.chdir(tmp);

  try {
    const db = await import(`../../src/state/db.ts?test=${Date.now()}`);

    assert.equal(db.isProcessed("<message-1@example.com>"), false);
    db.markProcessed("<message-1@example.com>", "done");
    db.markProcessed("<message-1@example.com>", "done");
    assert.equal(db.isProcessed("<message-1@example.com>"), true);

    assert.equal(db.hasDailyDigestRun("2026-05-30"), false);
    db.markDailyDigestRun("2026-05-30");
    assert.equal(db.hasDailyDigestRun("2026-05-30"), true);

    db.closeDb();
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
