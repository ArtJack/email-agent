import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("compiled runtime contains the all-fail retry guard", () => {
  const bundle = fs.readFileSync("dist/run.cjs", "utf8");

  assert.match(bundle, /All emails failed during processing/);
  assert.match(bundle, /skipping Telegram send and daily sent marker/);
});

test("launchd template runs the bundled scheduled job", () => {
  const template = fs.readFileSync("launchd/email-agent.plist.template", "utf8");

  assert.match(template, /__RUNTIME_DIR__\/dist\/run\.cjs/);
  assert.match(template, /--scheduled/);
  assert.match(template, /StartCalendarInterval/);
});
