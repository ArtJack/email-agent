import { config } from "../config.js";

const TG_LIMIT = 4000;

export function escapeMarkdownV2(text: string): string {
  return text.replace(/([_\*\[\]\(\)~`>#+\-=|{}.!\\])/g, "\\$1");
}

function chunk(text: string, limit = TG_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

export async function sendTelegram(text: string, opts: { markdown?: boolean } = {}): Promise<void> {
  const chunks = chunk(text);
  for (const part of chunks) {
    const body: Record<string, unknown> = {
      chat_id: config.telegram.chatId,
      text: part,
      disable_web_page_preview: true,
    };
    if (opts.markdown) body.parse_mode = "MarkdownV2";

    const res = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Telegram sendMessage failed: ${res.status} ${detail}`);
    }
  }
}
