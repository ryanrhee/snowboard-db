# Data Model

## Overview

The application uses a **board-centric** SQLite data model. A **board** is a unique snowboard product (one brand + model combination). A **listing** is a single retailer offer for that board at a specific price, size, and URL. This separation means the Burton Custom appears once as a board, with potentially many listings across Evo, Backcountry, REI, etc.

Spec data (flex, profile, shape, category) is gathered from multiple sources — manufacturer websites, review sites, and retailers — and tracked with per-field provenance in `spec_sources`. A priority-based resolution step picks the winning value for each field and writes it to the `boards` row.

Scores are split by concern:
- **Beginner score** is intrinsic to the board (based on specs) and stored on the `boards` row.
- **Value score** depends on pricing and is computed at query time from the best listing.
- **Final score** is `0.6 * beginner + 0.4 * value`, also computed at query time.

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│ search_runs  │       │   boards     │       │ spec_sources │
│              │◄──FK──│              │──PK──►│              │
│  id (PK)     │       │ board_key PK │       │ brand_model  │
│  timestamp   │       │ brand        │       │ field        │
│  constraints │       │ model        │       │ source       │
│  board_count │       │ flex, ...    │       │ value        │
│  duration_ms │       │ beginner_scr │       │ source_url   │
└──────┬───────┘       └──────┬───────┘       └──────────────┘
       │                      │
       │    ┌─────────────────┘
       │    │
       ▼    ▼
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│  listings    │       │ spec_cache   │       │  http_cache  │
│              │       │              │       │              │
│  id (PK)     │       │ brand_model  │       │ url_hash PK  │
│  board_key FK│       │ flex,profile │       │ url          │
│  run_id   FK │       │ shape,categ  │       │ body         │
│  retailer    │       │ msrp_usd     │       │ fetched_at   │
│  price, url  │       │ source       │       │ ttl_ms       │
│  length, ... │       └──────────────┘       └──────────────┘
└──────────────┘
                       ┌──────────────┐       ┌──────────────┐
                       │review_sitemap│       │review_url_map│
                       │    _cache    │       │              │
                       │ url (PK)     │       │ brand_model  │
                       │ slug, brand  │       │ review_url   │
                       │ model        │       │ resolved_at  │
                       └──────────────┘       └──────────────┘
```

## Tables

### `boards`

One row per unique snowboard product. Primary key is `board_key`, formatted as `brand_lowercase|normalized_model_lowercase` (e.g. `burton|custom`, `lib tech|skate banana`).

```sql
CREATE TABLE boards (
  board_key         TEXT PRIMARY KEY,  -- "brand|model" lowercase
  brand             TEXT NOT NULL,
  model             TEXT NOT NULL,
  year              INTEGER,
  flex              REAL,              -- 1-10 scale, resolved from spec_sources
  profile           TEXT,              -- camber, rocker, flat, hybrid_camber, hybrid_rocker
  shape             TEXT,              -- true_twin, directional_twin, directional, tapered
  category          TEXT,              -- all_mountain, freestyle, freeride, powder, park
  ability_level_min TEXT,              -- beginner, intermediate, advanced, expert
  ability_level_max TEXT,
  msrp_usd          REAL,             -- manufacturer suggested retail price
  manufacturer_url  TEXT,              -- link to manufacturer product page
  description       TEXT,
  beginner_score    REAL NOT NULL DEFAULT 0,  -- 0-1, computed from specs
  created_at        TEXT NOT NULL,     -- ISO 8601
  updated_at        TEXT NOT NULL      -- ISO 8601
);
```

**Written by:** pipeline (from retailer data), manufacturer ingest (from scraper data).

**Upsert behavior:** `ON CONFLICT` uses `COALESCE` — new values only overwrite if non-null, preserving existing data. Exception: `beginner_score` always overwrites.

### `listings`

One row per retailer offer. A board can have many listings (different retailers, sizes, prices). Primary key is a SHA-256 hash of `retailer|url|length_cm`.

```sql
CREATE TABLE listings (
  id                 TEXT PRIMARY KEY,  -- SHA-256(retailer|url|length_cm), truncated to 16 chars
  board_key          TEXT NOT NULL REFERENCES boards(board_key),
  run_id             TEXT NOT NULL REFERENCES search_runs(id),
  retailer           TEXT NOT NULL,     -- tactics, evo, backcountry, rei, bestsnowboard
  region             TEXT NOT NULL,     -- US, KR
  url                TEXT NOT NULL,     -- retailer product page URL
  image_url          TEXT,
  length_cm          REAL,              -- board length in centimeters
  width_mm           REAL,              -- waist width in millimeters
  currency           TEXT NOT NULL,     -- USD, KRW
  original_price     REAL,              -- full price in original currency
  sale_price         REAL NOT NULL,     -- current price in original currency
  original_price_usd REAL,
  sale_price_usd     REAL NOT NULL,
  discount_percent   REAL,
  availability       TEXT NOT NULL DEFAULT 'unknown',  -- in_stock, low_stock, out_of_stock, unknown
  scraped_at         TEXT NOT NULL      -- ISO 8601
);
CREATE INDEX idx_listings_board ON listings(board_key);
CREATE INDEX idx_listings_run   ON listings(run_id);
```

**Written by:** pipeline after each search run.

### `search_runs`

One row per search execution. Stores the constraints used and result metadata.

```sql
CREATE TABLE search_runs (
  id                TEXT PRIMARY KEY,  -- UUID
  timestamp         TEXT NOT NULL,     -- ISO 8601
  constraints_json  TEXT NOT NULL,     -- JSON-serialized SearchConstraints
  board_count       INTEGER NOT NULL DEFAULT 0,
  retailers_queried TEXT NOT NULL DEFAULT '',  -- comma-separated retailer names
  duration_ms       INTEGER NOT NULL DEFAULT 0
);
```

### `spec_sources`

Per-field provenance for board specs. Tracks every source's reported value so the UI can show disagreements and the resolution logic can pick winners.

```sql
CREATE TABLE spec_sources (
  brand_model TEXT NOT NULL,           -- same as boards.board_key
  field       TEXT NOT NULL,           -- flex, profile, shape, category, abilityLevel, ...
  source      TEXT NOT NULL,           -- manufacturer, review-site, retailer:evo, llm, judgment
  value       TEXT NOT NULL,           -- the value this source reports
  source_url  TEXT,                    -- URL where the value was found
  updated_at  TEXT NOT NULL,           -- ISO 8601
  PRIMARY KEY (brand_model, field, source)
);
```

**Source priority** (used by `spec-resolution.ts`):

| Priority | Source | Example |
|---|---|---|
| 4 | `manufacturer` | Burton.com product page |
| 3 | `review-site` | The Good Ride review |
| 3 | `judgment` | LLM-resolved disagreement between sources |
| 2 | `retailer:*` | `retailer:evo`, `retailer:tactics`, etc. |
| 1 | `llm` | AI-enriched specs (currently disabled) |

When sources disagree, the highest-priority source wins. If the manufacturer disagrees with 2+ retailers that agree with each other, a judgment call is made via LLM.

### `spec_cache`

Denormalized cache of the "best known" specs per board. One row per `brand_model` key. Used as a fast lookup during the pipeline to avoid re-resolving specs from `spec_sources` on every run.

```sql
CREATE TABLE spec_cache (
  brand_model TEXT PRIMARY KEY,        -- same as boards.board_key
  flex        REAL,
  profile     TEXT,
  shape       TEXT,
  category    TEXT,
  msrp_usd    REAL,
  source      TEXT,                    -- which source provided this cache entry
  source_url  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT
);
```

**Write priority:** manufacturer > review-site > llm. A lower-priority source cannot overwrite a higher-priority cached entry.

### `http_cache`

Generic HTTP response cache. Keyed by URL hash. Used to avoid re-fetching pages during development and repeated runs.

```sql
CREATE TABLE http_cache (
  url_hash   TEXT PRIMARY KEY,         -- SHA-256 of URL
  url        TEXT NOT NULL,
  body       TEXT NOT NULL,            -- raw HTML
  fetched_at INTEGER NOT NULL,         -- Unix timestamp ms
  ttl_ms     INTEGER NOT NULL          -- cache lifetime
);
```

### `review_sitemap_cache`

Cached sitemap entries from review sites (The Good Ride). Used to match boards to review URLs.

```sql
CREATE TABLE review_sitemap_cache (
  url        TEXT PRIMARY KEY,
  slug       TEXT,
  brand      TEXT,
  model      TEXT,
  fetched_at TEXT
);
```

### `review_url_map`

Maps `brand|model` keys to review page URLs. Supports negative caching: a `NULL` `review_url` means "we looked and there's no review," expiring after 7 days.

```sql
CREATE TABLE review_url_map (
  brand_model TEXT PRIMARY KEY,
  review_url  TEXT,                    -- NULL = cached miss (no review exists)
  resolved_at TEXT
);
```

## Key Generation

Board keys and listing IDs are generated deterministically:

- **`board_key`**: `brand.toLowerCase() + "|" + normalizeModel(model, brand).toLowerCase()`
  - Example: `"Burton"` + `"Custom Snowboard - 2026"` → `"burton|custom"`
  - `normalizeModel` strips "Snowboard", years, gender suffixes, brand prefixes, binding info
- **`listing.id`**: `SHA-256(retailer + "|" + url + "|" + lengthCm)`, truncated to 16 hex chars

## Scoring

### Beginner Score (board-level, stored)

Computed from board specs. Factors and weights:

| Factor | Weight | Best for beginners |
|---|---|---|
| Flex | 0.30 | Soft (3-4/10) |
| Profile | 0.30 | Flat or hybrid rocker |
| Shape | 0.15 | True twin |
| Category | 0.25 | All-mountain or freestyle |

Boards missing spec data get a score of 0 for those factors.

### Value Score (query-time, computed)

Computed from the best listing price vs. MSRP. Factors:

| Factor | Weight | Description |
|---|---|---|
| Discount | 0.50 | `(MSRP - bestPrice) / MSRP`, bucketed |
| Premium tier | 0.35 | Higher MSRP = higher quality board on sale |
| Model year age | 0.15 | Older models = better value |

### Final Score (query-time, computed)

```
finalScore = 0.6 * beginnerScore + 0.4 * valueScore
```

## TypeScript Interfaces

The TypeScript types mirror the DB schema:

- **`Board`** — one row from `boards` table
- **`Listing`** — one row from `listings` table
- **`BoardWithListings`** — a `Board` with its `Listing[]` array, plus computed `bestPrice`, `valueScore`, `finalScore`, and optional `specSources` provenance
- **`ScrapedBoard`** — unified scraper output (one per board model per source, with listings array for retailers)
- **`ScraperModule`** — unified scraper interface (name, sourceType, baseUrl, scrape())
- **`RawBoard`** — internal intermediate type within retailer scrapers (one per size/listing)

## Data Flow

```
Retailers (Evo, Tactics, ...)    Manufacturers (Burton,
         │                        Lib Tech, CAPiTA, ...)
         │                                │
         ▼                                ▼
    ScrapedBoard[]               ScrapedBoard[]
         │                                │
         └────────────┬───────────────────┘
                      │
               identifyBoards()
                      │
              board keys: {brand, model}
                      │
                      ▼
            createReviewSiteScraper(targets)
                      │
                      ▼
          Review Sites (The Good Ride)
                      │
                      ▼
               ScrapedBoard[]
                (review-site source,
                 empty listings)
                      │
     ┌────────────────┼─────────────────┐
     │                │                 │
     ▼                ▼                 ▼
  retailer +     manufacturer +    review-site
  ScrapedBoard[] ScrapedBoard[]    ScrapedBoard[]
     │                │                 │
     └────────────┬───┴─────────────────┘
                  │
             coalesce()
                  │
          spec_sources + boards + listings
                  │
         resolveSpecSources()
                  │
             ┌────┴─────┐
             ▼          ▼
          Board[]    Listing[]
             │          │
          upsertBoards()  insertListings()
             │          │
             ▼          ▼
           boards     listings
             table      table
                  │
             getBoardsWithListings()
                  │
                  ▼
            BoardWithListings[]  ──►  API response  ──►  UI
```
