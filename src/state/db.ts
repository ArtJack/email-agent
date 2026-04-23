import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/state.db");

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

export function cleanupOldRows(olderThanDays = 90): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const info = getDb().prepare("DELETE FROM processed WHERE processed_at < ?").run(cutoff);
  return info.changes;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
