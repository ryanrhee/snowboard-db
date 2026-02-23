# 3. Manufacturer spec keys include profile suffixes that retailers don't use

**Completed:** 2026-02-23

## What was done

- Added trailing profile designator stripping to `normalizeModel()`: regex strips `Camber`, `Flying V`, `Flat Top`, `PurePop`, `PurePop Camber`, `C2X`, `C2E`, `C2`, `C3 BTX`, `C3`, `BTX` when they appear at the end of the model name. Since `specKey()` calls `normalizeModel()` on both manufacturer and retailer sides, both converge to the same base key.
- Added `T.Rice` → `T. Rice` normalization for consistent Lib Tech model naming.
- Updated 10 existing test expectations to reflect profile suffix stripping.
- Added 16 new test cases: Burton profile stripping (5), Lib Tech/GNU profile code stripping (6), no-op cases (3), T.Rice normalization (2).

## Files changed

- `src/lib/normalization.ts` — added profile designator strip regex + T.Rice normalization after brand-prefix stripping.
- `src/__tests__/canonicalization.test.ts` — updated existing expectations; added "strips trailing profile designators" and "normalizes T.Rice → T. Rice" test blocks.
