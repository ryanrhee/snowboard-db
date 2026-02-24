# Task 18: Two-phase scraping architecture (regular + CDP)

## Problem

Some retailers (REI) have aggressive WAFs that block automated requests but allow real browser traffic via Chrome DevTools Protocol (CDP). Currently, CDP-based scraping is a manual step (`slow-scrape` debug endpoint) separate from the pipeline. This works but requires the user to:

1. Launch Chrome with `--remote-debugging-port=9222`
2. Manually run `./debug.sh '{"action":"slow-scrape","useSystemChrome":true}'`
3. Then run the normal pipeline to parse cached pages

## Proposed architecture

Split scraping into two phases:

### Phase 1: Regular scraping (automated, no user intervention)

- All current retailer scrapers run as they do now
- Uses HTTP and headless Playwright
- Detail pages fetched where possible; WAF blocks are handled gracefully
- Pipeline produces complete results using listing-page data + whatever detail pages are cached
- **This phase should produce decently complete data on its own**

### Phase 2: CDP-assisted scraping (optional, requires Chrome setup)

- Targets only "fussy" retailers/pages that Phase 1 couldn't fetch
- Connects to user's Chrome via `chromium.connectOverCDP()`
- Fetches uncached detail pages and stores in `http_cache`
- After completion, re-runs Phase 1 parsing on newly cached pages
- **Enhances data completeness but is not required**

## Design considerations

- Phase 2 should be a separate pipeline action, not integrated into the main `runSearchPipeline()`
- The pipeline should report which pages are missing from cache so the user knows what Phase 2 would add
- Consider a `scrape-status` endpoint that shows: cached vs uncached detail pages per retailer, estimated data improvement from Phase 2
- CDP connection failure should produce a clear message (not running, wrong port, etc.)
- Phase 2 should be idempotent — safe to run multiple times, skips already-cached pages
- Rate limiting (delay between requests) should be configurable per retailer

## Current state

- `slow-scrape` debug endpoint already implements CDP-based fetching for REI
- REI detail pages add: board dimensions, construction, core, effective edge, sidecut radius, stance setback, rider weight, sustainability
- REI listing pages already provide: flex, profile, shape, category via `tileAttributes`
- Evo and backcountry detail pages work fine with regular Playwright (no CDP needed)
