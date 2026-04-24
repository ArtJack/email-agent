import dotenv from "dotenv";
dotenv.config({ override: true });

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const config = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),

  imap: {
    host: optional("IMAP_HOST", "imap.mail.yahoo.com"),
    port: Number(optional("IMAP_PORT", "993")),
    secure: true,
    user: required("IMAP_USER"),
    pass: required("IMAP_PASSWORD"),
  },

  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    chatId: required("TELEGRAM_CHAT_ID"),
  },

  models: {
    triage: optional("TRIAGE_MODEL", "claude-haiku-4-5-20251001"),
    summary: optional("SUMMARY_MODEL", "claude-haiku-4-5-20251001"),
  },

  lookbackHours: Number(optional("LOOKBACK_HOURS", "26")),
  timezone: optional("TZ", "America/New_York"),
};
