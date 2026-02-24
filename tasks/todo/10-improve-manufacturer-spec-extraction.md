# Task 10: Improve manufacturer scraper spec extraction (especially flex)

## Problem

Flex coverage remains the weakest spec across all brands. Jones (the largest brand by board count tied with CAPiTA) has 0 flex values from the manufacturer scraper.

## Current state (2026-02-25)

Overall spec coverage across 233 boards: flex 128 (55%), profile 193 (83%), shape 194 (83%), category 219 (94%).

### Brands with manufacturer scrapers

| Brand | Boards | flex | profile | shape | category | Notes |
|-------|--------|------|---------|-------|----------|-------|
| Jones | 40 | 0 ❌ | 27 | 31 | 36 | No flex in body_html; needs detail page extraction |
| CAPiTA | 40 | 39 ✅ | 32 | 33 | 34 | Good coverage |
| Burton | 35 | 34 ✅ | 35 ✅ | 35 ✅ | 32 | Good coverage via Personality slider |
| Lib Tech | 30 | 25 ✅ | 21 | 19 | 30 | Profile/shape gaps on some boards |
| GNU | 29 | 24 ✅ | 19 | 17 | 29 | Same Mervin platform gaps as Lib Tech |

### Brands WITHOUT manufacturer scrapers (15 brands, 59 boards)

Yes. (12 boards, 44 listings), Season (6, 43), Sims (6, 24), Arbor (5, 10), Rossignol (5, 25), Dinosaurs Will Die (4, 5), Salomon (4, 13), Nitro (3, 3), Ride (3, 5), Rome (3, 9), Bataleon (2, 13), Never Summer (2, 2), K2 (1, 1), Roxy (1, 2), Telos (1, 1), Weston (1, 4).

### What each scraper extracts

**CAPiTA** (`src/lib/manufacturers/capita.ts`):
- Source: Shopify products.json API + detail pages
- flex: ✅ from body_html regex or hexagon chart
- profile: ✅ parsed from product tags (hybrid camber, camber, rocker, etc.)
- shape: ✅ parsed from product tags (true twin, directional, directional twin)
- category: partial from text keywords
- extras: tags, hexagon scores (jibbing/groomers/powder/jumps/versatility/skill level)

**Burton** (`src/lib/manufacturers/burton.ts`):
- Source: burton.com catalog + `window.__bootstrap` JSON on detail pages
- flex: ✅ from `productSliders` "Personality" slider (0–100 scale → 1–10 via midpoint)
- profile: ✅ mapped from "Board Bend" attr (Flying V → hybrid_rocker, PurePop → hybrid_rocker, etc.)
- shape: ✅ mapped from "Board Shape" attr
- category: ✅ mapped from "Board Terrain" attr
- extras: bend, camber, skill level, weight range, dimensions, stance

**Lib Tech** (`src/lib/manufacturers/lib-tech.ts`):
- Source: lib-tech.com catalog + detail pages + spec tables
- flex: ✅ from spec table column header containing "flex"
- profile: ✅ from full page text + contour image filenames (C2/C2x/C3/BTX)
- shape: partial — regex (true twin/directional) from full page text
- category: ✅ text keywords
- extras: all spec table columns, infographic-based ability level

**Jones** (`src/lib/manufacturers/jones.ts`):
- Source: Shopify products.json API + detail pages
- flex: ❌ not found in body_html; Jones doesn't include flex ratings in descriptions
- profile: ✅ CamRock, camber, rocker keywords from body_html
- shape: ✅ tapered directional, directional twin, etc. from body_html
- category: ✅ from body_html keywords or derived from terrain ratings
- extras: terrain ratings (on-piste, freeride, freestyle scores)

**GNU** (`src/lib/manufacturers/gnu.ts`):
- Source: gnu.com catalog + detail pages (Mervin Magento, same as Lib Tech)
- flex: ✅ from spec table
- profile: from description text + contour images (C2/C2x/C3/BTX)
- shape: partial — regex from full page text
- category: ✅ text keywords
- extras: spec table columns, infographic-based ability level

## Completed subtasks

### 1. ✅ Parse profile/shape from CAPiTA `tags` field
Done — CAPiTA profile 3→32, shape 2→33.

### 2. ✅ Improve Lib Tech profile/shape coverage
Done — Lib Tech profile 7→21 via full page text + contour image search.

### 3. ✅ Extract Burton flex from Personality slider
Done — Burton flex 0→34. The `productSliders` array in `__bootstrap` JSON contains a "Personality" slider with `lowerValue`/`upperValue` on a 0–100 scale (soft→stiff). Midpoint mapped to 1–10 flex rating.

### 4. ✅ Add Jones manufacturer scraper
Done (task 19) — Jones now has 40 boards with profile, shape, and category coverage. Flex remains at 0 because Jones doesn't publish flex ratings in body_html.

### 5. ✅ Add GNU manufacturer scraper
Done (task 20) — GNU now has 29 boards with flex from spec tables and profile/shape from text + contour images.

## Remaining subtasks

### 6. Extract Jones flex from detail pages
Jones product pages may have flex info in structured elements not captured by body_html parsing. Needs investigation of actual detail page HTML.

### 7. Improve Lib Tech/GNU shape coverage
Shape coverage is still incomplete (Lib Tech 19/30, GNU 17/29). The regex-based detection misses boards where shape info is in non-standard locations.

### 8. Add manufacturer scrapers for top missing brands
Yes. (12 boards, 44 listings), Season (6, 43), Rossignol (5, 25) — would cover the highest-listing uncovered brands. See `docs/manufacturers.md` for full priority list.
