# Task 10: Improve manufacturer scraper spec extraction (especially flex)

## Problem

Only 10/104 boards have `flex` populated. Profile (51→56), shape (52→56), and category (58) are better but still incomplete.

## Audit results

### Brands with manufacturer scrapers

| Brand | Boards | flex | profile | shape | category | Notes |
|-------|--------|------|---------|-------|----------|-------|
| CAPiTA | 39 | 39 ✅ | 30 ✅ | 31 ✅ | 31 | **Fixed** — profile/shape now parsed from tags |
| Burton | 35 | 34 ✅ | 34 ✅ | 34 ✅ | 31 | **Fixed** — flex from Personality slider in `productSliders` |
| Lib Tech | 25 | 25 ✅ | 15 ✅ | 11 | 25 | **Fixed** — profile from full page text + contour images |

### Brands WITHOUT manufacturer scrapers

Jones (25 boards), Yes. (17), Sims (7), GNU (7), Season (6), DWD (5), Salomon (4), Rossignol (4), Ride (4), Nitro (4), Arbor (4), Rome (3), Never Summer (2), Bataleon (2), Weston (1), Telos (1), Roxy (1), K2 (1).

### What each scraper extracts

**CAPiTA** (`src/lib/manufacturers/capita.ts`):
- Source: Shopify products.json API + detail pages
- flex: ✅ from hexagon chart / description regex
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

## Subtasks

### 1. ✅ Parse profile/shape from CAPiTA `tags` field
Done — CAPiTA profile 3→30, shape 2→31.

### 2. ✅ Improve Lib Tech profile/shape coverage
Done — Lib Tech profile 7→15 via full page text + contour image search.

### 3. ✅ Extract Burton flex from Personality slider
Done — Burton flex 0→34. The `productSliders` array in `__bootstrap` JSON contains a "Personality" slider with `lowerValue`/`upperValue` on a 0–100 scale (soft→stiff). Midpoint mapped to 1–10 flex rating.

### 4. Add manufacturer scrapers for top missing brands
Jones, GNU, Ride, Nitro, Salomon, Arbor — would cover most remaining boards.
