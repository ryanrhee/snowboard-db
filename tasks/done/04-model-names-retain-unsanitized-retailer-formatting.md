# 4. Some model names retain unsanitized retailer formatting

**Completed:** 2026-02-23

## What was done

- Added trailing slash stripping (`model.replace(/\/+$/, "")`) to `normalizeModel()`.
- Added 2 test cases for single and multiple trailing slashes.

## Files changed

- `src/lib/normalization.ts` — added `\/+$` strip in cleanup section.
- `src/__tests__/canonicalization.test.ts` — added "strips trailing slashes (Task #4)" test block.
