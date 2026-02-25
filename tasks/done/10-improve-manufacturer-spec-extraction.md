# Task 10: Improve manufacturer scraper spec extraction (especially flex)

**Completed: 2026-02-25**

All subtasks done. Remaining infographic-based extraction (Lib Tech/GNU) tracked in Task 12. Rossignol scraper tracked in Task 30. Remaining 13 brands (≤4 boards each) are diminishing returns.

## Problem

Flex coverage remains the weakest spec across all brands. Jones (the largest brand by board count tied with CAPiTA) has 0 flex values from the manufacturer scraper.

## Current state (2026-02-25)

Overall spec coverage across 233 boards: flex 167 (72%), profile 193 (83%), shape 194 (83%), category 219 (94%).

### Brands with manufacturer scrapers

See `docs/manufacturers.md` for full per-scraper details, coverage table, and priority candidates.

Active: Burton, Lib Tech, CAPiTA, Jones, GNU, Yes., Season (7 scrapers).

### Brands WITHOUT manufacturer scrapers (14 brands, 41 boards)

Sims (6, 24), Arbor (5, 10), Rossignol (5, 25), Dinosaurs Will Die (4, 5), Salomon (4, 13), Nitro (3, 3), Ride (3, 5), Rome (3, 9), Bataleon (2, 13), Never Summer (2, 2), K2 (1, 1), Roxy (1, 2), Telos (1, 1), Weston (1, 4).

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

### 6. ✅ Extract Jones flex from detail pages
Done — Jones flex 0→39. Detail pages have a "Personality/Flex" section with a `.specs-container` containing a progress bar widget. The `.spec-ratio-value` element holds a 1-5 rating (labels: "Soft & playful" 1-2, "Happy medium" 3, "Mid-stiff & lively" 4, stiff 5). Converted to 1-10 scale by multiplying by 2. Distribution: 2 (2 kids boards), 4 (8 boards), 6 (15 boards), 8 (13 boards), 10 (1 board — Flagship Pro). Also fixed `ingest.ts` to write individual spec_sources fields even when skipping existing manufacturer cache entries.

### 7. ✅ Improve Lib Tech/GNU shape coverage via infographic analysis
Lib Tech and GNU both encode shape, terrain, rider level, and flex in infographic images. Extracting these via pixel analysis is covered by Task 12 (expanded to cover all infographic-derived props for both brands, not just Lib Tech rider level).

### 8. ✅ Add manufacturer scrapers for top missing brands
Yes. ✅ (12 boards, 44 listings), Season ✅ (6, 43). Rossignol (5, 25) tracked separately in Task 30. Remaining brands have ≤4 boards each — diminishing returns.

**Yes.** — Done. Shopify JSON scraper (`src/lib/manufacturers/yes.ts`). Extracts MSRP from variants, shape/category/profile from body_html keyword matching, gender from title + tags. No detail page scraping (size charts only).

**Season** — Done. Shopify JSON scraper (`src/lib/manufacturers/season.ts`). Extracts MSRP from variants, flex/shape/category/profile from body_html keyword matching. No detail pages or gender derivation needed. 5 boards scraped (Forma, Kin, Lolo, Nexus, Primer).
