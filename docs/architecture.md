# Architecture

This document describes the snowboard-finder system architecture.

## Pipeline Overview

The pipeline is orchestrated by `runSearchPipeline()` in `src/lib/pipeline.ts`. It runs in these phases:

1. **Setup** — Accept an optional `ScrapeScope` to filter which scrapers run. Generate a unique `runId`.
2. **Scraping** — Run all selected scrapers (retailers + manufacturers) in parallel via `Promise.allSettled()`. Each returns `ScrapedBoard[]`. Retailers attach `BrandIdentifier` instances to each `RawBoard`.
3. **Board identification** — `identifyBoards()` uses the strategy system (see [Board Identification Strategies](#board-identification-strategies)) to normalize models and extract profile variants, then groups by identity (`brand|model|gender`). Boards with multiple distinct profile variants are split into separate entries. Returns a map of board key → `BoardGroup`.
4. **Review site scraping** — For each unique board identified in step 3, look up specs from The Good Ride. Produces additional `ScrapedBoard[]` entries with `source: "review-site:the-good-ride"` and empty listings.
5. **Coalescence** — `coalesce()` processes ALL `ScrapedBoard[]` (retailer + manufacturer + review-site) uniformly: groups by identity, writes all specs to `spec_sources`, builds `Board` and `Listing` entities.
6. **Spec resolution** — Apply priority-based spec resolution across sources (manufacturer > review-site > retailer). Calculate beginner scores.
7. **Price enrichment** — Fill in discount percentages using manufacturer MSRP.
8. **Persistence** — Upsert boards, insert listings, record the search run, delete orphan boards, prune expired cache entries.

### ScrapeScope

Defined in `src/lib/types.ts`:

```typescript
interface ScrapeScope {
  regions?: Region[] | null;        // US, KR
  retailers?: string[] | null;      // e.g. ["tactics", "evo"]
  manufacturers?: string[] | null;  // e.g. ["burton", "capita"]
  sites?: string[] | null;          // e.g. ["retailer:tactics", "manufacturer:burton"]
  from?: "scrape" | "review-sites" | "resolve";  // pipeline entry point
}
```

- `null` / `undefined` = include all of that type
- Empty array `[]` = skip that type entirely
- Array with values = include only those scrapers
- `sites` is the unified filter — matches scraper names directly
- `from` controls which pipeline step to start at:
  - `"scrape"` (default) — full pipeline
  - `"review-sites"` — skip retailer/mfr scraping, load boards from DB, run review site enrichment, resolve, score
  - `"resolve"` — skip all scraping, re-resolve specs from existing `spec_sources`, re-score

### Board Sources

**Retailers** produce boards with listings (price, size, availability). Specs are optional/partial.

**Manufacturers** produce boards without listings. Specs are authoritative (flex, profile, shape, category, MSRP).

**Review sites** are scraped after board identification, using the identified board keys as targets. They produce `ScrapedBoard[]` entries (with empty listings) that flow through coalesce like any other source. This ensures review sites only enrich boards that exist from retailer/manufacturer data — they never introduce new boards. Currently: The Good Ride (`review-site:the-good-ride`).

## Board Identification Strategies

Board identification uses a **strategy pattern** to handle manufacturer-specific model normalization and profile variant extraction. Each manufacturer group has its own strategy that transforms raw scraped model names into canonical identities.

### Architecture

```
                     ┌──────────────────────────────┐
                     │        BrandIdentifier        │
                     │  raw → cleaned → canonical    │
                     │  canonical → manufacturer     │
                     │   ("burton"|"mervin"|"default")│
                     └──────────┬───────────────────┘
                                │
                     getStrategy(manufacturer)
                                │
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                     ▼
   BurtonStrategy       MervinStrategy        DefaultStrategy
   (profile names)      (contour codes)       (rider names,
                                               model aliases)
           │                    │                     │
           ▼                    ▼                     ▼
    BoardSignal ──► identify() ──► BoardIdentity
                                    { model, profileVariant }
```

### Key Types (`src/lib/strategies/types.ts`)

- **`BoardSignal`** — Immutable input: `rawModel`, `brand`, `manufacturer`, `source`, `sourceUrl`, optional `profile` and `gender`.
- **`BoardIdentity`** — Computed output: `model` (normalized, profile stripped) and `profileVariant` (e.g. `"camber"`, `"c2x"`, or `null`).
- **`BoardIdentificationStrategy`** — Interface with single method `identify(signal: BoardSignal): BoardIdentity`.

### BrandIdentifier (`src/lib/strategies/brand-identifier.ts`)

Immutable identifier that resolves a raw brand string through three lazy-computed stages:

1. **`cleaned`** — Strip zero-width chars, "Snowboard(s/ing)" suffixes
2. **`canonical`** — Resolve aliases (e.g. `"Lib Technologies"` → `"Lib Tech"`, `"capita"` → `"CAPiTA"`)
3. **`manufacturer`** — Strategy dispatch key: `"burton"`, `"mervin"` (GNU + Lib Tech), or `"default"`

Retailers create `BrandIdentifier` instances at scrape time and attach them to `RawBoard.brand`. The identifier flows through the pipeline: `RawBoard` → `adaptRetailerOutput()` → `ScrapedBoard.brandId` → `identifyBoards()` / `coalesce()`.

### Strategies

**`BurtonStrategy`** — Profile names appear in product titles (Camber, Flying V, Flat Top, PurePop Camber). Extracts the profile suffix from the model name and returns it as `profileVariant`.

**`MervinStrategy`** — Handles GNU and Lib Tech. Contour codes (C2, C2X, C2E, C3, BTX) appear as model suffixes in retailer data (especially evo URLs). Extracts the code as `profileVariant`. If no code is in the model name, derives it from the raw `profile` spec. Also handles GNU-specific transforms: "C " prefix / " C" suffix stripping (profile indicators), "Asym" stripping, GNU/Lib Tech rider names.

**`DefaultStrategy`** — Generic strategy for all other brands. Handles per-brand rider name stripping (CAPiTA, Nitro, Jones, Arbor, Gentemstick, Aesmo), model aliases (`"mega merc"` → `"mega mercury"`, `"paradice"` → `"paradise"`), prefix aliases (`"sb "` → `"spring break "`). Always returns `profileVariant: null` — no profile splitting.

### Shared Normalization (`src/lib/strategies/shared.ts`)

Brand-agnostic transforms composed by each strategy in two phases:

1. **`sharedNormalize()`** (pre-strategy) — Strip unicode, pipe chars, combo/binding info, retail tags, "Snowboard" suffix, years, season suffixes, trailing sizes, gender prefixes/suffixes, brand prefix.
2. **`sharedPostNormalize()`** (post-strategy) — Strip leading "the", replace " - " with space, strip acronym periods, replace hyphens, strip "Package" keyword, clean whitespace.

### Strategy Dispatch

`getStrategy(manufacturer)` in `src/lib/strategies/index.ts` returns the singleton strategy instance. Called from:

- **`identifyBoards()`** — Board grouping and profile variant splitting
- **`adaptRetailerOutput()`** — Grouping `RawBoard[]` into `ScrapedBoard[]`
- **`BoardIdentifier.model`** — Lazy model normalization
- **`specKey()`** — Canonical board key generation

## Scraper Registry

`src/lib/scrapers/registry.ts` provides a unified `getScrapers()` function. Retailers and manufacturers directly implement the `ScraperModule` interface and are registered in a single flat list. Review-site scrapers are not in the registry — they are created dynamically by the pipeline after board identification.

```
getScrapers(opts?)
  → filters ALL_SCRAPERS by: sites, retailers, manufacturers, regions, sourceType
```

### Scrapers

| Scraper Name | Type | Region | Fetch Method | Status |
|-------------|------|--------|-------------|--------|
| `retailer:tactics` | retailer | US | Plain HTTP | Active |
| `retailer:evo` | retailer | US | Browser/CDP | Active |
| `retailer:backcountry` | retailer | US | Browser/CDP | Active |
| `retailer:rei` | retailer | US | Browser/CDP | Active |
| `manufacturer:burton` | manufacturer | — | Plain HTTP | Active |
| `manufacturer:lib tech` | manufacturer | — | Plain HTTP | Active |
| `manufacturer:capita` | manufacturer | — | Plain HTTP | Active |
| `manufacturer:jones` | manufacturer | — | Plain HTTP | Active |
| `manufacturer:gnu` | manufacturer | — | Plain HTTP | Active |
| `manufacturer:yes.` | manufacturer | — | Plain HTTP | Active |
| `manufacturer:season` | manufacturer | — | Plain HTTP | Active |

`BLOCKED_SCRAPERS` controls which scrapers are excluded by default.

See `docs/scrapers.md` for detailed per-scraper documentation.

### Filtering Examples

```bash
# Only specific retailers
./debug.sh '{"action":"run","retailers":["tactics","evo"]}'

# Only manufacturers
./debug.sh '{"action":"run","retailers":[],"manufacturers":null}'

# Unified filter (new)
./debug.sh '{"action":"run","sites":["retailer:tactics","manufacturer:burton"]}'

# Both (backward compat)
./debug.sh '{"action":"run","retailers":["tactics"],"manufacturers":["burton"]}'
```

## Two-Phase Scraping

The fetch method is chosen per scraper module at import time — there is no runtime decision.

**Phase 1 — Plain HTTP** (`fetchPage()` in `src/lib/scraping/utils.ts`):
- Uses `undici` with random user-agent rotation
- Checks HTTP cache first; only fetches on miss/expiry
- Fast, no browser overhead
- Used by: Tactics, all manufacturers

**Phase 2 — CDP-Assisted Browser** (`fetchPageWithBrowser()` in `src/lib/scraping/browser.ts`):
- Launches Playwright Chromium with per-domain context pooling
- Blocks images/fonts/media; waits 3s for JS rendering
- Checks same HTTP cache as Phase 1
- Required for JS-heavy or bot-protected sites
- Used by: Evo, Backcountry, REI

Both phases write to the same `http_cache` table, so a page fetched by browser is cached for plain HTTP reads on subsequent runs.

## Debug Route Actions

All actions are triggered via POST to `/api/debug` (use `./debug.sh` wrapper). Defined in `src/app/api/debug/route.ts`.

### `run`

Runs the scrape pipeline. Default: all scrapers (retailers + manufacturers). Use `sites`, `retailers`, or `manufacturers` to filter. Use `from` to start at a later pipeline step.

```bash
# All scrapers
./debug.sh '{"action":"run"}'

# Specific scrapers by name
./debug.sh '{"action":"run","sites":["retailer:tactics","manufacturer:burton"]}'

# All retailers, no manufacturers
./debug.sh '{"action":"run","manufacturers":[]}'

# No retailers, all manufacturers
./debug.sh '{"action":"run","retailers":[]}'

# Specific retailers + specific manufacturers
./debug.sh '{"action":"run","retailers":["tactics"],"manufacturers":["burton"]}'

# Re-run review site enrichment + resolve (skip retailer/mfr scraping)
./debug.sh '{"action":"run","from":"review-sites"}'

# Re-resolve specs from existing spec_sources (skip all scraping)
./debug.sh '{"action":"run","from":"resolve"}'
```

Legacy aliases (`metadata-check`, `run-full`, `full-pipeline`, `scrape-specs`, `run-manufacturers`) all map to `run`.

### `slow-scrape`

Rate-limited fetching to populate the HTTP cache for detail pages (primarily REI). Stops on WAF blocks.

```bash
./debug.sh '{"action":"slow-scrape"}'
./debug.sh '{"action":"slow-scrape","delayMs":30000,"maxPages":3}'
./debug.sh '{"action":"slow-scrape","useSystemChrome":true}'
```

Parameters: `delayMs` (default 20s), `maxPages` (default 5), `useSystemChrome` (default false — connect to Chrome at `--remote-debugging-port=9222`).

### `scrape-status`

Reports HTTP cache coverage per retailer (total URLs, cached, uncached).

```bash
./debug.sh '{"action":"scrape-status"}'
```

## Database Split

Two SQLite files with independent lifecycles.

### Main DB — `data/snowboard-finder.db`

Env var: `DB_PATH`. Accessed via `getDb()`.

Contains pipeline output (re-derivable, safe to delete) and accumulated spec data:

| Table | Purpose | Safe to clear? |
|-------|---------|---------------|
| `search_runs` | Pipeline run metadata | Yes |
| `boards` | One row per brand\|model\|gender | Yes |
| `listings` | One row per retailer×board×size | Yes |
| `boards_legacy` | Deprecated flat schema | Yes |
| `spec_sources` | Multi-source spec provenance | Only to re-derive |
| `spec_cache` | Enrichment results keyed by input hash | Only to re-enrich |

### Cache DB — `data/http-cache.db`

Env var: `CACHE_DB_PATH`. Accessed via `getCacheDb()`.

Contains long-lived caches (~50 MB). Expensive to rebuild — do not delete casually.

| Table | Purpose |
|-------|---------|
| `http_cache` | Raw HTML bodies, 24h default TTL |
| `review_sitemap_cache` | The Good Ride sitemap (~625 entries) |
| `review_url_map` | Board → review URL mappings (~148 entries) |

### Why the Split

- **Independent lifecycles** — Pipeline output is cheap to regenerate; HTTP cache takes hours of rate-limited fetching.
- **Simpler re-runs** — Delete/reset pipeline output without touching caches.
- **Separate backup/sharing** — Cache DB can be shared between machines.

### Automatic Migration

`getCacheDb()` in `src/lib/db.ts` runs a one-time migration on first access after the split. It checks if the main DB still has cache tables (`http_cache`, `review_sitemap_cache`, `review_url_map`), copies rows to the cache DB via `INSERT OR IGNORE`, then drops those tables from the main DB.

## Review Sites

The Good Ride is integrated as a review-site scraper via `createReviewSiteScraper()` in `src/lib/scrapers/review-site-scraper.ts`. It is not registered in the scraper registry — instead, the pipeline creates it dynamically after board identification, passing the unique `{brand, model}` targets.

The underlying lookup logic lives in `src/lib/review-sites/the-good-ride.ts`: `getSitemapIndex()`, `resolveReviewUrl(brand, model)`, `scrapeReviewSpecs(url)`, `tryReviewSiteLookup(brand, model)`.

Sitemap and URL mappings are cached in the cache DB. Review-site specs are written to `spec_sources` with `source = "review-site:the-good-ride"` and prioritized between manufacturer and retailer specs during resolution.

## What Was Deleted (Task 18)

Task 18 removed substantial unused code:

- **LLM enrichment** — Anthropic client integration, LLM-based spec extraction, LLM judgment/voting. The pipeline had an LLM enrichment step that called Claude to resolve ambiguous specs; this was disabled in code and then deleted.
- **Value scoring** — Computed value scores for boards based on price vs. spec quality. Removed as unused.
- **Board normalization** — A separate normalization pass that attempted to canonicalize brand/model names. Removed in favor of simpler identity keying.
- **Complex debug actions** — The debug route was simplified from many experimental actions down to the 5 operational ones listed above.

The rationale: all of this code was either disabled behind flags or completely unreachable. Removing it reduced maintenance burden and made the codebase easier to understand.
