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

## Subtasks

1. Detect combo/package listings at scrape time — look for " + ", " w/ ", "Package", "Bundle" in model names or page content
2. Either exclude combo listings from the pipeline or flag them with a `isCombo` or `packageContents` field so the UI can handle them appropriately
3. When a combo is detected, don't use its MSRP as the board's MSRP — the manufacturer MSRP should take priority
4. Add tests for combo detection logic
