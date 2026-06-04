import dotenv from "dotenv";
dotenv.config({ override: true, quiet: true });

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

const timezone = optional("TZ", "America/New_York");

export const config = {
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

  litellm: {
    baseUrl: optional("LITELLM_BASE_URL", "http://192.168.1.159:4000"),
    apiKey: optional("LITELLM_MASTER_KEY", ""),
  },

  models: {
    triage: optional("TRIAGE_MODEL", "llama3.1"),
    barronsPremium: optional("BARRONS_PREMIUM_MODEL", "llama3.1"),
    barronsDaily: optional("BARRONS_DAILY_MODEL", "llama3.1"),
    summary: optional("SUMMARY_MODEL", "llama3.1"),
  },

  lookbackHours: Number(optional("LOOKBACK_HOURS", "26")),
  timezone,
  schedule: {
    hour: Number(optional("SCHEDULE_HOUR", "10")),
    timezone: optional("SCHEDULE_TZ", timezone),
  },

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
