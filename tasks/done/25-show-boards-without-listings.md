# Task 25: Show boards without retail listings in the UI

**Completed**: 2026-02-25

## Summary

Made boards without retail listings visible in the UI by:

1. **`src/lib/db.ts`** — Added a second query in `getBoardsWithListings()` that finds all boards NOT IN the listings table for the current run, and appends them to results with `listings: []`, `bestPrice: 0`, `valueScore: 0`, and `finalScore = 0.6 * beginnerScore`.
2. **`src/lib/constraints.ts`** — Updated `filterBoardsWithListings()` to short-circuit and return listing-less boards without applying listing-level filters (price, size, region). Board-level filters (gender, kids, womens) still apply.
3. **`src/components/SearchResults.tsx`** — Shows "—" for price/value/score columns and "No listings" in the retailers column for listing-less boards. Sort handles `bestPrice === 0` by pushing those boards to the bottom.
4. **`src/components/BoardDetail.tsx`** — Shows "No retail listings" instead of price, conditionally hides the listings table when empty, still shows specs/scores/manufacturer link.
