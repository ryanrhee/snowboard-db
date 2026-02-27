# Task 41: Fix Backcountry generic profile descriptions creating spurious Mervin contour variants

**Completed:** 2026-02-27

## Problem

Backcountry uses generic profile descriptions instead of manufacturer-specific contour codes. When `deriveContourFromProfile()` in `src/lib/strategies/mervin.ts` maps these generic terms, it produces different contour codes than what the manufacturer intended, creating spurious board variants in the database.

## Solution

Removed the generic profile-to-contour mapping from `deriveContourFromProfile()` (lines 97-100). Kept only the direct contour code matches (c2x, c2e, c2, c3 btx, c3, btx).

When a profile string contains an explicit Mervin contour code (e.g., "C2X"), it's still extracted correctly. When it's purely generic ("Hybrid Camber", "Hybrid Rocker"), the function now returns `null` → `profileVariant` stays null → the listing groups with the base model → gets absorbed into the manufacturer/evo-confirmed variant via the splitting logic.

## Changes

- `src/lib/strategies/mervin.ts` — removed generic mapping (Camber→c3, Hybrid Camber→c2, Hybrid Rocker→btx, Rocker→btx) from `deriveContourFromProfile()`
- `src/__tests__/strategies/mervin.test.ts` — updated 3 existing tests to expect `null` for generic profiles, added 1 new test for generic "Rocker" profile

## Files

- `src/lib/strategies/mervin.ts`
- `src/__tests__/strategies/mervin.test.ts`
