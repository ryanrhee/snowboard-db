# Task 14: Ensure UI MSRP always uses manufacturer source and flags discrepancies

## Problem

The UI's displayed MSRP should always come from the manufacturer's site, not from retailer listings. Currently, when a retailer claims a higher MSRP than the manufacturer (e.g. because the listing is a board+binding combo), the inflated MSRP can leak into the UI.

### Expected behavior

- MSRP displayed in UI = manufacturer-sourced MSRP (from `boards.msrp_usd` where source is manufacturer scraper)
- When no manufacturer MSRP exists, fall back to retailer original price but label it as "Retailer list price" not "MSRP"
- When retailer original price > manufacturer MSRP, flag this in the UI (likely a combo deal, or retailer markup)
- Discount percent should be calculated against manufacturer MSRP when available

### Current behavior

- The pipeline sets `boards.msrp_usd` from manufacturer source when available (via coalescence), which is correct
- But `listings.original_price_usd` may come from retailer combo pricing
- The `getBoardsWithListings()` query computes `bestPrice` and the UI may show confusing discount info when MSRP sources conflict

## Subtasks

1. Audit how `msrp_usd` flows from coalescence through to the UI — verify manufacturer MSRP takes priority
2. When `listing.originalPriceUsd > board.msrpUsd`, flag the listing (combo deal or data issue)
3. Recalculate discount percent using manufacturer MSRP rather than retailer-claimed original price
4. Add a visual indicator in the UI when MSRP source differs from retailer-claimed price
