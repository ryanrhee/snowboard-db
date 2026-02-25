# Task 28: Replace regex text matching with structured DOM extraction in manufacturer scrapers

Completed: 2026-02-25

## Summary

Replaced regex/keyword text matching with structured DOM extraction across all manufacturer scrapers that have detail pages with structured elements. Removed all `parseBodyHtml()` and `extractSpecsFromText()` functions that were doing full-page text regex matching.

## Changes by scraper

### CAPiTA (`capita.ts`)
- **Removed** `parseBodyHtml()` — regex matching on Shopify `body_html` (produced zero matches on all products; body is pure marketing prose)
- **Added** structured extraction in `scrapeDetailPage()`:
  - `.c-product-info__categories` span → profile, shape, category (split on ` / `)
  - `.c-spec .c-spec__value` text → flex numeric (e.g. "TWIN 5.5" → "5.5")
  - Hexagon `data-skills` attribute → terrain scores + skill level (already existed)
- **Removed** redundant `specBars` extraction (`--dot-position` CSS vars) — same data as hexagon and text values
- Tags remain as fallback for profile/shape when detail page fetch fails
- Body HTML key-value regex removed (was matching nothing)

### Lib Tech (`lib-tech.ts`)
- **Replaced** full-page text matching for profile/shape/category with:
  - `[itemprop="description"]` first line → category and shape (e.g. `"FREESTYLE / ALL MOUNTAIN - TWIN"`)
  - `img[alt*="Contour"]` alt text → profile (e.g. `"Lib Tech Original Banana Snowboard Contour"` → `"Original Banana"`)
- Added `mapLibTechCategory()` and `mapLibTechShape()` helpers
- Flex table extraction retained (already structured)

### GNU (`gnu.ts`)
- **Replaced** full-page text matching with:
  - `[itemprop="description"]` first line → category and shape (GNU format: `"FREESTYLE / PARK / TWIN SHAPE"`)
  - `img[alt*="Technology"]` alt text → profile (e.g. `"GNU C2e Snowboard Technology"` → `"C2e"`)
- Added `mapGnuCategory()` and `mapGnuShape()` helpers

### Burton (`burton.ts`)
- **Removed** `extractSpecsFromText()` — text-based fallback for when detail page fetch fails
- `__bootstrap` JSON structured extraction is now the sole source for profile/shape/category/ability level

### Jones (`jones.ts`)
- **Removed** `parseBodyHtml()` — was returning `null` for all spec fields; only extracted extras (key-value pairs from prose that matched nothing useful) and ability level (100% covered by detail page structured extraction)
- Detail page `.specs-container` and `.product-shape-content` are the sole sources

### Yes. / Season (deferred)
- These are Shopify-only scrapers without detail pages — `body_html` is unstructured marketing prose. `parseBodyHtml()` retained as the only available extraction method. Adding detail page fetching would be a separate task.

## Test changes
- Removed `parseBodyHtml` tests from `capita.test.ts`
- Deleted `capita-html.test.ts` (tested removed function)
- Updated `lib-tech-html.test.ts` expectations for structured extraction (profile → "Original Banana", shape → "true twin", category → "freestyle/all-mountain")
- Removed `extractSpecsFromText` tests from `burton.test.ts`
- All 595 tests pass
