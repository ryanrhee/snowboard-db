# Task 13: Detect and handle board+binding combo listings

## Problem

Some retailer listings are board+binding combo deals, but the binding info gets stripped during scraping/normalization. This causes two problems:

1. **Inflated prices**: The combo price is treated as the board-only price, making the board appear more expensive than it is
2. **Inflated MSRP**: The combo MSRP (e.g. $839.90 for Burton Instigator + bindings at Backcountry) gets stored as the board's MSRP, when the actual board-only MSRP is $459.95 (from burton.com)

### Example

- **Backcountry listing**: Burton Instigator + bindings — $839.90 MSRP, $755.92 sale
- **Burton.com**: Instigator board only — $459.95 MSRP
- **UI shows**: MSRP $840 (wrong — that's the combo price)
- **normalizeModel()** strips " + ..." from model names, so the binding info is lost entirely

## Approach

Detect combos early, flag them on the **listing** (not the board), and display them separately in the UI. Combo listings are a fundamentally different product — board+binding at a bundled price — and should not be mixed into the board-only price comparisons.

## Subtasks

### 1. Capture combo info before stripping

In `normalizeModel()` (`src/lib/normalization.ts`), before the regex strips `" + ..."` / `" w/ ..."`, extract the binding/package name. Return it alongside the normalized model so callers can preserve it.

Also detect "Package" and "Bundle" in the raw model string.

Detection patterns:
- `" + "` → e.g. `"Instigator Camber Snowboard + Malavita Re:Flex Binding"`
- `" w/ "` → e.g. `"Feelgood Snowboard w/ Step On"`
- `"Package"` → e.g. `"Feelgood Snowboard + Step On Package - Women's"`
- `"Bundle"` (less common but possible)

### 2. Store combo flag and contents on listings

Add fields to the listing data:
- `comboContents` (string | null) — what's bundled, e.g. `"Malavita Re:Flex Binding"`. Null for board-only listings.

This belongs on the **listing**, not the board — the same board model can appear as board-only at one retailer and as a combo at another.

Schema change: add `combo_contents TEXT` column to the `listings` table.

### 3. Exclude combos from MSRP and best-price calculations

- In `coalesce.ts`: when a listing is flagged as a combo, do **not** use its price as the board's MSRP or factor it into best-price.
- Manufacturer MSRP (already highest priority) should remain the authoritative source.
- A combo listing's `originalPrice` is the combo MSRP, not the board MSRP — these must not be conflated.

### 4. Separate combo listings in the UI

In `BoardDetail.tsx`, split listings into two groups:
- **Board-only listings**: shown in the main table as today
- **Board+binding packages**: shown in a separate section below the main table

The combo section should display:
- What's included (the `comboContents` value)
- Retailer, size, price, discount — same columns as the main table
- Visually distinct (different header, maybe muted styling) so it's clear these are different products

Do **not** try to decompose combo pricing into board vs binding portions.

### 5. Add tests

- Unit tests for combo detection logic (the extraction from raw model names)
- Verify combos are excluded from MSRP/best-price calculations
- Test data already exists in `canonicalization.test.ts` (lines 831-839)

## Key files

| File | Change |
|------|--------|
| `src/lib/normalization.ts` | Extract combo contents before stripping (lines 228-229) |
| `src/lib/scrapers/coalesce.ts` | Pass combo flag through; exclude from MSRP/best-price |
| `src/lib/db.ts` | Add `combo_contents` column to listings; exclude combos from price aggregation |
| `src/components/BoardDetail.tsx` | Split listings into board-only vs combo sections |
| `src/__tests__/canonicalization.test.ts` | Add/update combo detection tests |
