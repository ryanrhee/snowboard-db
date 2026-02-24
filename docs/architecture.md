# Architecture

This document describes the snowboard-finder system architecture as of Tasks 18 and 22.

## Pipeline Overview

The pipeline is orchestrated by `runSearchPipeline()` in `src/lib/pipeline.ts`. It runs in these phases:

1. **Setup** — Accept an optional `ScrapeScope` to filter which scrapers run. Generate a unique `runId`.
2. **Scraping** — Run all selected scrapers in parallel via `Promise.allSettled()`. Each returns `ScrapedBoard[]`.
3. **Coalescence** — Group scraped boards by identity (`brand|model|gender`), write all specs to `spec_sources`, build `Board` and `Listing` entities.
4. **Spec resolution** — Apply priority-based spec resolution across sources (manufacturer > review-site > retailer). Calculate beginner scores.
5. **Price enrichment** — Fill in discount percentages using manufacturer MSRP.
6. **Persistence** — Upsert boards, insert listings, record the search run, prune expired cache entries.

### ScrapeScope

Defined in `src/lib/types.ts`:

```typescript
interface ScrapeScope {
  regions?: Region[] | null;        // US, KR
  retailers?: string[] | null;      // e.g. ["tactics", "evo"]
  manufacturers?: string[] | null;  // e.g. ["burton", "capita"]
}
```

- `null` / `undefined` = include all of that type
- Empty array `[]` = skip that type entirely
- Array with values = include only those scrapers

### Board Sources

**Retailers** produce boards with listings (price, size, availability). Specs are optional/partial.

**Manufacturers** produce boards without listings. Specs are authoritative (flex, profile, shape, category, MSRP).

**Review sites** do **not** produce boards. They provide spec enrichment only (currently inactive — see [Review Sites](#review-sites) below).

## Scraper Registry

`src/lib/scrapers/registry.ts` provides a unified `getScrapers()` function that wraps both retailer and manufacturer modules into a common `ScraperModule` interface.

```
getScrapers(opts?)
  ├── getRetailers(regions, retailers)  →  wrap each as ScraperModule
  └── getManufacturers(manufacturers)   →  wrap each as ScraperModule
```

### Retailers (`src/lib/retailers/registry.ts`)

| Retailer     | Region | Fetch Method | Status |
|-------------|--------|-------------|--------|
| Tactics      | US     | Plain HTTP   | Active |
| Evo          | US     | Browser/CDP  | Active |
| Backcountry  | US     | Browser/CDP  | Active |
| REI          | US     | Browser/CDP  | Active |
| BestSnowboard| KR     | Plain HTTP   | Inactive (Cloudflare-blocked) |

`ACTIVE_RETAILERS` controls which are included by default.

### Manufacturers (`src/lib/manufacturers/registry.ts`)

Burton, Lib Tech, CAPiTA, Jones, GNU. All use plain HTTP. No active/inactive gating — all are always available.

### Filtering Examples

```bash
# Only specific retailers
./debug.sh '{"action":"run","retailers":["tactics","evo"]}'

# Only manufacturers
./debug.sh '{"action":"run-manufacturers","manufacturers":["burton","capita"]}'

# Both
./debug.sh '{"action":"run","retailers":["tactics"],"manufacturers":["burton"]}'
```

## Two-Phase Scraping

The fetch method is chosen per scraper module at import time — there is no runtime decision.

**Phase 1 — Plain HTTP** (`fetchPage()` in `src/lib/scraping/utils.ts`):
- Uses `undici` with random user-agent rotation
- Checks HTTP cache first; only fetches on miss/expiry
- Fast, no browser overhead
- Used by: Tactics, BestSnowboard, all manufacturers

**Phase 2 — CDP-Assisted Browser** (`fetchPageWithBrowser()` in `src/lib/scraping/browser.ts`):
- Launches Playwright Chromium with per-domain context pooling
- Blocks images/fonts/media; waits 3s for JS rendering
- Checks same HTTP cache as Phase 1
- Required for JS-heavy or bot-protected sites
- Used by: Evo, Backcountry, REI

Both phases write to the same `http_cache` table, so a page fetched by browser is cached for plain HTTP reads on subsequent runs.

## Debug Route Actions

All actions are triggered via POST to `/api/debug` (use `./debug.sh` wrapper). Defined in `src/app/api/debug/route.ts`.

### `run` (alias: `metadata-check`)

Re-runs the pipeline with default scope (all active retailers, no manufacturers).

```bash
./debug.sh '{"action":"run"}'
./debug.sh '{"action":"run","retailers":["tactics"]}'
```

### `run-full` (alias: `full-pipeline`)

Runs pipeline with all retailers and all manufacturers (no scope filters).

```bash
./debug.sh '{"action":"run-full"}'
```

### `run-manufacturers` (alias: `scrape-specs`)

Runs manufacturer scrapers only. Retailers are excluded (`retailers: []`).

```bash
./debug.sh '{"action":"run-manufacturers"}'
./debug.sh '{"action":"run-manufacturers","manufacturers":["burton"]}'
```

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

The Good Ride (`src/lib/review-sites/the-good-ride.ts`) provides spec enrichment but **does not produce boards**. It is not registered in the scraper registry and is never called during the scraping phase.

Functions: `getSitemapIndex()`, `resolveReviewUrl(brand, model)`, `scrapeReviewSpecs(url)`, `tryReviewSiteLookup(brand, model)`.

Sitemap and URL mappings are cached in the cache DB. When enabled, review-site specs are written to `spec_sources` with `source = "review-site"` and prioritized between manufacturer and retailer specs during resolution.

**Gap:** The original Task 18 spec called for review sites to produce boards as a source (not just specs). This was not implemented. Review sites remain spec-only enrichment sources.

## What Was Deleted (Task 18)

Task 18 removed substantial unused code:

- **LLM enrichment** — Anthropic client integration, LLM-based spec extraction, LLM judgment/voting. The pipeline had an LLM enrichment step that called Claude to resolve ambiguous specs; this was disabled in code and then deleted.
- **Value scoring** — Computed value scores for boards based on price vs. spec quality. Removed as unused.
- **Board normalization** — A separate normalization pass that attempted to canonicalize brand/model names. Removed in favor of simpler identity keying.
- **Complex debug actions** — The debug route was simplified from many experimental actions down to the 5 operational ones listed above.

The rationale: all of this code was either disabled behind flags or completely unreachable. Removing it reduced maintenance burden and made the codebase easier to understand.
