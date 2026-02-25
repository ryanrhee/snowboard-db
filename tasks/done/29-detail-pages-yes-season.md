# Task 29: Add detail page scraping for Yes. and Season

## Problem

Yes. (22 boards) and Season (5 boards) are the only manufacturer scrapers that don't fetch detail pages. They rely solely on Shopify `/products.json` API data, extracting specs by regex-matching the `body_html` field — which is unstructured marketing prose.

This produces low coverage:

| Scraper | Boards | Flex | Profile | Shape | Category |
|---------|--------|------|---------|-------|----------|
| Yes.    | 22     | 1    | 0       | 14    | 9        |
| Season  | 5      | 3    | 2       | 4     | 5        |

All other manufacturers (Burton, CAPiTA, GNU, Jones, Lib Tech) fetch detail pages and extract from structured DOM elements, achieving near-100% coverage.

## Completed: 2026-02-25

Added detail page scraping to both Yes. and Season manufacturer scrapers, replacing `parseBodyHtml()` regex matching with structured DOM extraction.

**Yes. results** (22 boards):
- Flex: 1/22 → 22/22 — extracted from `.bar-chart[data-total]` attribute (0-100 scale → 1-10)
- Shape: 14/22 → 22/22 — extracted from `#contentShape h3` heading
- Category: 9/22 → 22/22 — extracted from tab content text
- Profile: 0/22 — detail pages have no structured profile section (confirmed)

**Season results** (5 boards):
- Flex: 3/5 → 5/5 — extracted from SVG filename pattern `flex-Nof10.svg`
- Shape: 4/5 — some detail pages had shape in image alt text
- Profile: 2/5 — some detail pages had profile in image alt text

**Files modified:**
- `src/lib/manufacturers/yes.ts` — detail page fetching (concurrency 3), removed `parseBodyHtml()`
- `src/lib/manufacturers/season.ts` — detail page fetching (concurrency 3), removed `parseBodyHtml()`

## Approach (original)

1. Check if Yes. and Season detail pages have structured spec elements (spec tables, widgets, data attributes, JSON-LD) similar to other Shopify stores
2. If structured elements exist, add detail page fetching (same pattern as CAPiTA/Jones: concurrency-limited fetch per product handle)
3. Replace `parseBodyHtml()` regex matching with structured extraction
4. If detail pages don't have structured elements, check Shopify metafields API (`/products/{handle}.json` with `?fields=metafields`) as an alternative source
