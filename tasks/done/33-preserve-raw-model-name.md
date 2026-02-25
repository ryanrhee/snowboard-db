# Task 33: Preserve raw model name through scraper pipeline

**Completed**: 2026-02-25

## Summary

Added `rawModel` field to `ScrapedBoard` and threaded it through both adapter functions and into coalesce's board grouping. Three files changed:

- `src/lib/scrapers/types.ts` — Added `rawModel?: string` to `ScrapedBoard`
- `src/lib/scrapers/adapters.ts` — Set `rawModel` in `adaptRetailerOutput` (from the pre-normalization variable) and `adaptManufacturerOutput` (from `spec.model`)
- `src/lib/scrapers/coalesce.ts` — Board groups now accumulate `rawModels: string[]`, available for task 32's collision detection

All 562 tests pass, type-checks clean. No database or normalization changes.

## Problem

Scrapers normalize model names early (stripping profile suffixes, gender prefixes, year suffixes, etc. via `normalizeModel()`). The original model name is lost. Task 32 (profile variant collision detection) needs the raw name at coalesce time to recover stripped suffixes like "Camber" or "Flying V" when a collision is detected.

## Goal

Add a `rawModel` field alongside the normalized `model` in scraper output, so the pre-normalization name is available downstream.

## Analysis: BoardIdentifier as prior art

`BoardIdentifier` (`src/lib/board-identifier.ts`) already implements the exact pattern we need:
- Stores `rawModel` (pre-normalization) and `rawBrand`
- Lazily computes `model` via `normalizeModel(this.rawModel, this.brand)` on first access
- Already used in coalesce, but only for per-listing fields (condition, gender, year) — not for board-level grouping

The gap is that `ScrapedBoard.model` arrives at coalesce already normalized:
- **Retailers**: `adaptRetailerOutput` (`src/lib/scrapers/adapters.ts:37`) calls `normalizeModel(rawModel, brand)` and stores only the result. The pre-normalization name (e.g. "Custom Camber") is discarded.
- **Manufacturers**: `adaptManufacturerOutput` passes `spec.model` through unchanged, but manufacturer scrapers may have already stripped suffixes in their own `cleanModelName()` calls.

## Approach

### Step 1: Add `rawModel` to `ScrapedBoard`

In `src/lib/scrapers/types.ts`, add `rawModel?: string` to the `ScrapedBoard` interface. Optional so existing code doesn't break.

### Step 2: Set `rawModel` in `adaptRetailerOutput`

In `src/lib/scrapers/adapters.ts`, the raw model is already available at line 35 as `rawModel` (before `normalizeModel` is called at line 37). Store it on the board partial alongside the normalized `model`:

```ts
board: {
  ...
  model,        // normalized (already there)
  rawModel,     // pre-normalization (new)
  ...
}
```

Then pass it through in the return mapping at line 98.

### Step 3: Set `rawModel` in `adaptManufacturerOutput`

For manufacturers, `spec.model` is the best raw name available (it comes from the manufacturer's own page, before `normalizeModel` runs in coalesce). Set `rawModel: spec.model`.

### Step 4: Collect `rawModel` values in coalesce grouping

In `src/lib/scrapers/coalesce.ts`, the board grouping loop (line 39-52) currently discards everything except `brand` and `model`. Accumulate `rawModel` values from each `ScrapedBoard` in the group so task 32 can inspect them for profile suffixes during collision detection:

```ts
const boardGroups = new Map<string, {
  scraped: ScrapedBoard[];
  brand: string;
  model: string;
  rawModels: string[];  // new — all raw model names seen for this board key
}>();
```

No other changes needed. `rawModel` is not stored in the database — it's transient, used only during the coalesce phase.

### What NOT to change

- `RawBoard` already has `model` as an unprocessed string — no changes needed there.
- `ManufacturerSpec` doesn't need a `rawModel` field either; `spec.model` is already the raw name.
- `BoardIdentifier` is unchanged — it already works correctly with raw inputs.
- No changes to normalization logic, board keys, or database schema.

## Files to modify

| File | Change |
|------|--------|
| `src/lib/scrapers/types.ts` | Add `rawModel?: string` to `ScrapedBoard` |
| `src/lib/scrapers/adapters.ts` | Set `rawModel` in both adapter functions |
| `src/lib/scrapers/coalesce.ts` | Accumulate `rawModels[]` in board groups |

## Considerations

- This is a prerequisite for Task 32.
- The raw name should be the scraper's extracted name after brand stripping but before profile/suffix normalization — e.g. "Custom Camber" not "Burton Custom Camber Snowboard".
- `rawModel` does not need to be stored in the database — it's only needed during the coalesce phase within a single pipeline run.
- The `BoardIdentifier` pattern validates this approach: keeping raw and normalized side by side with lazy derivation works well.
