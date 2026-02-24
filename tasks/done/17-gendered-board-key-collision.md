# Task 17: Gendered board key collision

## Problem

Men's and women's versions of the same board model get coalesced under one `board_key` because the gender suffix is stripped during model normalization. For example:

- `Jones Flagship Snowboard - 2025/2026` (men's) -> `jones|flagship`
- `Jones Flagship Snowboard - Women's - 2025/2026` (women's) -> `jones|flagship`

These are different boards with different specs, sizes, flex, and shapes. Merging them causes:
- Spec data from one gender to overwrite the other in `spec_sources`
- Listings from both genders to appear under a single board
- Incorrect spec resolution when men's and women's specs disagree

## Observed in

REI listings: both `product/236379` (men's) and `product/236388` (women's) Flagship map to `jones|flagship`.

## Solution (completed 2026-02-24)

Appended gender suffix to `board_key` for non-default genders: `jones|flagship` (mens/unisex) vs `jones|flagship|womens` (women's) vs `jones|flagship|kids` (kids).

### Changes made:

1. **`src/lib/db.ts`** — `specKey()` accepts optional `gender` parameter, appends `|womens` or `|kids` suffix
2. **`src/lib/scrapers/adapters.ts`** — Gender-aware grouping using `detectGender()`, passes gender through `adaptManufacturerOutput`
3. **`src/lib/scrapers/coalesce.ts`** — Passes `sb.gender` to `specKey()`, uses `normalizeModel()` directly for model extraction
4. **`src/lib/manufacturers/types.ts`** — Added optional `gender` field to `ManufacturerSpec`
5. **`src/lib/manufacturers/jones.ts`** — Sets `gender` on ManufacturerSpec from `deriveGender()`
6. **`src/lib/manufacturers/gnu.ts`** — Tracks catalog page gender (mens/womens), sets on ManufacturerSpec
7. **`src/lib/manufacturers/ingest.ts`** — Passes `spec.gender` to `specKey()` and sets board gender
8. **`src/lib/spec-resolution.ts`** — Added `gender` to `Resolvable` interface, passes to `specKey()`
9. **`src/lib/llm/enrich.ts`** — Passes `boardSample.gender` to `specKey()`
10. **`src/__tests__/coalesce.test.ts`** — Updated `specKey` mock, added gender separation test

All 653 tests pass. No schema migration needed — `board_key` is a TEXT field. A pipeline re-run will populate correct gendered keys.
