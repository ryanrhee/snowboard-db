# Task 26: Capture manufacturer listings and distinguish MSRP from sale price

## Goal

1. Manufacturer scrapers should produce `listings` (price, sizes, availability, URL) just like retailer scrapers do, with source attribution (e.g. `retailer: "burton.com"`).
2. When a manufacturer shows both an original price and a sale/discount price, record the original as MSRP and the discounted price as the listing price.

## Approach

1. **Extract listing data from manufacturer scrapers**: Each manufacturer scraper already visits product pages for specs. Extend them to also extract price, available sizes, and availability status.
2. **Detect sale vs. original price**: Look for crossed-out / compare-at prices on manufacturer product pages. Common patterns:
   - Shopify-based (CAPiTA, Jones): `compare_at_price` vs `price` in products.json
   - Burton: `salePrice` vs `listPrice` in `__bootstrap` JSON
   - Lib Tech: strikethrough price elements on detail pages
3. **Set MSRP from original price**: Use the non-discounted price as the MSRP source (`manufacturer` priority). If no discount, the listed price is the MSRP.
4. **Create listings**: Emit listing records from manufacturer scrapers with the actual selling price (which may be discounted).

## Considerations

- This interacts with Task 14 (MSRP source priority and flagging) — manufacturer MSRP should be highest priority.
- Manufacturer listings should appear in the UI alongside retailer listings (relates to Task 25).
- Some manufacturers may not sell direct (e.g. GNU redirects to evo). Only create listings where the manufacturer site actually has purchase capability.
