import test from "node:test";
import assert from "node:assert/strict";
import { escapeMarkdownV2 } from "../../src/telegram/send.js";

test("escapeMarkdownV2 escapes Telegram MarkdownV2 control characters", () => {
  assert.equal(
    escapeMarkdownV2("Balance $9.00 (acct_1005) - urgent!"),
    "Balance $9\\.00 \\(acct\\_1005\\) \\- urgent\\!"
  );
});
