# Task 20: GNU Snowboards Manufacturer Scraper

## Status: Done (2026-02-24)

## Goal

Add a manufacturer scraper for GNU Snowboards, the next highest-impact brand without a scraper (5 boards in DB with 16 listings, plus many more on GNU's site).

## Context

GNU uses the same Magento 2 platform as Lib Tech (both are Mervin Manufacturing brands). The `lib-tech.ts` scraper was adapted with minimal changes: different base URL, GNU brand name, and GNU-specific infographic slug mapping.

## Approach

Adapted the Lib Tech scraper pattern (`lib-tech.ts`):

1. **Catalog pages** — Scrape both `/snowboards/mens` and `/snowboards/womens` collection pages for product links, names, prices
2. **Detail pages** (fetched per product, concurrency 3) extract:
   - Columnar spec table (same format as Lib Tech): Size, Contact Length, Flex, Weight Range, etc.
   - Profile from description text and contour images (C2, C2x, C3, BTX, B.C.)
   - Shape from description (true twin, directional twin, directional)
   - Category from description (all-mountain, freestyle, freeride, powder, park)
   - Ability level from description text and infographic images
   - MSRP from JSON-LD Product schema

3. **Model name cleaning:** Strip "GNU " prefix and " Snowboard" suffix

## Files Created/Modified

- **Created:** `src/lib/manufacturers/gnu.ts`
- **Modified:** `src/lib/manufacturers/registry.ts` (added gnu to ALL_MANUFACTURERS)

## Results

- **25 boards** scraped from GNU website
- **298 spec_source entries** with `manufacturer:gnu` source:
  - 25 category, 24 flex, 15 profile, 13 shape, 2 ability level
  - Full spec table data (size, contact length, sidecut, nose/tail width, waist width, stance, weight range)
- MSRP populated for boards with JSON-LD pricing
- Mervin profile terms (C2, C2x, C3, BTX) correctly detected
