import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// The bug: pipeline.ts called insertListings() before insertSearchRun(),
// but listings.run_id has a FOREIGN KEY → search_runs.id.
// This test proves that inserting a listing before its run exists fails.

describe("insertListings foreign key ordering", () => {
  const TEST_DB_PATH = path.resolve(process.cwd(), "test-fk-order.db");

  afterEach(() => {
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  });

  it("rejects a listing whose run_id does not yet exist in search_runs", () => {
    const db = new Database(TEST_DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE search_runs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        board_count INTEGER NOT NULL DEFAULT 0,
        retailers_queried TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE boards (
        board_key TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        beginner_score REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        board_key TEXT NOT NULL REFERENCES boards(board_key),
        run_id TEXT NOT NULL REFERENCES search_runs(id),
        retailer TEXT NOT NULL,
        region TEXT NOT NULL,
        url TEXT NOT NULL,
        currency TEXT NOT NULL,
        sale_price REAL NOT NULL,
        sale_price_usd REAL NOT NULL,
        availability TEXT NOT NULL DEFAULT 'unknown',
        scraped_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();

    // Board exists — that FK is satisfied
    db.prepare(
      "INSERT INTO boards (board_key, brand, model, beginner_score, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    ).run("burton|custom", "Burton", "Custom", 0.5, now, now);

    // Listing references a run that does NOT exist yet → FK violation
    expect(() => {
      db.prepare(`
        INSERT INTO listings (id, board_key, run_id, retailer, region, url, currency, sale_price, sale_price_usd, scraped_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run("l1", "burton|custom", "run-does-not-exist", "tactics", "US", "https://x.com", "USD", 399, 399, now);
    }).toThrow(/FOREIGN KEY constraint failed/);

    db.close();
  });

  it("accepts a listing when its search_run is inserted first", () => {
    const db = new Database(TEST_DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
      CREATE TABLE search_runs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        board_count INTEGER NOT NULL DEFAULT 0,
        retailers_queried TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE boards (
        board_key TEXT PRIMARY KEY,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        beginner_score REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE listings (
        id TEXT PRIMARY KEY,
        board_key TEXT NOT NULL REFERENCES boards(board_key),
        run_id TEXT NOT NULL REFERENCES search_runs(id),
        retailer TEXT NOT NULL,
        region TEXT NOT NULL,
        url TEXT NOT NULL,
        currency TEXT NOT NULL,
        sale_price REAL NOT NULL,
        sale_price_usd REAL NOT NULL,
        availability TEXT NOT NULL DEFAULT 'unknown',
        scraped_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();
    const runId = "run-123";

    db.prepare(
      "INSERT INTO boards (board_key, brand, model, beginner_score, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    ).run("burton|custom", "Burton", "Custom", 0.5, now, now);

    // Insert run FIRST — correct ordering
    db.prepare(
      "INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)"
    ).run(runId, now, "{}");

    // Now listing succeeds
    expect(() => {
      db.prepare(`
        INSERT INTO listings (id, board_key, run_id, retailer, region, url, currency, sale_price, sale_price_usd, scraped_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run("l1", "burton|custom", runId, "tactics", "US", "https://x.com", "USD", 399, 399, now);
    }).not.toThrow();

    const count = db.prepare("SELECT COUNT(*) as c FROM listings").get() as { c: number };
    expect(count.c).toBe(1);

    db.close();
  });
});
