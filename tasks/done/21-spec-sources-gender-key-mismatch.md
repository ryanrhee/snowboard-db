# Task 21: Fix spec_sources gender key mismatch

Completed: 2026-02-24

## Problem

Manufacturer spec_sources were stored under genderless keys (e.g. `burton|feelgood`), but boards use gendered keys (e.g. `burton|feelgood|womens`). The API's `getSpecSources(board.boardKey)` lookup used the gendered key, so manufacturer data never matched and didn't appear in the UI.

## What Was Done

### 1. Collapsed mens → unisex gender category

No boards in the dataset are genuinely men's-specific — "men's" on manufacturer/retailer sites just means "not women's, not kids'". Removed `GenderTarget.MENS` entirely; all formerly-mens boards are now unisex. Only womens and kids remain as distinct genders.

- Removed `MENS` from `GenderTarget` enum
- Removed `|mens` branch from `specKey()` and `genderFromKey()`
- Removed mens detection from `detectGender()` — men's labels now return UNISEX
- Removed "Men's" filter option from UI

### 2. Fixed manufacturer scrapers to set gender correctly

- **Burton**: Derive gender from product name prefix ("Women's" → womens, "Kids'" → kids), not from catalog page URL
- **Jones**: Removed `tags.includes("men")` detection — Shopify "Men" tag was causing unisex boards to get `|mens` keys
- **GNU**: Changed mens catalog page gender from "mens" to "unisex"
- **CAPiTA**: Added `deriveGender()` from title/tags (womens/kids only)
- **Lib Tech**: Added `deriveGender()` from product name/description (womens/kids only)

### 3. Fixed `manufacturer:brand` source prefix handling in UI

Source values in spec_sources use `manufacturer:burton` format, but UI label/color/priority lookups only matched exact `manufacturer` string:

- `sourceLabel()` and `sourceColor()` in BoardDetail.tsx — added `manufacturer:` prefix check
- `specSourceSummary()` priority in BoardDetail.tsx — added prefix check
- `specSourceShort()` and `specSourceDotColor()` in SearchResults.tsx — added prefix check
- `getSourcePriority()` in spec-resolution.ts — added prefix check
- `getSourcePriorityDb()` in db.ts — added prefix check

### 4. Fixed `detectGender` regex for retailer URLs

- URL pattern now matches `/womens-` (e.g. Tactics URLs like `/burton/womens-talent-scout-snowboard`), not just `-womens`
- Model string pattern now matches `womens` without apostrophe (for when gender hint strings pass through)

### 5. Fixed `normalizeFlex` for space-separated terms

- Normalize spaces to hyphens before matching, so "Medium Stiff" matches the same as "medium-stiff"

## Results

- 162/233 boards now have manufacturer data (rest are brands without scrapers or discontinued models)
- Zero `|mens` keys in database
- All 659 tests pass
