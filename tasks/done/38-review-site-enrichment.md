# Task 38: Enrich boards with review site data

**Completed: 2026-02-26**
**Updated: 2026-02-26** — Restructured into the scraper pipeline (review sites are now "just another source"); added `from` parameter for step-skipping

## Summary

The Good Ride review site data flows into `spec_sources` with source `review-site:the-good-ride`. Review site scraping is integrated into the main pipeline as a `ScraperModule`, processed uniformly by coalesce alongside retailer and manufacturer data.

### Pipeline flow

```
1. Scrape retailers + manufacturers (parallel)    ← from: "scrape" (default)
2. Identify boards: group ScrapedBoards into board keys, split profile variants
3. Scrape review sites: for each unique brand+model  ← from: "review-sites"
4. Coalesce: process ALL ScrapedBoards uniformly
5. Resolve spec sources                            ← from: "resolve"
6. Score, persist
```

Review sites run after board identification (step 2) so they only enrich boards that already exist from retailer/manufacturer data — they never introduce new boards.

The `from` parameter on `ScrapeScope` allows starting the pipeline at a later step, loading prior state from the DB:
- `from: "scrape"` (default) — full pipeline, unchanged behavior
- `from: "review-sites"` — skip retailer/mfr scraping, load boards from DB, run review site enrichment, resolve, score
- `from: "resolve"` — skip all scraping, re-resolve `spec_sources`, re-score

### Key files

1. **`src/lib/scrapers/review-site-scraper.ts`**
   - `createReviewSiteScraper(targets)` — returns a `ScraperModule` that iterates brand/model targets, calls `tryReviewSiteLookup()`, and converts `ReviewSiteSpec` → `ScrapedBoard` with `source: "review-site:the-good-ride"` and empty listings
   - Rate-limited with `config.scrapeDelayMs` between fetches

2. **`src/lib/scrapers/coalesce.ts`**
   - `identifyBoards(allScrapedBoards)` — exported function that groups ScrapedBoards into board keys and splits profile variants. Called by the pipeline to get board targets for review site scraping, and internally by `coalesce()` itself
   - `writeSpecSources(boardKey, scrapedBoards)` — extracted from `coalesce()` so the `from: "review-sites"` path can write review-site specs without re-running full coalesce
   - `coalesce()` processes all sources (retailer + manufacturer + review-site) uniformly, calling `writeSpecSources()` internally

3. **`src/lib/review-sites/the-good-ride.ts`** (unchanged)
   - HTTP cache integration: review page HTML cached in `http_cache` with 7-day TTL

4. **`src/lib/pipeline.ts`**
   - Calls `identifyBoards()` → `createReviewSiteScraper()` → `coalesce()` with all sources combined
   - Branches on `from` parameter for `"review-sites"` and `"resolve"` entry points

5. **`src/lib/types.ts`** — `from` field added to `ScrapeScope`

6. **`src/lib/db.ts`** — `getAllBoards()` added for loading board state from DB

7. **`src/app/api/debug/route.ts`** — passes `from` through to pipeline

### Debug usage

```bash
# Re-run review site enrichment + resolve (skip retailer/mfr scraping)
./debug.sh '{"action":"run","from":"review-sites"}'

# Re-resolve specs from existing spec_sources (skip all scraping)
./debug.sh '{"action":"run","from":"resolve"}'
```

### Verification

- 47 boards matched with The Good Ride reviews out of 159 board groups
- 1,052 spec_source entries written (all fields: flex, profile, shape, abilityLevel, riding style, edge hold, buttering, etc.)
- Example: Lib Tech Skate Banana now has abilityLevel from both `retailer:backcountry` (beginner-advanced) and `review-site:the-good-ride` (beginner-expert)

## Related tasks

- **Task 12** (infographic pixel analysis): TGR abilityLevel values now in spec_sources for threshold calibration
- **Task 14** (MSRP source priority): TGR MSRP available as fallback when no manufacturer scraper exists
- **Task 24** (collapse board specs): Review data flows through spec_sources exclusively
