# Task 41: Fix Backcountry generic profile descriptions creating spurious Mervin contour variants

## Problem

Backcountry uses generic profile descriptions instead of manufacturer-specific contour codes. When `deriveContourFromProfile()` in `src/lib/strategies/mervin.ts` maps these generic terms, it produces different contour codes than what the manufacturer intended, creating spurious board variants in the database.

### Examples

| Board | BC profile string | `deriveContourFromProfile` result | Correct contour |
|-------|------------------|----------------------------------|-----------------|
| GNU Ladies Choice | "hybrid camber" | `c2` | `c2x` |
| GNU Money | "C2 (rocker/camber hybrid)" | `c2` | `c2e` |
| GNU Gloss | "Hybrid Rocker" | `btx` | `c2e` |

### Impact (current pipeline output)

These spurious variants have real listings attached, fragmenting the data:

- `gnu|ladies choice c2|womens` — 7 listings (should be merged into c2x)
- `gnu|money c2|unisex` — 1 listing (should be merged into c2e)
- `gnu|gloss btx|womens` — 8 listings (should be merged into c2e)

## Root cause

`deriveContourFromProfile()` uses generic pattern matching:
- `"hybrid camber"` → `c2` (but GNU's C2X and C2E are both "hybrid camber" variants)
- `"hybrid rocker"` / `"flying v"` → `btx` (but Gloss C2E is not BTX)

The function can't distinguish between C2, C2X, and C2E from generic retailer descriptions alone — these are proprietary Mervin contour names that only the manufacturer site provides.

## Possible approaches

1. **Prefer manufacturer profile over retailer profile**: When a board already has a manufacturer-sourced contour code, ignore the retailer's generic profile in `deriveContourFromProfile()`. This requires the signal to carry source priority info.

2. **Don't derive contour for Mervin when model name has no code**: If the model name doesn't contain an explicit contour code (c2, c2x, c2e, c3, btx), skip `deriveContourFromProfile()` and leave `profileVariant` null. This would cause the board to group with the base model and avoid spurious splits — but it would also lose valid profile disambiguation from retailers that do include the contour code in their model name.

3. **Post-hoc merge**: After `identifyBoards()`, merge variant groups where the only source of the contour code is a generic retailer profile (no manufacturer or model-name confirmation). The "generic" variant gets absorbed into the closest matching manufacturer-confirmed variant.

## Files

- `src/lib/strategies/mervin.ts` — `deriveContourFromProfile()`
- `src/lib/scrapers/coalesce.ts` — `identifyBoards()` profile variant splitting
