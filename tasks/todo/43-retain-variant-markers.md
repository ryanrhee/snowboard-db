# Task 43: Retain variant markers in model names, remove profileVariant and Phase 3 splitting

## Increment 1 — DONE (2026-02-27)

**Keep variant markers in model names. Remove `profileVariant` and Phase 3.**

### What was done

1. Removed `profileVariant` from `BoardIdentity` and `manufacturer` from `BoardSignal` in `types.ts`
2. **MervinStrategy**: Rewrote to retain "Camber" suffix and GNU "C" prefix/suffix in model names. Still strips contour codes (C2X, C2E, C2, C3 BTX, C3, BTX). Removed `deriveContourFromProfile()`.
3. **BurtonStrategy**: Removed profile suffix stripping. Updated aliases to prefix-match so variants like "Fish 3D Directional Flat Top" → "3d fish directional Flat Top".
4. **DefaultStrategy**: Removed `profileVariant` from return value.
5. **Coalesce**: Removed Phase 3 variant splitting entirely — `identifyBoards()` now groups directly by specKey.
6. **Call sites**: Updated `adapters.ts`, `db.ts`, `board-identifier.ts`, `normalization.ts` to remove `manufacturer` from `BoardSignal`.
7. **Legacy pipeline**: Removed `strip-gnu-profile-letter` step, updated `PROFILE_SUFFIX_RE` to only match contour codes, added prefix aliases for "Fish 3D" variants.
8. **Tests**: Updated 8 test files + snapshot fixture (1005 tests pass).

### Remaining verification

- [ ] Full pipeline run (`./debug.sh '{"action":"run"}'`) — needs boards/listings/search_runs cleared first since stale data has old keys
- [ ] Check board keys: `SELECT board_key FROM boards WHERE board_key LIKE '%money%'` — expect `gnu|money|unisex` and `gnu|c money|unisex`
- [ ] Check board keys: `SELECT board_key FROM boards WHERE board_key LIKE '%gloss%'` — expect `gnu|gloss|womens` and `gnu|gloss c|womens`
- [ ] Check board keys: `SELECT board_key FROM boards WHERE board_key LIKE '%custom%'` — expect `burton|custom camber|unisex` and `burton|custom flying v|unisex`

Note: `from:resolve` is insufficient — it only re-resolves specs, doesn't re-run board identification. Must clear pipeline output and do a full run.

---

## Increment 2 — TODO: Persist raw scrape inputs immutably

Raw scrape inputs must be stored unmodified so downstream identification strategies can use all available signals. Currently these are lost:

### What's lost today

| Data | Where it exists | Where it's dropped |
|------|----------------|--------------------|
| **`rawModel`** | `ScrapedBoard.rawModel` | Never persisted to any DB table |
| **`rawModels[]`** | `BoardGroup.rawModels[]` | Collected in `identifyBoards()`, then dropped |
| **Raw H1 page title** | Manufacturer `parseDetailHtml` | Used to derive `model` via `cleanModelName()`, raw H1 discarded |
| **Retailer source URLs** | `ScrapedBoard.sourceUrl` | Written to `spec_sources.source_url` but NOT on the `boards` table (only `manufacturer_url` stored) |
| **Profile/contour image URL** | Manufacturer scrapers | Used for profile detection, URL discarded |
| **Infographic image URL** | Manufacturer scrapers | Used for flex/terrain analysis, URL discarded |
| **Category/shape header line** | e.g. `"FREESTYLE / PARK / TWIN SHAPE"` | Parsed for category+shape, raw string discarded |

### What already survives

- `sourceUrl` on `ScrapedBoard` (transient)
- `rawModel` on `ScrapedBoard` (transient)
- `extras` bag → written to `spec_sources`
- Listing-level URLs and images → `listings` table
- `description` → `boards.description`

### Goal

Store all raw scrape inputs immutably so they can be used by identification strategies. The scrape result's primary key should be based on the URL or an autoincrement — something that identifies the scrape, not the board. Scrapes only need to identify the brand (via `BrandIdentifier`).

---

## Increment 3 — TODO: Remove `specKey`, separate identification step

Once raw scrape data is persisted, remove `specKey()` as a concept. Board identification strategies run as a distinct phase after scraping — they construct board entries by examining the full set of raw inputs (URL, H1, raw model, image names, profile specs) rather than computing a compound key upfront.

- Each scrape result gets matched to a board during the identification phase
- Strategies use all available signals (URL path, H1 text, raw model, image filenames) for smart matching
- Board entries in the DB are constructed by strategies, not by key computation
