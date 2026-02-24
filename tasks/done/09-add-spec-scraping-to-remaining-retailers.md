# Task 9: Add spec scraping to evo, backcountry, and rei scrapers

## Problem

Evo, backcountry, and rei scrapers skip detail pages for speed, returning only listing-level data (price, URL, brand, model). They produce no spec fields (flex, profile, shape, category, ability level).

Only tactics fetches detail pages and extracts specs.

## Goal

Add detail-page fetching (or at least spec extraction from listing pages where available) to evo, backcountry, and rei so that retailer-sourced specs flow into `spec_sources` for these boards too.

## Completed: 2026-02-24

### What was done

**Evo** — Added `fetchBoardDetails()` that fetches detail pages and parses:
- `.pdp-spec-list-item` elements (title/description pairs) for Terrain, Ability Level, Rocker Type, Flex Rating, Shape
- `.pdp-feature` elements (h5 + description) for additional specs
- JSON-LD for brand/model/price/availability enrichment
- Table rows as fallback
- Updated `searchBoards()` to loop over partials and call `fetchBoardDetails()` with delay

**Backcountry** — Rewrote `fetchBoardDetails()` (was already written but never called):
- Wired it into `searchBoards()` (was skipping detail pages entirely)
- Added `ProductGroup` JSON-LD parsing for size variants — now returns one board per size variant (like tactics)
- Added `__NEXT_DATA__` parsing for `pageProps.product.attributes` and `pageProps.product.features` — extracts flex, profile, shape, recommended use, ability level, width, mount, core, base, and 20+ other spec fields
- Added bullet point parsing from `[data-id='detailsAccordion'] li` as fallback for profile and shape
- Backcountry uses Chakra UI with JS-rendered specs that appear as skeleton divs in the HTML, so CSS selector parsing hits empty elements; `__NEXT_DATA__` is the primary data source
- Listings increased from 122 to 182 due to size variant expansion

**REI** — Extracted specs from listing page `tileAttributes`:
- REI blocks detail page access with Akamai WAF (returns "Access Denied" regardless of browser/fetch method)
- The listing page product JSON already contains `tileAttributes` with Style, Shape, Profile, and Flex
- Added `tileAttributes` to `ReiProduct` interface and mapped values to RawBoard spec fields in `searchBoards()`
- No detail page fetching needed — all available specs come from listing data

### Results (spec_sources after pipeline run)

| Source | Boards | Flex | Profile | Shape | Category | Ability Level |
|--------|--------|------|---------|-------|----------|---------------|
| retailer:backcountry | 41 | 41 | 40 | 41 | 40 | 38 |
| retailer:evo | 40 | 40 | 40 | 40 | 40 | 40 |
| retailer:rei | 11 | 11 | 11 | 11 | 11 | 0 |
| retailer:tactics | 19 | 19 | 19 | 19 | 19 | 0 |

Pipeline: 105 boards, 190 listings from 4 scrapers, 0 errors.

### Files modified
- `src/lib/retailers/backcountry.ts` — Rewrote `fetchBoardDetails()`, wired into `searchBoards()`
- `src/lib/retailers/evo.ts` — Added `fetchBoardDetails()`, updated `searchBoards()`
- `src/lib/retailers/rei.ts` — Added `tileAttributes` to `ReiProduct` interface, mapped to spec fields
- `src/app/api/debug/route.ts` — Added temporary debug actions for HTML inspection (evo-detail-html, rei-detail-html, rei-product-data)
