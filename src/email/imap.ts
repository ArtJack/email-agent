import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "../config.js";

export interface FetchedEmail {
  uid: number;
  messageId: string;
  from: string;
  fromName: string;
  subject: string;
  date: Date;
  text: string;
  html: string;
}

export async function fetchRecentEmails(lookbackHours: number): Promise<FetchedEmail[]> {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
  });

  const results: FetchedEmail[] = [];
  await client.connect();

  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
      const uids = await client.search({ since }, { uid: true });
      if (!uids || uids.length === 0) return [];

      for await (const msg of client.fetch(
        uids as number[],
        { uid: true, source: true, envelope: true },
        { uid: true }
      )) {
        try {
          const parsed = await simpleParser(msg.source as Buffer);
          const fromAddr = parsed.from?.value?.[0];
          results.push({
            uid: msg.uid,
            messageId: parsed.messageId ?? `no-id-${msg.uid}`,
            from: (fromAddr?.address ?? "").toLowerCase(),
            fromName: fromAddr?.name ?? "",
            subject: parsed.subject ?? "(no subject)",
            date: parsed.date ?? new Date(),
            text: parsed.text ?? "",
            html: typeof parsed.html === "string" ? parsed.html : "",
          });
        } catch (err) {
          console.error(`Failed to parse email uid=${msg.uid}:`, (err as Error).message);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return results;
}

export async function testConnection(): Promise<void> {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.imap.user, pass: config.imap.pass },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const status = await client.status("INBOX", { messages: true, unseen: true });
  lock.release();
  await client.logout();
  console.log(`IMAP OK. INBOX: ${status.messages} messages, ${status.unseen} unread.`);
}
