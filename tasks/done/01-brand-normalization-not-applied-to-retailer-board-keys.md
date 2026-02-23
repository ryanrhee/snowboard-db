# 1. Brand normalization is not applied when generating board keys from retailer data

**Completed:** 2026-02-23

## What was done

- `specKey()` in `db.ts` now calls `canonicalizeBrand()` on the brand before building the key, so non-canonical brand inputs (e.g. `"gnu"`, `"lib"`) produce correct keys.
- The canonical brand is also passed to `normalizeModel()`, enabling correct brand-prefix stripping.

## Files changed

- `src/lib/db.ts` — added `canonicalizeBrand` import; updated `specKey()` to canonicalize brand.
