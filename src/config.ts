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
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    user: required("YAHOO_USER"),
    pass: required("YAHOO_APP_PASSWORD"),
  },

  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    chatId: required("TELEGRAM_CHAT_ID"),
  },

  models: {
    triage: optional("TRIAGE_MODEL", "claude-haiku-4-5-20251001"),
    barronsPremium: optional("BARRONS_PREMIUM_MODEL", "claude-opus-4-7"),
    barronsDaily: optional("BARRONS_DAILY_MODEL", "claude-haiku-4-5-20251001"),
    summary: optional("SUMMARY_MODEL", "claude-haiku-4-5-20251001"),
  },

  lookbackHours: Number(optional("LOOKBACK_HOURS", "26")),
  timezone: optional("TZ", "America/New_York"),

  vipSenders: {
    barronsPremium: ["barronsstats@barrons.com"],
    barronsDaily: ["access@barrons.com"],
    usps: ["uspsinformeddelivery@email.informeddelivery.usps.com"],
  },
};

export function validateConfigOrExit(): void {
  try {
    void config.imap.user;
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
