import Database from "better-sqlite3";
import { createHash } from "crypto";
import path from "path";
import { config } from "./config";
import { SearchRun, Board, Listing, BoardWithListings, TerrainScores } from "./types";
import { normalizeModel } from "./normalization";
import { canonicalizeBrand } from "./scraping/utils";

let db: Database.Database | null = null;
let cacheDb: Database.Database | null = null;

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

export function getCacheDb(): Database.Database {
  if (cacheDb) return cacheDb;

  const dbPath = path.resolve(process.cwd(), config.cacheDbPath);
  const dir = path.dirname(dbPath);

  const fs = require("fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  cacheDb = new Database(dbPath);
  cacheDb.pragma("journal_mode = WAL");

  initCacheSchema(cacheDb);
  migrateCacheFromMainDb(cacheDb);
  return cacheDb;
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

  // Spec sources, spec cache
  db.exec(`
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

  // ===== Migration: old listing-shaped boards → new board-centric model =====
  migrateToNewModel(db);
}

function initCacheSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS http_cache (
      url_hash     TEXT PRIMARY KEY,
      url          TEXT NOT NULL,
      body         TEXT NOT NULL,
      fetched_at   INTEGER NOT NULL,
      ttl_ms       INTEGER NOT NULL
    );

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
  `);
}

function migrateCacheFromMainDb(cacheDatabase: Database.Database): void {
  const mainDbPath = path.resolve(process.cwd(), config.dbPath);
  const fs = require("fs");
  if (!fs.existsSync(mainDbPath)) return;

  // Check if main DB has any of the cache tables
  const mainDb = new Database(mainDbPath);
  const tables = mainDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('http_cache', 'review_sitemap_cache', 'review_url_map')"
    )
    .all() as { name: string }[];

  if (tables.length === 0) {
    mainDb.close();
    return;
  }

  const tableNames = tables.map((t) => t.name);
  console.log(`[cache-db] Migrating cache tables from main DB: ${tableNames.join(", ")}`);

  cacheDatabase.exec(`ATTACH DATABASE '${mainDbPath}' AS main_db`);

  for (const table of tableNames) {
    const count = (
      cacheDatabase.prepare(`SELECT count(*) as c FROM main_db.${table}`).get() as { c: number }
    ).c;
    if (count > 0) {
      cacheDatabase
        .prepare(`INSERT OR IGNORE INTO ${table} SELECT * FROM main_db.${table}`)
        .run();
      console.log(`[cache-db] Copied ${count} rows from main_db.${table}`);
    }
  }

  // Drop the cache tables from main DB
  for (const table of tableNames) {
    cacheDatabase.exec(`DROP TABLE main_db.${table}`);
  }
  console.log("[cache-db] Dropped cache tables from main DB");

  cacheDatabase.exec("DETACH DATABASE main_db");
  mainDb.close();
}

function migrateToNewModel(db: Database.Database): void {
  // Check if old boards table exists and is listing-shaped (has retailer, url, sale_price columns)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='boards'").get() as { name: string } | undefined;

  if (tables) {
    const boardCols = db.pragma("table_info(boards)") as { name: string }[];
    const boardColNames = new Set(boardCols.map((c) => c.name));

    if (boardColNames.has("retailer") && boardColNames.has("url") && boardColNames.has("sale_price")) {
      // Old listing-shaped table — rename to boards_legacy
      console.log("[db] Migrating old boards table to boards_legacy...");
      db.exec("ALTER TABLE boards RENAME TO boards_legacy");
    } else if (boardColNames.has("board_key")) {
      // Already migrated — create listings table if missing, then return
      createListingsTable(db);
      return;
    }
  }

  // Create new boards table
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      board_key         TEXT PRIMARY KEY,
      brand             TEXT NOT NULL,
      model             TEXT NOT NULL,
      year              INTEGER,
      flex              REAL,
      profile           TEXT,
      shape             TEXT,
      category          TEXT,
      ability_level_min TEXT,
      ability_level_max TEXT,
      msrp_usd          REAL,
      manufacturer_url  TEXT,
      description       TEXT,
      beginner_score    REAL NOT NULL DEFAULT 0,
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
  `);

  createListingsTable(db);
}

function createListingsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS listings (
      id                 TEXT PRIMARY KEY,
      board_key          TEXT NOT NULL REFERENCES boards(board_key),
      run_id             TEXT NOT NULL REFERENCES search_runs(id),
      retailer           TEXT NOT NULL,
      region             TEXT NOT NULL,
      url                TEXT NOT NULL,
      image_url          TEXT,
      length_cm          REAL,
      width_mm           REAL,
      currency           TEXT NOT NULL,
      original_price     REAL,
      sale_price         REAL NOT NULL,
      original_price_usd REAL,
      sale_price_usd     REAL NOT NULL,
      discount_percent   REAL,
      availability       TEXT NOT NULL DEFAULT 'unknown',
      scraped_at         TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_listings_board ON listings(board_key);
    CREATE INDEX IF NOT EXISTS idx_listings_run   ON listings(run_id);
  `);

  // Idempotent migrations for new columns
  const listingCols = db.pragma("table_info(listings)") as { name: string }[];
  const listingColNames = new Set(listingCols.map((c) => c.name));
  if (!listingColNames.has("condition"))
    db.exec("ALTER TABLE listings ADD COLUMN condition TEXT NOT NULL DEFAULT 'unknown'");
  if (!listingColNames.has("gender"))
    db.exec("ALTER TABLE listings ADD COLUMN gender TEXT NOT NULL DEFAULT 'unisex'");
  if (!listingColNames.has("stock_count"))
    db.exec("ALTER TABLE listings ADD COLUMN stock_count INTEGER");
  if (!listingColNames.has("combo_contents"))
    db.exec("ALTER TABLE listings ADD COLUMN combo_contents TEXT");

  const boardCols2 = db.pragma("table_info(boards)") as { name: string }[];
  const boardColNames2 = new Set(boardCols2.map((c) => c.name));
  if (!boardColNames2.has("gender"))
    db.exec("ALTER TABLE boards ADD COLUMN gender TEXT NOT NULL DEFAULT 'unisex'");
  // Terrain score columns
  for (const col of ["terrain_piste", "terrain_powder", "terrain_park", "terrain_freeride", "terrain_freestyle"]) {
    if (!boardColNames2.has(col))
      db.exec(`ALTER TABLE boards ADD COLUMN ${col} INTEGER`);
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

export function generateListingId(
  retailer: string,
  url: string,
  lengthCm?: number | null
): string {
  const input = `${retailer}|${url}|${lengthCm ?? ""}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

// ===== Spec Key =====

export function specKey(brand: string, model: string, gender?: string): string {
  const cb = canonicalizeBrand(brand);
  let normalizedModel = normalizeModel(model, cb).toLowerCase();
  const g = gender?.toLowerCase();
  // Strip leading "kids " from model for kids/youth to deduplicate
  // e.g. "burton|kids custom smalls|kids" → "burton|custom smalls|kids"
  if (g === "kids" || g === "youth") {
    normalizedModel = normalizedModel.replace(/^kids\s+/, "");
  }
  const base = `${cb.toLowerCase()}|${normalizedModel}`;
  if (g === "womens") return `${base}|womens`;
  if (g === "kids" || g === "youth") return `${base}|kids`;
  return `${base}|unisex`;
}

export function genderFromKey(boardKey: string): string {
  const last = boardKey.split("|").pop()!;
  if (last === "womens" || last === "kids") return last;
  return "unisex";
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

// ===== Board CRUD (new board-centric model) =====

export function getAllBoards(): Board[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM boards").all() as Record<string, unknown>[];
  return rows.map(mapRowToNewBoard);
}

export function upsertBoard(board: Board): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO boards (
      board_key, brand, model, year, flex, profile, shape, category,
      ability_level_min, ability_level_max, msrp_usd, manufacturer_url,
      description, beginner_score, created_at, updated_at,
      terrain_piste, terrain_powder, terrain_park, terrain_freeride, terrain_freestyle
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(board_key) DO UPDATE SET
      year = COALESCE(excluded.year, boards.year),
      flex = COALESCE(excluded.flex, boards.flex),
      profile = COALESCE(excluded.profile, boards.profile),
      shape = COALESCE(excluded.shape, boards.shape),
      category = COALESCE(excluded.category, boards.category),
      ability_level_min = COALESCE(excluded.ability_level_min, boards.ability_level_min),
      ability_level_max = COALESCE(excluded.ability_level_max, boards.ability_level_max),
      msrp_usd = COALESCE(excluded.msrp_usd, boards.msrp_usd),
      manufacturer_url = COALESCE(excluded.manufacturer_url, boards.manufacturer_url),
      description = COALESCE(excluded.description, boards.description),
      beginner_score = excluded.beginner_score,
      updated_at = excluded.updated_at,
      terrain_piste = COALESCE(excluded.terrain_piste, boards.terrain_piste),
      terrain_powder = COALESCE(excluded.terrain_powder, boards.terrain_powder),
      terrain_park = COALESCE(excluded.terrain_park, boards.terrain_park),
      terrain_freeride = COALESCE(excluded.terrain_freeride, boards.terrain_freeride),
      terrain_freestyle = COALESCE(excluded.terrain_freestyle, boards.terrain_freestyle)
  `).run(
    board.boardKey, board.brand, board.model, board.year,
    board.flex, board.profile, board.shape, board.category,
    board.abilityLevelMin, board.abilityLevelMax,
    board.msrpUsd, board.manufacturerUrl,
    board.description, board.beginnerScore,
    board.createdAt, board.updatedAt,
    board.terrainScores.piste, board.terrainScores.powder,
    board.terrainScores.park, board.terrainScores.freeride,
    board.terrainScores.freestyle
  );
}

export function upsertBoards(boards: Board[]): void {
  if (boards.length === 0) return;
  const db = getDb();
  db.transaction(() => {
    for (const board of boards) {
      upsertBoard(board);
    }
  })();
}

export function insertListings(listings: Listing[]): void {
  if (listings.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO listings (
      id, board_key, run_id, retailer, region, url, image_url,
      length_cm, width_mm, currency, original_price, sale_price,
      original_price_usd, sale_price_usd, discount_percent,
      availability, scraped_at, condition, gender, stock_count, combo_contents
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const l of listings) {
      stmt.run(
        l.id, l.boardKey, l.runId,
        l.retailer, l.region, l.url, l.imageUrl,
        l.lengthCm, l.widthMm, l.currency,
        l.originalPrice, l.salePrice,
        l.originalPriceUsd, l.salePriceUsd, l.discountPercent,
        l.availability, l.scrapedAt,
        l.condition, l.gender, l.stockCount, l.comboContents
      );
    }
  })();
}

export function updateListingPriceAndStock(
  id: string,
  updates: {
    salePrice: number;
    salePriceUsd: number;
    originalPrice?: number | null;
    originalPriceUsd?: number | null;
    discountPercent?: number | null;
    availability: string;
  }
): void {
  const db = getDb();
  db.prepare(`
    UPDATE listings SET
      sale_price = ?, sale_price_usd = ?,
      original_price = ?, original_price_usd = ?,
      discount_percent = ?, availability = ?
    WHERE id = ?
  `).run(
    updates.salePrice,
    updates.salePriceUsd,
    updates.originalPrice ?? null,
    updates.originalPriceUsd ?? null,
    updates.discountPercent ?? null,
    updates.availability,
    id
  );
}

export function getBoardByKey(boardKey: string): Board | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM boards WHERE board_key = ?").get(boardKey) as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapRowToNewBoard(row);
}

export function getBoardsWithListings(runId?: string): BoardWithListings[] {
  const db = getDb();

  // Get all boards that have listings in the given run (or latest run)
  let listingRows: Record<string, unknown>[];
  if (runId) {
    listingRows = db.prepare(`
      SELECT l.*, b.brand, b.model, b.year, b.flex, b.profile, b.shape, b.category,
             b.ability_level_min, b.ability_level_max, b.msrp_usd, b.manufacturer_url,
             b.description, b.beginner_score, b.created_at, b.updated_at,
             b.terrain_piste, b.terrain_powder, b.terrain_park, b.terrain_freeride, b.terrain_freestyle
      FROM listings l
      JOIN boards b ON l.board_key = b.board_key
      WHERE l.run_id = ?
      ORDER BY l.sale_price_usd ASC
    `).all(runId) as Record<string, unknown>[];
  } else {
    // Get listings from the latest run
    const latestRun = getLatestRun();
    if (!latestRun) return [];
    listingRows = db.prepare(`
      SELECT l.*, b.brand, b.model, b.year, b.flex, b.profile, b.shape, b.category,
             b.ability_level_min, b.ability_level_max, b.msrp_usd, b.manufacturer_url,
             b.description, b.beginner_score, b.created_at, b.updated_at,
             b.terrain_piste, b.terrain_powder, b.terrain_park, b.terrain_freeride, b.terrain_freestyle
      FROM listings l
      JOIN boards b ON l.board_key = b.board_key
      WHERE l.run_id = ?
      ORDER BY l.sale_price_usd ASC
    `).all(latestRun.id) as Record<string, unknown>[];
  }

  // Group by board_key
  const boardMap = new Map<string, { board: Board; listings: Listing[] }>();

  for (const row of listingRows) {
    const boardKey = row.board_key as string;
    if (!boardMap.has(boardKey)) {
      boardMap.set(boardKey, {
        board: {
          boardKey,
          brand: row.brand as string,
          model: row.model as string,
          year: (row.year as number) || null,
          flex: (row.flex as number) || null,
          profile: (row.profile as string) || null,
          shape: (row.shape as string) || null,
          category: (row.category as string) || null,
          terrainScores: {
            piste: (row.terrain_piste as number) ?? null,
            powder: (row.terrain_powder as number) ?? null,
            park: (row.terrain_park as number) ?? null,
            freeride: (row.terrain_freeride as number) ?? null,
            freestyle: (row.terrain_freestyle as number) ?? null,
          },
          abilityLevelMin: (row.ability_level_min as string) || null,
          abilityLevelMax: (row.ability_level_max as string) || null,
          msrpUsd: (row.msrp_usd as number) || null,
          manufacturerUrl: (row.manufacturer_url as string) || null,
          description: (row.description as string) || null,
          beginnerScore: (row.beginner_score as number) || 0,
          createdAt: row.created_at as string,
          updatedAt: row.updated_at as string,
        },
        listings: [],
      });
    }

    boardMap.get(boardKey)!.listings.push({
      id: row.id as string,
      boardKey,
      runId: row.run_id as string,
      retailer: row.retailer as string,
      region: row.region as string,
      url: row.url as string,
      imageUrl: (row.image_url as string) || null,
      lengthCm: (row.length_cm as number) || null,
      widthMm: (row.width_mm as number) || null,
      currency: row.currency as string,
      originalPrice: (row.original_price as number) || null,
      salePrice: row.sale_price as number,
      originalPriceUsd: (row.original_price_usd as number) || null,
      salePriceUsd: row.sale_price_usd as number,
      discountPercent: (row.discount_percent as number) || null,
      availability: row.availability as string,
      scrapedAt: row.scraped_at as string,
      condition: (row.condition as string) || "unknown",
      gender: (row.gender as string) || "unisex",
      stockCount: (row.stock_count as number) ?? null,
      comboContents: (row.combo_contents as string) || null,
    });
  }

  // Build BoardWithListings with computed scores
  const results: BoardWithListings[] = [];
  for (const { board, listings } of boardMap.values()) {
    // Exclude combo listings from price calculations; fall back to all if no board-only listings
    const boardOnlyListings = listings.filter(l => !l.comboContents);
    const priceListings = boardOnlyListings.length > 0 ? boardOnlyListings : listings;
    const bestPrice = Math.min(...priceListings.map(l => l.salePriceUsd));
    const valueScore = calcValueScoreFromBoardAndPrice(board, bestPrice, priceListings);
    const finalScore = Math.round((0.6 * board.beginnerScore + 0.4 * valueScore) * 100) / 100;

    results.push({
      ...board,
      listings,
      bestPrice,
      valueScore,
      finalScore,
    });
  }

  // Find boards that have NO listings for this run
  const effectiveRunId = runId || (getLatestRun()?.id ?? null);
  if (effectiveRunId) {
    const listinglessBoardRows = db.prepare(`
      SELECT * FROM boards
      WHERE board_key NOT IN (SELECT DISTINCT board_key FROM listings WHERE run_id = ?)
    `).all(effectiveRunId) as Record<string, unknown>[];

    for (const row of listinglessBoardRows) {
      const board = mapRowToNewBoard(row);
      results.push({
        ...board,
        listings: [],
        bestPrice: 0,
        valueScore: 0,
        finalScore: Math.round(0.6 * board.beginnerScore * 100) / 100,
      });
    }
  }

  // Sort by finalScore descending
  results.sort((a, b) => b.finalScore - a.finalScore);
  return results;
}

function calcValueScoreFromBoardAndPrice(board: Board, bestPrice: number, listings: Listing[]): number {
  let total = 0;
  let weights = 0;

  // Discount: best listing's discount
  const bestListing = listings.reduce((best, l) => l.salePriceUsd < best.salePriceUsd ? l : best, listings[0]);
  const discountPercent = bestListing.discountPercent ??
    (board.msrpUsd && board.msrpUsd > bestPrice
      ? Math.round(((board.msrpUsd - bestPrice) / board.msrpUsd) * 100)
      : null);

  if (discountPercent !== null && discountPercent > 0) {
    let discountScore: number;
    if (discountPercent >= 50) discountScore = 1.0;
    else if (discountPercent >= 40) discountScore = 0.9;
    else if (discountPercent >= 30) discountScore = 0.75;
    else if (discountPercent >= 20) discountScore = 0.55;
    else if (discountPercent >= 10) discountScore = 0.35;
    else discountScore = 0.2;
    total += discountScore * 0.5;
    weights += 0.5;
  }

  // Premium tier based on MSRP or best price
  const msrp = board.msrpUsd ?? bestPrice;
  if (msrp > 0) {
    let premiumScore: number;
    if (msrp >= 600) premiumScore = 1.0;
    else if (msrp >= 500) premiumScore = 0.85;
    else if (msrp >= 400) premiumScore = 0.65;
    else if (msrp >= 300) premiumScore = 0.45;
    else premiumScore = 0.25;
    total += premiumScore * 0.35;
    weights += 0.35;
  }

  // Year
  if (board.year) {
    const currentYear = new Date().getFullYear();
    const age = currentYear - board.year;
    let yearScore: number;
    if (age >= 3) yearScore = 0.9;
    else if (age >= 2) yearScore = 0.8;
    else if (age >= 1) yearScore = 0.6;
    else yearScore = 0.4;
    total += yearScore * 0.15;
    weights += 0.15;
  }

  if (weights === 0) return 0.3;
  return Math.round((total / weights) * 100) / 100;
}

export function getListingsByRunId(runId: string): Listing[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM listings WHERE run_id = ? ORDER BY sale_price_usd ASC")
    .all(runId) as Record<string, unknown>[];
  return rows.map(mapRowToListing);
}

function mapRowToNewBoard(row: Record<string, unknown>): Board {
  return {
    boardKey: row.board_key as string,
    brand: row.brand as string,
    model: row.model as string,
    year: (row.year as number) || null,
    flex: (row.flex as number) || null,
    profile: (row.profile as string) || null,
    shape: (row.shape as string) || null,
    category: (row.category as string) || null,
    terrainScores: {
      piste: (row.terrain_piste as number) ?? null,
      powder: (row.terrain_powder as number) ?? null,
      park: (row.terrain_park as number) ?? null,
      freeride: (row.terrain_freeride as number) ?? null,
      freestyle: (row.terrain_freestyle as number) ?? null,
    },
    abilityLevelMin: (row.ability_level_min as string) || null,
    abilityLevelMax: (row.ability_level_max as string) || null,
    msrpUsd: (row.msrp_usd as number) || null,
    manufacturerUrl: (row.manufacturer_url as string) || null,
    description: (row.description as string) || null,
    beginnerScore: (row.beginner_score as number) || 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapRowToListing(row: Record<string, unknown>): Listing {
  return {
    id: row.id as string,
    boardKey: row.board_key as string,
    runId: row.run_id as string,
    retailer: row.retailer as string,
    region: row.region as string,
    url: row.url as string,
    imageUrl: (row.image_url as string) || null,
    lengthCm: (row.length_cm as number) || null,
    widthMm: (row.width_mm as number) || null,
    currency: row.currency as string,
    originalPrice: (row.original_price as number) || null,
    salePrice: row.sale_price as number,
    originalPriceUsd: (row.original_price_usd as number) || null,
    salePriceUsd: row.sale_price_usd as number,
    discountPercent: (row.discount_percent as number) || null,
    availability: row.availability as string,
    scrapedAt: row.scraped_at as string,
    condition: (row.condition as string) || "unknown",
    gender: (row.gender as string) || "unisex",
    stockCount: (row.stock_count as number) ?? null,
    comboContents: (row.combo_contents as string) || null,
  };
}

// ===== Orphan Board Cleanup =====

export function deleteOrphanBoards(): number {
  const db = getDb();
  const result = db.prepare(
    "DELETE FROM boards WHERE board_key NOT IN (SELECT DISTINCT board_key FROM listings)"
  ).run();
  return result.changes;
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

// ===== Review Sitemap Cache =====

export interface SitemapEntry {
  url: string;
  slug: string;
  brand: string;
  model: string;
  fetchedAt: string;
}

export function getSitemapCache(): SitemapEntry[] {
  const db = getCacheDb();
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
  const db = getCacheDb();
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
  const db = getCacheDb();
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
  const db = getCacheDb();
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
