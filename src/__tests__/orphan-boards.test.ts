import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

describe("deleteOrphanBoards", () => {
  const TEST_DB_PATH = path.resolve(process.cwd(), "test-orphan-boards.db");

  function createTestDb() {
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

    return db;
  }

  afterEach(() => {
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  });

  it("deletes boards that have no listings", () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    // Insert a run
    db.prepare(
      "INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)"
    ).run("run-1", now, "{}");

    // Insert two boards
    const insertBoard = db.prepare(
      "INSERT INTO boards (board_key, brand, model, beginner_score, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    );
    insertBoard.run("burton|custom|unisex", "Burton", "Custom", 0.5, now, now);
    insertBoard.run("burton|process|unisex", "Burton", "Process", 0.4, now, now);

    // Only create a listing for the first board
    db.prepare(`
      INSERT INTO listings (id, board_key, run_id, retailer, region, url, currency, sale_price, sale_price_usd, scraped_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run("l1", "burton|custom|unisex", "run-1", "tactics", "US", "https://x.com", "USD", 399, 399, now);

    // Run the orphan cleanup query
    const result = db.prepare(
      "DELETE FROM boards WHERE board_key NOT IN (SELECT DISTINCT board_key FROM listings)"
    ).run();

    expect(result.changes).toBe(1);

    // Verify only the board with a listing remains
    const remaining = db.prepare("SELECT board_key FROM boards").all() as { board_key: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].board_key).toBe("burton|custom|unisex");

    db.close();
  });

  it("does nothing when all boards have listings", () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    db.prepare(
      "INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)"
    ).run("run-1", now, "{}");

    const insertBoard = db.prepare(
      "INSERT INTO boards (board_key, brand, model, beginner_score, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    );
    insertBoard.run("burton|custom|unisex", "Burton", "Custom", 0.5, now, now);
    insertBoard.run("burton|process|unisex", "Burton", "Process", 0.4, now, now);

    const insertListing = db.prepare(`
      INSERT INTO listings (id, board_key, run_id, retailer, region, url, currency, sale_price, sale_price_usd, scraped_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `);
    insertListing.run("l1", "burton|custom|unisex", "run-1", "tactics", "US", "https://x.com", "USD", 399, 399, now);
    insertListing.run("l2", "burton|process|unisex", "run-1", "tactics", "US", "https://x.com/2", "USD", 449, 449, now);

    const result = db.prepare(
      "DELETE FROM boards WHERE board_key NOT IN (SELECT DISTINCT board_key FROM listings)"
    ).run();

    expect(result.changes).toBe(0);

    const remaining = db.prepare("SELECT board_key FROM boards").all();
    expect(remaining).toHaveLength(2);

    db.close();
  });

  it("deletes all boards when listings table is empty", () => {
    const db = createTestDb();
    const now = new Date().toISOString();

    const insertBoard = db.prepare(
      "INSERT INTO boards (board_key, brand, model, beginner_score, created_at, updated_at) VALUES (?,?,?,?,?,?)"
    );
    insertBoard.run("burton|custom|unisex", "Burton", "Custom", 0.5, now, now);
    insertBoard.run("burton|process|unisex", "Burton", "Process", 0.4, now, now);

    const result = db.prepare(
      "DELETE FROM boards WHERE board_key NOT IN (SELECT DISTINCT board_key FROM listings)"
    ).run();

    expect(result.changes).toBe(2);

    const remaining = db.prepare("SELECT board_key FROM boards").all();
    expect(remaining).toHaveLength(0);

    db.close();
  });
});
