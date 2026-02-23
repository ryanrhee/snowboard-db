# 5. Add listing-level retail metadata: condition, gender, and extras

**Completed:** 2026-02-23

## What was done

- Added `ListingCondition` and `GenderTarget` enums to `types.ts`
- Added `condition`, `gender`, `stockCount` fields to `RawBoard`, `CanonicalBoard`, and `Listing` types
- Added `gender` field to `Board` type
- Added `detectCondition()` and `detectGender()` functions in `normalization.ts` that read signals from model text and URL patterns (including `-blem`, `-closeout` URL suffixes, `/outlet/` paths)
- Added `normalizeConditionString()` for mapping raw retailer condition strings
- Created `BoardIdentifier` class (`board-identifier.ts`) that holds immutable raw inputs and derives each field independently via lazy memoized getters — eliminates ordering dependencies in normalization
- Rewired `normalizeBoard()` to use `BoardIdentifier`
- Updated Tactics scraper to pass `stockCount` through
- Updated REI scraper to pass `condition: "closeout"` for clearance items
- Added DB migrations for `condition`, `gender`, `stock_count` columns on listings and `gender` on boards
- Updated `insertListings()` and `splitIntoBoardsAndListings()` to store new fields
- Added frontend display: condition badges, gender indicators, stock count
- Added 11 BoardIdentifier tests and 2 new detectCondition URL pattern tests

## Files changed

- `src/lib/types.ts` — new enums and fields
- `src/lib/normalization.ts` — detectCondition, detectGender, normalizeConditionString, BoardIdentifier integration
- `src/lib/board-identifier.ts` — **NEW** BoardIdentifier class
- `src/lib/db.ts` — schema migrations, insertListings update
- `src/lib/pipeline.ts` — condition/gender/stockCount in splitIntoBoardsAndListings
- `src/lib/retailers/tactics.ts` — stockCount passthrough
- `src/lib/retailers/rei.ts` — clearance → closeout condition
- `src/components/BoardDetail.tsx` — condition/gender/stock display
- `src/components/Filters.tsx` — gender filter
- `src/components/SearchResults.tsx` — condition badges
- `src/__tests__/board-identifier.test.ts` — **NEW** 11 tests
- `src/__tests__/canonicalization.test.ts` — 2 new URL pattern tests
