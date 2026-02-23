# Task 11: Unify scraper execution architecture

**Completed: 2026-02-24**

## Summary of Changes

Replaced the two-family scraper system (retailers return `RawBoard[]`, manufacturers return `ManufacturerSpec[]`, run independently) with a single unified pipeline where all scrapers return `ScrapedBoard[]` and a coalescence stage merges everything.

### New Files
- `src/lib/scrapers/types.ts` — `ScrapedBoard`, `ScrapedListing`, `ScraperModule` interfaces
- `src/lib/scrapers/adapters.ts` — `adaptRetailerOutput()` and `adaptManufacturerOutput()` wrap existing scrapers
- `src/lib/scrapers/registry.ts` — `getScrapers()` returns unified `ScraperModule[]` from both retailers and manufacturers
- `src/lib/scrapers/coalesce.ts` — `coalesce()` groups by board identity, writes spec_sources, builds Board + Listing entities
- `src/__tests__/adapters.test.ts` — 9 tests for adapter functions
- `src/__tests__/coalesce.test.ts` — 8 tests for coalescence layer

### Modified Files
- `src/lib/pipeline.ts` — Rewritten to use unified flow: getScrapers → scrape all → coalesce → resolveSpecSources → persist
- `src/lib/spec-resolution.ts` — Generic `resolveSpecSources<T>()` works with both `Board[]` and `CanonicalBoard[]`
- `src/lib/types.ts` — Added `skipManufacturers` and `manufacturers` to `ScrapeScope`
- `src/lib/db.ts` — Removed unused `CanonicalBoard` import
- `src/app/api/debug/route.ts` — Updated `metadata-check`, `full-pipeline`, `scrape-specs` actions
- `src/app/api/scrape-specs/route.ts` — Rewired to use `runSearchPipeline()` with manufacturers-only
- `src/scripts/scrape-specs.ts` — Rewired to use `runSearchPipeline()` with manufacturers-only

### Architecture
- Existing scraper files (`retailers/*.ts`, `manufacturers/*.ts`) unchanged — adapters handle the conversion
- `CanonicalBoard` kept in types for backward compat with LLM modules (disabled)
- `normalizeBoard()` kept for debug routes
- Default `metadata-check` action sets `skipManufacturers: true` for fast re-runs
- `full-pipeline` action sets `skipManufacturers: false` to include manufacturer scraping

## Problem

The current pipeline has a rigid two-phase architecture:
1. Retailer scrapers run first, producing listings (price/availability/size data)
2. Manufacturer scrapers run separately, enriching boards with spec data

This creates artificial distinctions:
- Manufacturer sites can have sales/pricing (e.g. burton.com sells direct) but that data is ignored
- Retailer sites have spec info (flex, profile, shape) but it's treated as secondary
- Scrapers depend on ordering — manufacturer enrichment assumes retailer data already exists
- The pipeline's rigid phasing makes it hard to add new sources that blur the line (e.g. a review site that also lists prices)

## Goal

Each website scraper should be independent and return **all** data it finds — specs, listings, pricing, whatever. No scraper depends on another scraper's output. A separate coalescence stage merges everything afterward.

## Architecture

### Phase 1: Scrape (independent, parallelizable)

Each scraper returns a uniform bag of data from its source:
- Board identity (brand, model, year)
- Specs (flex, profile, shape, category, ability level, etc.)
- Listings (price, size, availability, condition, URL)
- MSRP
- Extras (any source-specific metadata)

All scrapers run independently. A retailer scraper and a manufacturer scraper produce the same output shape — they just populate different fields.

### Phase 2: Coalesce (merge + resolve)

After all scrapers finish, merge all data:
- Group by board identity (brand + model)
- Resolve specs using the existing multi-source priority system (manufacturer > review-site > retailer > llm)
- Aggregate listings across retailers
- Resolve MSRP (manufacturer source preferred)

### Phase 3: Query / UI

Filter and display the coalesced data:
- Filter by gender, length, price range, flex, category, etc.
- No data transformation at this layer — just filtering and presentation

## Subtasks

### 1. Design unified scraper output type
Define a single output shape that all scrapers (retailer, manufacturer, review site) return. Must accommodate both listing data (price/size/availability) and spec data (flex/profile/shape).

### 2. Refactor manufacturer scrapers to unified output
Burton, CAPiTA, Lib Tech scrapers currently return `ManufacturerSpec`. Adapt to return the unified type, including any pricing/listing data they already have access to.

### 3. Refactor retailer scrapers to unified output
evo, Tactics, etc. currently return `RawBoard`. Adapt to return the unified type, preserving spec data they extract.

### 4. Build coalescence layer
Replace the current pipeline orchestration with:
- Run all scrapers (any order, parallelizable)
- Collect all unified output
- Group by board identity
- Resolve specs via priority system
- Aggregate listings
- Write to DB

### 5. Remove pipeline ordering dependencies
Eliminate any code that assumes retailers run before manufacturers or vice versa.
