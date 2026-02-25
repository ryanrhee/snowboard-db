# Task 27: Replace single category with multi-dimensional terrain scores

**Completed**: 2026-02-25

## Summary

Replaced the single `category` enum with 5 terrain dimensions on a 1-3 scale (piste, powder, park, freeride, freestyle), preserving nuance from manufacturer data instead of collapsing to one category.

### Files changed

1. **`src/lib/terrain.ts`** (new) — Terrain mapping module with `capitaToTerrain()` (CAPiTA 1-5 hexagon → 1-3), `jonesToTerrain()` (Jones 1-10 ratings → 1-3), `categoryToTerrain()` (single category → terrain scores), and `terrainToCategory()` (derive category from scores for backward compat).
2. **`src/lib/types.ts`** — Added `TerrainScores` interface, added `terrainScores` field to `Board`.
3. **`src/lib/db.ts`** — Added 5 `terrain_*` INTEGER columns with idempotent migration. Updated `upsertBoard()`, `mapRowToNewBoard()`, and `getBoardsWithListings()` queries.
4. **`src/lib/manufacturers/capita.ts`** — After extracting hexagon scores, calls `capitaToTerrain()` and stores results as `terrain_*` extras.
5. **`src/lib/manufacturers/jones.ts`** — After extracting terrain ratings, calls `jonesToTerrain()` and stores results as `terrain_*` extras.
6. **`src/lib/scrapers/coalesce.ts`** — For sources without `terrain_*` extras, derives terrain from normalized category via `categoryToTerrain()` and writes to spec_sources.
7. **`src/lib/spec-resolution.ts`** — Added 5 terrain fields to `SPEC_FIELDS` for priority resolution. After resolution, derives `category` from terrain scores if not set directly.
8. **`src/lib/scoring.ts`** — Replaced category-based beginner scoring with terrain-weighted formula: `(park*0.3 + piste*0.3 + freestyle*0.2 + freeride*0.1 + powder*0.1) / 3`. Falls back to old category scoring if no terrain data.
9. **`src/lib/manufacturers/ingest.ts`** — Extracts terrain scores from extras when building Board for upsert.
10. **`src/components/BoardDetail.tsx`** — Added `TerrainDisplay` component showing 5 dimensions as small dot bars (1-3 scale, emerald dots).

### Verification

- All 657 tests pass, TypeScript compiles clean.
- CAPiTA boards get manufacturer-sourced terrain from hexagon data (e.g. D.O.A.: piste:3, powder:1, park:2, freeride:3, freestyle:3).
- Jones boards get manufacturer-sourced terrain from 1-10 ratings (e.g. Flagship: piste:2, powder:3, park:1, freeride:3, freestyle:1).
- Burton and other single-category boards get terrain derived from category (e.g. all_mountain → 3,2,2,2,2).
- Manufacturer terrain scores take priority over retailer-derived ones through the existing spec resolution system.
- Beginner scores remain reasonable (all-mountain and freestyle boards score highest).
