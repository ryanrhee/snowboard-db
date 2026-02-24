# Task 21: Fix spec_sources gender key mismatch

## Problem

Manufacturer spec_sources are stored under genderless keys (e.g. `burton|feelgood`), but boards use gendered keys (e.g. `burton|feelgood|womens`). The API's `getSpecSources(board.boardKey)` lookup uses the gendered key, so manufacturer data never matches and doesn't appear in the UI.

## Impact

All manufacturer-sourced specs (flex, profile, shape, category, ability level, MSRP) are invisible in the UI despite being present in the database. This affects boards with gendered keys (`|womens`, `|kids`, `|mens`).

## Root Cause

- Manufacturer scrapers call `specKey(brand, model)` without a gender argument, producing keys like `burton|feelgood`
- Retailer pipeline produces board keys with gender suffixes via `specKey(brand, model, gender)`, e.g. `burton|feelgood|womens`
- `getSpecSources()` in the API does an exact match on `board.boardKey`, missing the genderless manufacturer entries

## Suggested Fix

In the API results route (or `getSpecSources` itself), merge results from both the gendered key and the base key (strip gender suffix). E.g. for `burton|feelgood|womens`, also query `burton|feelgood`.
