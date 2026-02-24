# Task 16: Scrape all boards, not just sale/clearance listings

## Problem

Two of four scrapers only search sale/clearance pages, missing full-price boards entirely:

| Retailer | Current URL | Scope |
|----------|-------------|-------|
| evo | `/shop/snowboard/snowboards/sale` | Sale only (40 boards) |
| tactics | `/snowboards/sale` | Sale only (~20 boards) |
| backcountry | `/snowboards` | All boards (already correct) |
| rei | `/c/snowboards` | All boards (already correct) |

This means boards like the Lib Tech Skate Banana BTX on evo are never scraped because they're full-price. The pipeline only sees boards that happen to be on sale at evo/tactics, which is a small and shifting subset.

## Goal

Update evo and tactics to scrape all available snowboards, not just sale items. This will significantly increase board coverage and ensure spec data is collected for full-price boards too.

## Approach

### 1. Evo

Change `buildSearchUrl()` from `/shop/snowboard/snowboards/sale` to `/shop/snowboard/snowboards`. Evo's listing page likely has pagination — need to check if the scraper handles multiple pages or just the first page. Currently only fetches one page (40 boards). May need to add pagination support.

### 2. Tactics

Change `buildSearchUrl()` from `/snowboards/sale` to `/snowboards`. Same pagination concern — tactics currently only fetches one page. Their full catalog will be larger and may require multiple page fetches.

### 3. Pagination

Both evo and tactics may paginate their full catalog. Need to:
- Inspect how each site paginates (query params, next page links, infinite scroll)
- Add a loop to fetch subsequent pages until no more products are found
- REI already handles pagination (fetches pages 1-N) — can use as reference

### 4. Performance considerations

- More boards = more detail page fetches. With `http_cache`, subsequent runs are fast.
- First run after this change will be slower due to cache misses on new detail pages.
- May want to add a configurable limit or scope parameter to allow sale-only mode for quick runs.

## Files to modify

- `src/lib/retailers/evo.ts` — Change search URL, add pagination if needed
- `src/lib/retailers/tactics.ts` — Change search URL, add pagination if needed
