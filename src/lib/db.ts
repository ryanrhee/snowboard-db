import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { config } from "./config";
import { CanonicalBoard, SearchRun } from "./types";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.resolve(process.cwd(), config.dbPath);
  const dir = path.dirname(dbPath);

  // Ensure directory exists
  const fs = require("fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_runs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      constraints_json TEXT NOT NULL,
      board_count INTEGER NOT NULL DEFAULT 0,
      retailers_queried TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      retailer TEXT NOT NULL,
      region TEXT NOT NULL,
      url TEXT NOT NULL,
      image_url TEXT,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      length_cm REAL,
      width_mm REAL,
      flex REAL,
      profile TEXT,
      shape TEXT,
      category TEXT,
      original_price_usd REAL,
      sale_price_usd REAL NOT NULL,
      discount_percent REAL,
      currency TEXT NOT NULL,
      original_price REAL,
      sale_price REAL NOT NULL,
      availability TEXT NOT NULL DEFAULT 'unknown',
      description TEXT,
      beginner_score REAL NOT NULL DEFAULT 0,
      value_score REAL NOT NULL DEFAULT 0,
      final_score REAL NOT NULL DEFAULT 0,
      score_notes TEXT,
      scraped_at TEXT NOT NULL,
      PRIMARY KEY (id, run_id),
      FOREIGN KEY (run_id) REFERENCES search_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_boards_run_id ON boards(run_id);
    CREATE INDEX IF NOT EXISTS idx_boards_final_score ON boards(final_score);
    CREATE INDEX IF NOT EXISTS idx_boards_retailer ON boards(retailer);
  `);
}

// ===== Board ID Generation =====

export function generateBoardId(
  retailer: string,
  url: string,
  lengthCm?: number | null
): string {
  const input = `${retailer}|${url}|${lengthCm ?? ""}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// ===== Search Run CRUD =====

export function insertSearchRun(run: SearchRun): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO search_runs (id, timestamp, constraints_json, board_count, retailers_queried, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    run.id,
    run.timestamp,
    run.constraintsJson,
    run.boardCount,
    run.retailersQueried,
    run.durationMs
  );
}

export function getLatestRun(): SearchRun | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM search_runs ORDER BY timestamp DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  return row ? mapRowToSearchRun(row) : null;
}

export function getRunById(id: string): SearchRun | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM search_runs WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapRowToSearchRun(row) : null;
}

export function getAllRuns(): SearchRun[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM search_runs ORDER BY timestamp DESC")
    .all() as Record<string, unknown>[];
  return rows.map(mapRowToSearchRun);
}

function mapRowToSearchRun(row: Record<string, unknown>): SearchRun {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    constraintsJson: row.constraints_json as string,
    boardCount: row.board_count as number,
    retailersQueried: row.retailers_queried as string,
    durationMs: row.duration_ms as number,
  };
}

// ===== Board CRUD =====

export function insertBoards(boards: CanonicalBoard[]): void {
  if (boards.length === 0) return;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO boards (
      id, run_id, retailer, region, url, image_url, brand, model, year,
      length_cm, width_mm, flex, profile, shape, category,
      original_price_usd, sale_price_usd, discount_percent,
      currency, original_price, sale_price, availability,
      description, beginner_score, value_score, final_score, score_notes, scraped_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `);

  const insertMany = db.transaction((boards: CanonicalBoard[]) => {
    for (const b of boards) {
      stmt.run(
        b.id, b.runId, b.retailer, b.region, b.url, b.imageUrl,
        b.brand, b.model, b.year,
        b.lengthCm, b.widthMm, b.flex, b.profile, b.shape, b.category,
        b.originalPriceUsd, b.salePriceUsd, b.discountPercent,
        b.currency, b.originalPrice, b.salePrice, b.availability,
        b.description, b.beginnerScore, b.valueScore, b.finalScore,
        b.scoreNotes, b.scrapedAt
      );
    }
  });

  insertMany(boards);
}

export function getBoardsByRunId(runId: string): CanonicalBoard[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM boards WHERE run_id = ? ORDER BY final_score DESC")
    .all(runId) as Record<string, unknown>[];
  return rows.map(mapRowToBoard);
}

export function updateBoardPriceAndStock(
  id: string,
  runId: string,
  updates: {
    salePrice: number;
    salePriceUsd: number;
    originalPrice?: number | null;
    originalPriceUsd?: number | null;
    discountPercent?: number | null;
    availability: string;
    valueScore: number;
    finalScore: number;
  }
): void {
  const db = getDb();
  db.prepare(`
    UPDATE boards SET
      sale_price = ?, sale_price_usd = ?,
      original_price = ?, original_price_usd = ?,
      discount_percent = ?, availability = ?,
      value_score = ?, final_score = ?
    WHERE id = ? AND run_id = ?
  `).run(
    updates.salePrice,
    updates.salePriceUsd,
    updates.originalPrice ?? null,
    updates.originalPriceUsd ?? null,
    updates.discountPercent ?? null,
    updates.availability,
    updates.valueScore,
    updates.finalScore,
    id,
    runId
  );
}

function mapRowToBoard(row: Record<string, unknown>): CanonicalBoard {
  return {
    id: row.id as string,
    runId: row.run_id as string,
    retailer: row.retailer as string,
    region: row.region as string,
    url: row.url as string,
    imageUrl: (row.image_url as string) || null,
    brand: row.brand as string,
    model: row.model as string,
    year: (row.year as number) || null,
    lengthCm: (row.length_cm as number) || null,
    widthMm: (row.width_mm as number) || null,
    flex: (row.flex as number) || null,
    profile: (row.profile as string) || null,
    shape: (row.shape as string) || null,
    category: (row.category as string) || null,
    originalPriceUsd: (row.original_price_usd as number) || null,
    salePriceUsd: row.sale_price_usd as number,
    discountPercent: (row.discount_percent as number) || null,
    currency: row.currency as string,
    originalPrice: (row.original_price as number) || null,
    salePrice: row.sale_price as number,
    availability: row.availability as string,
    description: (row.description as string) || null,
    beginnerScore: row.beginner_score as number,
    valueScore: row.value_score as number,
    finalScore: row.final_score as number,
    scoreNotes: (row.score_notes as string) || null,
    scrapedAt: row.scraped_at as string,
  } as CanonicalBoard;
}
