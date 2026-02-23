# Task 10: Improve manufacturer scraper spec extraction (especially flex)

## Problem

Only 10/104 boards have `flex` populated. Profile (51), shape (52), and category (58) are better but still incomplete.

## Audit results

### Brands with manufacturer scrapers

| Brand | Boards | flex | profile | shape | category | Notes |
|-------|--------|------|---------|-------|----------|-------|
| CAPiTA | 39 | 39 ✅ | 3 ❌ | 2 ❌ | 31 | profile/shape in `tags` but not parsed out |
| Burton | 34 | 0 ❌ | 34 ✅ | 34 ✅ | 31 | No flex attribute on detail pages |
| Lib Tech | 25 | 25 ✅ | 7 ❌ | 11 ❌ | 25 | profile/shape from description regex, misses many |

### Brands WITHOUT manufacturer scrapers

Jones (25 boards), Yes. (17), Sims (7), GNU (7), Season (6), DWD (5), Salomon (4), Rossignol (4), Ride (4), Nitro (4), Arbor (4), Rome (3), Never Summer (2), Bataleon (2), Weston (1), Telos (1), Roxy (1), K2 (1).

### What each scraper extracts

**CAPiTA** (`src/lib/manufacturers/capita.ts`):
- Source: Shopify products.json API + detail pages
- flex: ✅ from hexagon chart / description regex
- profile: ❌ regex from body rarely matches; data IS in `tags` (e.g. "hybrid camber", "camber")
- shape: ❌ regex from body rarely matches; data IS in `tags` (e.g. "true twin", "directional")
- category: partial from text keywords
- extras: tags, hexagon scores (jibbing/groomers/powder/jumps/versatility/skill level)

**Burton** (`src/lib/manufacturers/burton.ts`):
- Source: burton.com catalog + `window.__bootstrap` JSON on detail pages
- flex: ❌ not available in any known attribute
- profile: ✅ mapped from "Board Bend" attr (Flying V → hybrid_rocker, PurePop → hybrid_rocker, etc.)
- shape: ✅ mapped from "Board Shape" attr
- category: ✅ mapped from "Board Terrain" attr
- extras: bend, camber, skill level, weight range, dimensions, stance

**Lib Tech** (`src/lib/manufacturers/lib-tech.ts`):
- Source: lib-tech.com catalog + detail pages + spec tables
- flex: ✅ from spec table column header containing "flex"
- profile: ❌ regex (C2/C2x/C3/BTX) matches some but not all
- shape: ❌ regex (true twin/directional) from description, misses many
- category: ✅ text keywords
- extras: all spec table columns, infographic-based ability level

## Subtasks

### 1. Parse profile/shape from CAPiTA `tags` field
Quick win — 36+ boards would gain profile and shape immediately.

### 2. Improve Lib Tech profile/shape regex coverage
Check what's being missed and expand patterns.

### 3. Investigate Burton flex source
Burton may not publish flex ratings; may need to source from retailers or review sites only.

### 4. Add manufacturer scrapers for top missing brands
Jones, GNU, Ride, Nitro, Salomon, Arbor — would cover most remaining boards.
