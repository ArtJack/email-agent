import type { FetchedEmail } from "../../src/email/imap.js";

export function makeEmail(overrides: Partial<FetchedEmail> = {}): FetchedEmail {
  return {
    uid: 1,
    messageId: "<test@example.com>",
    from: "sender@example.com",
    fromName: "Sender",
    subject: "Test subject",
    date: new Date("2026-05-30T12:00:00Z"),
    text: "Plain text body",
    html: "",
    ...overrides,
  };
}
