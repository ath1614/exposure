import type { D1Database } from './env';
import type { Report } from '../core/analyze';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    host TEXT NOT NULL,
    url TEXT NOT NULL,
    score INTEGER NOT NULL,
    grade TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS scans_recent ON scans (created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS scan_rate (
    ip TEXT NOT NULL,
    window INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (ip, window)
  )`,
];

let ready: Promise<unknown> | null = null;

/** Create the tables once per isolate; CREATE IF NOT EXISTS keeps it idempotent. */
export function ensureSchema(db: D1Database): Promise<unknown> {
  if (!ready) {
    ready = db.batch(SCHEMA.map((statement) => db.prepare(statement)));
  }
  return ready;
}

export interface ScanRow {
  id: string;
  host: string;
  url: string;
  score: number;
  grade: string;
  payload: string;
  created_at: number;
}

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

export function scanId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

export async function saveScan(db: D1Database, id: string, report: Report): Promise<void> {
  await db
    .prepare(
      `INSERT INTO scans (id, host, url, score, grade, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      report.host,
      report.finalUrl,
      report.score,
      report.grade,
      JSON.stringify(report),
      Date.now(),
    )
    .run();
}

export async function loadScan(db: D1Database, id: string): Promise<Report | null> {
  const row = await db
    .prepare('SELECT payload FROM scans WHERE id = ?')
    .bind(id)
    .first<{ payload: string }>();
  if (!row) return null;
  return JSON.parse(row.payload) as Report;
}

export interface RecentScan {
  id: string;
  host: string;
  score: number;
  grade: string;
  at: number;
}

export async function recentScans(db: D1Database, limit = 8): Promise<RecentScan[]> {
  const { results } = await db
    .prepare(
      `SELECT id, host, score, grade, created_at
       FROM scans ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; host: string; score: number; grade: string; created_at: number }>();
  return results.map((row) => ({
    id: row.id,
    host: row.host,
    score: row.score,
    grade: row.grade,
    at: row.created_at,
  }));
}

export async function countScans(db: D1Database): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM scans')
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`exposure:${ip}`));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Count this IP's scans in the current ten-minute window. */
export async function bumpRate(db: D1Database, ip: string, windowMs = 600_000): Promise<number> {
  const window = Math.floor(Date.now() / windowMs);
  await db
    .prepare(
      `INSERT INTO scan_rate (ip, window, count) VALUES (?, ?, 1)
       ON CONFLICT(ip, window) DO UPDATE SET count = count + 1`,
    )
    .bind(ip, window)
    .run();
  const row = await db
    .prepare('SELECT count FROM scan_rate WHERE ip = ? AND window = ?')
    .bind(ip, window)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

/** Keep the table tidy without a cron job. */
export async function prune(db: D1Database): Promise<void> {
  await db
    .prepare('DELETE FROM scans WHERE created_at < ?')
    .bind(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .run();
}
