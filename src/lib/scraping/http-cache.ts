import { createHash } from "crypto";
import { getDb } from "../db";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function urlHash(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

/**
 * Return cached body if a non-expired entry exists, otherwise null.
 * Pass ttlMs to override the per-entry TTL check (0 = never match).
 */
export function getHttpCache(url: string, ttlMs?: number): string | null {
  const ttl = ttlMs ?? DEFAULT_TTL_MS;
  if (ttl === 0) return null;

  const db = getDb();
  const row = db
    .prepare("SELECT body, fetched_at, ttl_ms FROM http_cache WHERE url_hash = ?")
    .get(urlHash(url)) as { body: string; fetched_at: number; ttl_ms: number } | undefined;

  if (!row) return null;

  const age = Date.now() - row.fetched_at;
  const effectiveTtl = Math.min(ttl, row.ttl_ms);
  if (age > effectiveTtl) return null;

  console.log(`[cache] hit ${url}`);
  return row.body;
}

/**
 * Upsert a cache entry for the given URL.
 */
export function setHttpCache(
  url: string,
  body: string,
  options?: { ttlMs?: number }
): void {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO http_cache (url_hash, url, body, fetched_at, ttl_ms)
     VALUES (?, ?, ?, ?, ?)`
  ).run(urlHash(url), url, body, Date.now(), ttlMs);
}

/**
 * Delete all expired entries. Returns the number of rows deleted.
 */
export function pruneHttpCache(): number {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM http_cache WHERE fetched_at + ttl_ms < ?")
    .run(Date.now());
  if (result.changes > 0) {
    console.log(`[cache] pruned ${result.changes} expired entries`);
  }
  return result.changes;
}

/**
 * Wipe all cache entries.
 */
export function clearHttpCache(): void {
  const db = getDb();
  db.prepare("DELETE FROM http_cache").run();
}
