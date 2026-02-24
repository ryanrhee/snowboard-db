# Task 19: Jones Snowboards Manufacturer Scraper

## Status: Done (2026-02-24)

## Goal

Add a manufacturer scraper for Jones Snowboards, the highest-impact brand without a scraper (20 boards, 25 listings in DB).

## Context

Jones uses Shopify, same platform as CAPiTA. The `/collections/snowboards/products.json` API is confirmed working and returns 20 products with body descriptions, prices, and variant data.

## Approach

Follow the CAPiTA scraper pattern (`capita.ts`):

1. **Primary: Shopify JSON API** (`/collections/snowboards/products.json`)
   - Paginated fetch (up to 5 pages)
   - Filter to snowboard products by tags
   - Extract model name, MSRP from first variant price, parse `body_html` for specs

2. **Detail pages** (fetched per product, concurrency 3)
   - Terrain ratings: `.spec .spec-details` elements with "On-piste / All-mountain: 7/10" etc.
   - Size chart: `#size-finder-data-table` with boot size ranges and weight per size
   - Description: `.product-specs-description`
   - JSON-LD: aggregate rating + review count

3. **Spec extraction from body_html:**
   - Shape: keywords like "tapered directional", "true twin", "directional twin"
   - Profile: "camber", "rocker", "CamRock" etc.
   - Category: "freeride", "all-mountain", "freestyle", "park", "powder"
   - Flex: any flex rating mentions

4. **Model name cleaning:** Strip "Men's ", "Women's ", " Snowboard" suffixes, year suffixes like "2025" or "2026"

## Files to Create/Modify

- **Create:** `src/lib/manufacturers/jones.ts`
- **Modify:** `src/lib/manufacturers/registry.ts` (add jones to ALL_MANUFACTURERS)

## Testing

- Run `./debug.sh '{"action":"scrape-specs"}'` to test through pipeline
- Verify spec_sources and spec_cache tables have jones entries

## Results

- **33 boards** in spec_cache with manufacturer source
- **~130 spec_source entries**: 28 category, 23 shape, 23 gender, 16 profile, 6 ability level
- MSRP populated for all boards
- Profile detected via keyword matching (camber, CamRock, etc.)
- Shape detected (tapered directional, directional twin, true twin, etc.)
- Category derived from body text keywords (freeride, all-mountain, freestyle, etc.)
- Detail page terrain rating extraction implemented but most ratings found via body text
