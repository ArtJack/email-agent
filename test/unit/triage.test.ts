import test from "node:test";
import assert from "node:assert/strict";
import { hardMatchSender, stripHtml } from "../../src/claude/triage.js";
import { makeEmail } from "../helpers/email.js";

test("stripHtml removes scripts, styles, tags, and repeated whitespace", () => {
  const text = stripHtml(`
    <html>
      <style>.hidden { color: red; }</style>
      <script>alert("nope")</script>
      <body><p>Hello <strong>there</strong></p><p>Balance alert</p></body>
    </html>
  `);

  assert.equal(text, "Hello there Balance alert");
});

test("hardMatchSender routes configured VIP senders before model triage", () => {
  assert.equal(hardMatchSender(makeEmail({ from: "barronsstats@barrons.com" })), "barrons_premium");
  assert.equal(hardMatchSender(makeEmail({ from: "access@barrons.com" })), "barrons_daily");
  assert.equal(
    hardMatchSender(makeEmail({ from: "uspsinformeddelivery@email.informeddelivery.usps.com" })),
    "usps"
  );
  assert.equal(hardMatchSender(makeEmail({ from: "person@example.com" })), null);
});
