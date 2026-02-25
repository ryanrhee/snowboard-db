# Task 32: Stop merging profile variants into the same board key

**Completed**: 2026-02-25

## Summary of changes

Profile variants (e.g. Burton "Custom Camber" vs "Custom Flying V") are now split into separate board keys via post-grouping collision detection in coalesce.

### Files modified

| File | Change |
|------|--------|
| `src/lib/normalization.ts` | Exported `PROFILE_SUFFIX_RE` constant. Added `keepProfile` option to `normalizeModel()`. Added `extractProfileSuffix(rawModel, brand)` function. |
| `src/lib/scrapers/coalesce.ts` | After initial grouping, detects collisions (multiple manufacturer source URLs per group) and splits into variant sub-groups using suffix extraction, profile spec matching, and brand-specific defaults (camber for Burton, c2 for Lib Tech/GNU). |
| `src/__tests__/coalesce.test.ts` | Updated `specKey` mock to strip profile suffixes. Added 6 test cases: manufacturer splitting, retailer suffix matching, profile-spec matching, default variant assignment, Lib Tech C2 defaults, no-split for single-variant models. |
| `src/lib/types.ts` | Added `extraScrapedBoards` to `ScrapeScope` for pipeline injection. |
| `src/lib/pipeline.ts` | Support `extraScrapedBoards` in pipeline input. |
| `src/lib/retailers/rei.ts` | Refactored: extracted `scrapeRei()` with injectable fetchers, `productsToRawBoards()`, exported `scrapeFromCache()`. Both browser and cache paths share the same core logic. |
| `src/app/api/debug/route.ts` | Rewrote `slow-scrape` action: phase 1 uses `scrapeRei` with cache-then-CDP fetchers to populate REI listings; phase 2 fetches uncached detail pages. Removed `maxPages`, reduced default delay to 5s. |

### Pipeline results

| Model | Before | After |
|-------|--------|-------|
| Burton Custom | `burton\|custom\|unisex` | `burton\|custom camber\|unisex` + `burton\|custom flying v\|unisex` |
| Burton Process | `burton\|process\|unisex` | `burton\|process camber\|unisex` + `burton\|process flying v\|unisex` |
| Burton Feelgood | `burton\|feelgood\|womens` | `burton\|feelgood camber\|womens` + `burton\|feelgood flying v\|womens` |
| Burton Yeasayer | `burton\|yeasayer\|womens` | `burton\|yeasayer camber\|womens` + `burton\|yeasayer flying v\|womens` |
| Lib Tech T. Rice Pro | `lib tech\|t. rice pro\|unisex` | `lib tech\|t. rice pro c2\|unisex` + `lib tech\|t. rice pro camber\|unisex` |
| GNU Ladies Choice | `gnu\|ladies choice\|womens` | `gnu\|ladies choice c2\|womens` + `gnu\|ladies choice camber\|womens` |
