# Task 25: Show boards without retail listings in the UI

## Problem

Boards that exist in the `boards` table but have no rows in `listings` are invisible in the UI. This happens for manufacturer-only boards (scraped from brand sites but not found at any retailer).

The root cause is `getBoardsWithListings()` in `src/lib/db.ts:451`, which uses an INNER JOIN between `listings` and `boards`. Boards with zero listings are excluded at the SQL level.

Additionally, `filterBoardsWithListings()` in `src/lib/constraints.ts:53` returns `null` for boards with no listings after filtering, removing them from results.

## Goal

Make all known boards visible in the UI, even if they have no retail listings. A board with specs but no listings is still useful information (specs, manufacturer URL, category, etc.).

## Approach

1. **Add a `getAllBoards` query** (or modify `getBoardsWithListings` to use LEFT JOIN) so boards without listings are included in results.
2. **Update `filterBoardsWithListings`** to keep boards with zero listings instead of returning null — skip price/size filters for those boards since they have no listings to filter.
3. **Update the UI** (`SearchResults.tsx`) to handle boards with no listings — show specs, manufacturer link, but no price/retailer columns. Could show "No retail listings found" or similar.
4. **Consider sort order**: Boards with listings and prices should probably rank above boards with no listings, all else being equal.

## Considerations

- Price-based filters (min/max price) should not exclude listing-less boards — they simply don't have a price. Or, alternatively, a "has listings" filter could let users toggle them.
- The beginner score and spec display should work the same regardless of listing presence.
- This intersects with Task 24 (collapsing specs into spec_sources) — if both are done, the board display becomes purely spec_sources-driven with listings as optional additions.
