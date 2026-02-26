# Task 38: Enrich boards with review site data

## Problem

The Good Ride review site scraper (`src/lib/review-sites/the-good-ride.ts`) is fully implemented — sitemap parsing, fuzzy URL matching, HTML spec extraction — but is not wired into the pipeline. Review site data (flex, profile, shape, category, abilityLevel, MSRP) is never collected, even though the spec resolution priority system already defines `review-site` as priority 3 (between manufacturer at 4 and retailer at 2).

## Goal

After retailer and manufacturer scraping finishes, look up each board identity in The Good Ride and write any found specs into `spec_sources` with source `review-site:the-good-ride`. This is an enrichment step — review sites should only add data for boards that already exist from retailer/manufacturer scraping, not introduce new boards.

## Approach

### 1. Add enrichment step in `coalesce()` or post-coalesce

The natural integration point is in `src/lib/scrapers/coalesce.ts`, after board groups are formed but while `setSpecSource` calls are being made. For each board group key (brand|model):

1. Call `tryReviewSiteLookup(brand, model)` to resolve and fetch the review page
2. If specs are returned, call `setSpecSource(key, field, "review-site:the-good-ride", value, sourceUrl)` for each field (flex, profile, shape, category, abilityLevel)
3. Write extras into spec_sources the same way retailer extras are handled
4. If `msrpUsd` is returned, feed it into the MSRP resolution path

### 2. Rate limiting and caching

- The sitemap is already cached in `review_sitemap_cache` (24h TTL)
- URL resolution results are already cached in `review_url_map` (hits: indefinite, misses: 7 days)
- Review page HTML should go through `http_cache` to avoid re-fetching on subsequent runs — `fetchPage` in `the-good-ride.ts` doesn't currently use the HTTP cache; it should
- Add a delay between review page fetches (use `config.scrapeDelayMs`)

### 3. Existing code that needs no changes

- `tryReviewSiteLookup(brand, model)` — already exported, returns `ReviewSiteSpec | null`
- `resolveReviewUrl(brand, model)` — fuzzy matching with Dice coefficient, already cached
- `getSitemapIndex()` — sitemap fetching/parsing, already cached
- `parseReviewHtml()` — HTML parsing, already tested
- `spec-resolution.ts` — already has `"review-site": 3` priority

### 4. Normalization

Review site values need normalization before writing to spec_sources, same as retailer/manufacturer values. The existing `normalizeFlex`, `normalizeProfile`, `normalizeShape`, `normalizeCategory`, `normalizeAbilityLevel` functions should be applied.

## Files to modify

- `src/lib/scrapers/coalesce.ts` — Add review site enrichment loop after board groups are formed
- `src/lib/review-sites/the-good-ride.ts` — Route `fetchPage` calls through `http_cache` for caching; add delay between fetches

## Related tasks

- **Task 12** (infographic pixel analysis): Uses The Good Ride ability level ratings as ground truth for calibrating Lib Tech/GNU infographic thresholds. Once this task is done, review-site abilityLevel values will be available in `spec_sources` for direct comparison against infographic-derived values, replacing the manual research done in task 12's Step 1.
- **Task 14** (MSRP source priority): The Good Ride provides MSRP (`List Price`) for reviewed boards. This is an additional MSRP source that sits between manufacturer and retailer in priority, useful when no manufacturer scraper exists for a brand (e.g. Ride, Rossignol, Salomon).
- **Task 24** (collapse board specs into spec_sources): Review site data will flow through `spec_sources` exclusively, consistent with the direction of removing duplicated spec columns from the `boards` table.


- Unlike retailer/manufacturer scrapers which discover boards, review site enrichment only looks up boards that already exist in the pipeline output. It should never add new board entries.
- First run will be slow (fetching sitemap + review pages for each board). Subsequent runs will be fast due to caching.
- Miss caching (7-day TTL) prevents repeated lookups for boards The Good Ride doesn't review.
