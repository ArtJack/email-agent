import test from "node:test";
import assert from "node:assert/strict";
import { sendTelegram } from "../../src/telegram/send.js";

test("sendTelegram posts each chunk to the Telegram Bot API", async () => {
  const calls: Array<{ url: string; body: any }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await sendTelegram(`first${"\n\n"}${"x".repeat(4100)}`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\.telegram\.org\/bot.+\/sendMessage/);
  assert.equal(calls[0].body.disable_web_page_preview, true);
  assert.equal(typeof calls[0].body.chat_id, "string");
  assert.ok(calls[0].body.text.length <= 4000);
  assert.ok(calls[1].body.text.length <= 4000);
});

test("sendTelegram surfaces Telegram API failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("chat not found", { status: 400 })) as typeof fetch;

  try {
    await assert.rejects(() => sendTelegram("hello"), /Telegram sendMessage failed: 400 chat not found/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
