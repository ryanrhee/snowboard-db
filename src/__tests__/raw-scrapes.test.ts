import { describe, it, expect, afterEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { BrandIdentifier } from "../lib/strategies/brand-identifier";
import type { ScrapedBoard } from "../lib/scrapers/types";
import { Currency } from "../lib/types";

describe("insertRawScrapes", () => {
  const TEST_DB_PATH = path.resolve(process.cwd(), "test-raw-scrapes.db");

  afterEach(() => {
    try { fs.unlinkSync(TEST_DB_PATH); } catch {}
  });

  function setupDb() {
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

      CREATE TABLE raw_scrapes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL REFERENCES search_runs(id),
        source TEXT NOT NULL,
        brand TEXT NOT NULL,
        manufacturer TEXT,
        model TEXT NOT NULL,
        raw_model TEXT,
        source_url TEXT NOT NULL,
        gender TEXT,
        year INTEGER,
        flex TEXT,
        profile TEXT,
        shape TEXT,
        category TEXT,
        ability_level TEXT,
        description TEXT,
        msrp_usd REAL,
        extras_json TEXT,
        scraped_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_raw_scrapes_run ON raw_scrapes(run_id);
      CREATE INDEX IF NOT EXISTS idx_raw_scrapes_brand ON raw_scrapes(brand, model);
    `);

    return db;
  }

  function makeScrapedBoard(overrides: Partial<ScrapedBoard> & { brandRaw?: string } = {}): ScrapedBoard {
    const { brandRaw, ...rest } = overrides;
    return {
      source: "retailer:tactics",
      brandId: new BrandIdentifier(brandRaw ?? "Burton"),
      model: "Custom",
      rawModel: "Burton Custom Camber Snowboard 2025",
      sourceUrl: "https://www.tactics.com/burton/custom-camber-snowboard",
      gender: "unisex",
      year: 2025,
      flex: "6",
      profile: "Camber",
      shape: "Twin",
      category: "All-Mountain",
      abilityLevel: "intermediate-advanced",
      description: "The Burton Custom is a versatile all-mountain board",
      msrpUsd: 599.95,
      extras: { terrainPark: "7", terrainPowder: "5" },
      listings: [],
      ...rest,
    };
  }

  function insertRawScrapesLocal(db: Database.Database, scrapes: ScrapedBoard[], runId: string) {
    if (scrapes.length === 0) return;
    const stmt = db.prepare(`
      INSERT INTO raw_scrapes (
        run_id, source, brand, manufacturer, model, raw_model, source_url,
        gender, year, flex, profile, shape, category, ability_level,
        description, msrp_usd, extras_json, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    db.transaction(() => {
      for (const sb of scrapes) {
        stmt.run(
          runId,
          sb.source,
          sb.brandId.canonical,
          sb.brandId.manufacturer,
          sb.model,
          sb.rawModel ?? null,
          sb.sourceUrl,
          sb.gender ?? null,
          sb.year ?? null,
          sb.flex ?? null,
          sb.profile ?? null,
          sb.shape ?? null,
          sb.category ?? null,
          sb.abilityLevel ?? null,
          sb.description ?? null,
          sb.msrpUsd ?? null,
          Object.keys(sb.extras).length > 0 ? JSON.stringify(sb.extras) : null,
          now
        );
      }
    })();
  }

  it("inserts ScrapedBoard rows with correct field mapping", () => {
    const db = setupDb();
    const runId = "run-1";
    db.prepare("INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)").run(runId, new Date().toISOString(), "{}");

    const board = makeScrapedBoard();
    insertRawScrapesLocal(db, [board], runId);

    const rows = db.prepare("SELECT * FROM raw_scrapes").all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.run_id).toBe(runId);
    expect(row.source).toBe("retailer:tactics");
    expect(row.brand).toBe("Burton");
    expect(row.manufacturer).toBe("burton");
    expect(row.model).toBe("Custom");
    expect(row.raw_model).toBe("Burton Custom Camber Snowboard 2025");
    expect(row.source_url).toBe("https://www.tactics.com/burton/custom-camber-snowboard");
    expect(row.gender).toBe("unisex");
    expect(row.year).toBe(2025);
    expect(row.flex).toBe("6");
    expect(row.profile).toBe("Camber");
    expect(row.shape).toBe("Twin");
    expect(row.category).toBe("All-Mountain");
    expect(row.ability_level).toBe("intermediate-advanced");
    expect(row.msrp_usd).toBe(599.95);

    const extras = JSON.parse(row.extras_json as string);
    expect(extras).toEqual({ terrainPark: "7", terrainPowder: "5" });

    db.close();
  });

  it("inserts multiple boards in a single transaction", () => {
    const db = setupDb();
    const runId = "run-2";
    db.prepare("INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)").run(runId, new Date().toISOString(), "{}");

    const boards = [
      makeScrapedBoard({ model: "Custom" }),
      makeScrapedBoard({ model: "Process", brandRaw: "Burton", rawModel: "Burton Process Flying V" }),
      makeScrapedBoard({ brandRaw: "GNU", model: "Money", source: "retailer:evo" }),
    ];

    insertRawScrapesLocal(db, boards, runId);

    const count = (db.prepare("SELECT COUNT(*) as c FROM raw_scrapes").get() as { c: number }).c;
    expect(count).toBe(3);

    db.close();
  });

  it("stores null extras_json when extras is empty", () => {
    const db = setupDb();
    const runId = "run-3";
    db.prepare("INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)").run(runId, new Date().toISOString(), "{}");

    const board = makeScrapedBoard({ extras: {} });
    insertRawScrapesLocal(db, [board], runId);

    const row = db.prepare("SELECT extras_json FROM raw_scrapes").get() as { extras_json: string | null };
    expect(row.extras_json).toBeNull();

    db.close();
  });

  it("stores null for optional fields when not provided", () => {
    const db = setupDb();
    const runId = "run-4";
    db.prepare("INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)").run(runId, new Date().toISOString(), "{}");

    const board: ScrapedBoard = {
      source: "manufacturer:burton",
      brandId: new BrandIdentifier("Burton"),
      model: "Custom",
      sourceUrl: "https://www.burton.com/custom",
      extras: {},
      listings: [],
    };
    insertRawScrapesLocal(db, [board], runId);

    const row = db.prepare("SELECT * FROM raw_scrapes").get() as Record<string, unknown>;
    expect(row.raw_model).toBeNull();
    expect(row.gender).toBeNull();
    expect(row.year).toBeNull();
    expect(row.flex).toBeNull();
    expect(row.profile).toBeNull();
    expect(row.msrp_usd).toBeNull();
    expect(row.extras_json).toBeNull();

    db.close();
  });

  it("rejects raw_scrapes with non-existent run_id (FK constraint)", () => {
    const db = setupDb();
    const board = makeScrapedBoard();

    expect(() => {
      insertRawScrapesLocal(db, [board], "non-existent-run");
    }).toThrow(/FOREIGN KEY constraint failed/);

    db.close();
  });

  it("assigns autoincrement IDs", () => {
    const db = setupDb();
    const runId = "run-5";
    db.prepare("INSERT INTO search_runs (id, timestamp, constraints_json) VALUES (?,?,?)").run(runId, new Date().toISOString(), "{}");

    insertRawScrapesLocal(db, [makeScrapedBoard({ model: "A" }), makeScrapedBoard({ model: "B" })], runId);

    const rows = db.prepare("SELECT id, model FROM raw_scrapes ORDER BY id").all() as { id: number; model: string }[];
    expect(rows[0].id).toBe(1);
    expect(rows[0].model).toBe("A");
    expect(rows[1].id).toBe(2);
    expect(rows[1].model).toBe("B");

    db.close();
  });
});
