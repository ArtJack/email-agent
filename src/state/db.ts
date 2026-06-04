import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.resolve(process.cwd(), "data/state.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed (
      message_id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL,
      route TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_processed_at ON processed(processed_at);

    CREATE TABLE IF NOT EXISTS daily_digest_runs (
      run_date TEXT PRIMARY KEY,
      sent_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function isProcessed(messageId: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM processed WHERE message_id = ?").get(messageId);
  return row !== undefined;
}

export function markProcessed(messageId: string, route: string): void {
  getDb()
    .prepare("INSERT OR IGNORE INTO processed (message_id, processed_at, route) VALUES (?, ?, ?)")
    .run(messageId, Date.now(), route);
}

export function hasDailyDigestRun(runDate: string): boolean {
  const row = getDb().prepare("SELECT 1 FROM daily_digest_runs WHERE run_date = ?").get(runDate);
  return row !== undefined;
}

export function markDailyDigestRun(runDate: string): void {
  getDb()
    .prepare("INSERT OR REPLACE INTO daily_digest_runs (run_date, sent_at) VALUES (?, ?)")
    .run(runDate, Date.now());
}

export function cleanupOldRows(olderThanDays = 90): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const processedInfo = getDb().prepare("DELETE FROM processed WHERE processed_at < ?").run(cutoff);
  const digestInfo = getDb().prepare("DELETE FROM daily_digest_runs WHERE sent_at < ?").run(cutoff);
  return processedInfo.changes + digestInfo.changes;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
