import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { config } from "./config";
import { CanonicalBoard, SearchRun } from "./types";
import { normalizeModel } from "./normalization";

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

    CREATE TABLE IF NOT EXISTS spec_cache (
      brand_model TEXT PRIMARY KEY,
      flex REAL,
      profile TEXT,
      shape TEXT,
      category TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Migrate spec_cache: add columns if missing
  const cols = db.pragma("table_info(spec_cache)") as { name: string }[];
  const colNames = new Set(cols.map((c) => c.name));
  if (!colNames.has("msrp_usd")) db.exec("ALTER TABLE spec_cache ADD COLUMN msrp_usd REAL");
  if (!colNames.has("source")) db.exec("ALTER TABLE spec_cache ADD COLUMN source TEXT");
  if (!colNames.has("source_url")) db.exec("ALTER TABLE spec_cache ADD COLUMN source_url TEXT");
  if (!colNames.has("updated_at")) db.exec("ALTER TABLE spec_cache ADD COLUMN updated_at TEXT");

  // Review site tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS review_sitemap_cache (
      url TEXT PRIMARY KEY,
      slug TEXT,
      brand TEXT,
      model TEXT,
      fetched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS review_url_map (
      brand_model TEXT PRIMARY KEY,
      review_url TEXT,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS http_cache (
      url_hash     TEXT PRIMARY KEY,
      url          TEXT NOT NULL,
      body         TEXT NOT NULL,
      fetched_at   INTEGER NOT NULL,
      ttl_ms       INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS spec_sources (
      brand_model TEXT NOT NULL,
      field       TEXT NOT NULL,
      source      TEXT NOT NULL,
      value       TEXT NOT NULL,
      source_url  TEXT,
      updated_at  TEXT NOT NULL,
      PRIMARY KEY (brand_model, field, source)
    );
  `);

  // Migrate boards: add spec_sources column if missing
  const boardCols = db.pragma("table_info(boards)") as { name: string }[];
  const boardColNames = new Set(boardCols.map((c) => c.name));
  if (!boardColNames.has("spec_sources")) {
    db.exec("ALTER TABLE boards ADD COLUMN spec_sources TEXT");
  }
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

// ===== Spec Key =====

export function specKey(brand: string, model: string): string {
  return `${brand.toLowerCase()}|${normalizeModel(model, brand).toLowerCase()}`;
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
      description, beginner_score, value_score, final_score, score_notes, scraped_at,
      spec_sources
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?
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
        b.scoreNotes, b.scrapedAt,
        b.specSources ?? null
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
    specSources: (row.spec_sources as string) || null,
  } as CanonicalBoard;
}

// ===== Spec Cache CRUD =====

export interface CachedSpecs {
  flex: number | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  msrpUsd: number | null;
  source: string | null;
  sourceUrl: string | null;
}

export function getCachedSpecs(brandModel: string): CachedSpecs | null {
  const db = getDb();
  const row = db
    .prepare("SELECT flex, profile, shape, category, msrp_usd, source, source_url FROM spec_cache WHERE brand_model = ?")
    .get(brandModel) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    flex: (row.flex as number) ?? null,
    profile: (row.profile as string) ?? null,
    shape: (row.shape as string) ?? null,
    category: (row.category as string) ?? null,
    msrpUsd: (row.msrp_usd as number) ?? null,
    source: (row.source as string) ?? null,
    sourceUrl: (row.source_url as string) ?? null,
  };
}

export function setCachedSpecs(
  brandModel: string,
  specs: CachedSpecs
): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO spec_cache (brand_model, flex, profile, shape, category, msrp_usd, source, source_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    brandModel,
    specs.flex,
    specs.profile,
    specs.shape,
    specs.category,
    specs.msrpUsd,
    specs.source,
    specs.sourceUrl,
    now,
    now
  );
}

/**
 * Set cached specs only if no manufacturer-sourced entry already exists.
 * Manufacturer data takes priority over LLM data.
 */
export function setCachedSpecsIfNotManufacturer(
  brandModel: string,
  specs: CachedSpecs
): void {
  const existing = getCachedSpecs(brandModel);
  if (existing && existing.source === "manufacturer") return;
  setCachedSpecs(brandModel, specs);
}

// ===== Source Priority =====

const SOURCE_PRIORITY: Record<string, number> = {
  manufacturer: 3,
  "review-site": 2,
  llm: 1,
};

/**
 * Set cached specs only if the new source has equal or higher priority
 * than the existing entry. Priority: manufacturer > review-site > llm.
 */
export function setCachedSpecsWithPriority(
  brandModel: string,
  specs: CachedSpecs
): void {
  const existing = getCachedSpecs(brandModel);
  if (existing && existing.source) {
    const existingPriority = SOURCE_PRIORITY[existing.source] ?? 0;
    const newPriority = SOURCE_PRIORITY[specs.source ?? ""] ?? 0;
    if (newPriority < existingPriority) return;
  }
  setCachedSpecs(brandModel, specs);
}

// ===== Review Sitemap Cache =====

export interface SitemapEntry {
  url: string;
  slug: string;
  brand: string;
  model: string;
  fetchedAt: string;
}

export function getSitemapCache(): SitemapEntry[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT url, slug, brand, model, fetched_at FROM review_sitemap_cache")
    .all() as Record<string, unknown>[];
  return rows.map((r) => ({
    url: r.url as string,
    slug: r.slug as string,
    brand: r.brand as string,
    model: r.model as string,
    fetchedAt: r.fetched_at as string,
  }));
}

export function setSitemapCache(entries: SitemapEntry[]): void {
  const db = getDb();
  // Clear old entries and insert new ones
  const clear = db.prepare("DELETE FROM review_sitemap_cache");
  const insert = db.prepare(
    "INSERT OR REPLACE INTO review_sitemap_cache (url, slug, brand, model, fetched_at) VALUES (?, ?, ?, ?, ?)"
  );

  db.transaction(() => {
    clear.run();
    for (const e of entries) {
      insert.run(e.url, e.slug, e.brand, e.model, e.fetchedAt);
    }
  })();
}

// ===== Review URL Map =====

const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cached review URL for a brand|model key.
 * Returns: string (hit), null (cached miss), undefined (not cached / expired).
 */
export function getReviewUrlMap(brandModel: string): string | null | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT review_url, resolved_at FROM review_url_map WHERE brand_model = ?")
    .get(brandModel) as Record<string, unknown> | undefined;
  if (!row) return undefined;

  // If it's a miss (null URL), check TTL
  if (row.review_url === null) {
    const age = Date.now() - new Date(row.resolved_at as string).getTime();
    if (age > MISS_TTL_MS) {
      // Expired miss — delete and return undefined
      db.prepare("DELETE FROM review_url_map WHERE brand_model = ?").run(brandModel);
      return undefined;
    }
    return null;
  }

  return row.review_url as string;
}

export function setReviewUrlMap(brandModel: string, reviewUrl: string | null): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO review_url_map (brand_model, review_url, resolved_at) VALUES (?, ?, ?)"
  ).run(brandModel, reviewUrl, new Date().toISOString());
}

// ===== Spec Sources CRUD =====

export interface SpecSourceEntry {
  source: string;
  value: string;
  sourceUrl: string | null;
}

export function setSpecSource(
  brandModel: string,
  field: string,
  source: string,
  value: string,
  sourceUrl?: string | null
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO spec_sources (brand_model, field, source, value, source_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(brandModel, field, source, value, sourceUrl ?? null, new Date().toISOString());
}

export function getSpecSources(
  brandModel: string
): Record<string, SpecSourceEntry[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT field, source, value, source_url FROM spec_sources WHERE brand_model = ?")
    .all(brandModel) as { field: string; source: string; value: string; source_url: string | null }[];

  const result: Record<string, SpecSourceEntry[]> = {};
  for (const row of rows) {
    if (!result[row.field]) result[row.field] = [];
    result[row.field].push({
      source: row.source,
      value: row.value,
      sourceUrl: row.source_url,
    });
  }
  return result;
}

