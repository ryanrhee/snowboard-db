# Task 31: Unify manufacturer and retailer scrapers into a single scraper interface

**Completed:** 2026-02-25

## Summary

Unified the dual `ManufacturerModule`/`RetailerModule` architecture into a single `ScraperModule` interface. All 12 scrapers (7 manufacturer + 5 retailer) now directly implement `ScraperModule` and return `ScrapedBoard[]` from a `scrape()` method. The separate registries, adapter wrappers, and legacy ingest path were eliminated.

### What was done

- Converted all 7 manufacturer scrapers (`burton`, `lib-tech`, `capita`, `jones`, `gnu`, `yes`, `season`) to export `ScraperModule` with `scrape()` → `ScrapedBoard[]`
- Converted all 5 retailer scrapers (`tactics`, `evo`, `backcountry`, `rei`, `bestsnowboard`) to export `ScraperModule` with `scrape()` → `ScrapedBoard[]`
- Rewrote `src/lib/scrapers/registry.ts` as a single flat registry importing all 12 scrapers, with filtering by `sites`, `retailers`, `manufacturers`, `regions`, `sourceType`
- Added `sites?: string[]` to `ScrapeScope` for unified filtering (e.g. `["retailer:tactics", "manufacturer:burton"]`)
- Moved `ManufacturerSpec` into `adapters.ts` as a shared internal intermediate type
- Deleted 5 files: `manufacturers/types.ts`, `manufacturers/registry.ts`, `manufacturers/ingest.ts`, `retailers/types.ts`, `retailers/registry.ts`
- Updated consumers: `pipeline.ts`, `debug/route.ts`, `scrape-specs/route.ts`, `scrape-specs.ts`, `adapters.test.ts`
- Deleted `ingest.test.ts` (tested removed legacy ingest)
- Merged `docs/retailers.md` + `docs/manufacturers.md` → `docs/scrapers.md`
- Updated `docs/architecture.md`, `docs/schema.md`, `src/lib/manufacturers/README.md`

### Verification

- `npx tsc --noEmit` — passes
- `npm run test` — 562 tests pass (14 files)
- `npm run build` — succeeds
- Full pipeline re-run: 249 boards, 366 listings, 0 errors

### What was NOT done (future work)

- Manufacturer listing extraction (Task 26 scope — detecting sale vs. original prices on manufacturer sites)
- Review site as a `ScraperModule` (The Good Ride remains a separate enrichment source)
- Collapsing debug actions `run`/`run-full`/`run-manufacturers` into one (kept for backward compat)
