# Task 26: Capture manufacturer listings and distinguish MSRP from sale price

## Goal

1. Manufacturer scrapers should produce `listings` (price, sizes, availability, URL) just like retailer scrapers do.
2. When a manufacturer shows both an original price and a sale/discount price, record the original as MSRP and the discounted price as the listing price.

## Current State Analysis

All 7 manufacturer scrapers currently return `listings: []` via `adaptManufacturerOutput()`. Every manufacturer site sells direct with add-to-cart functionality. Size/variant and pricing data is available on all sites but not extracted.

### Shopify scrapers (CAPiTA, Jones, Yes., Season)

**4 of 7 scrapers** use Shopify's `/products.json` API. The JSON response already contains per-variant data that is currently ignored:

```json
{
  "title": "154",              // size — parse to lengthCm
  "price": "529.95",           // current selling price
  "compare_at_price": "599.95", // original MSRP (null if not on sale)
  "available": true,           // in-stock flag
  "sku": "..."
}
```

All 4 scrapers type variants as `{ title: string; price: string }[]` and only read `variants[0].price` as MSRP. None type or extract `compare_at_price`, `available`, or per-variant iteration.

**What's needed:** Extend the `ShopifyProduct.variants` interface, iterate all variants, extract per-size listings. A shared utility can serve all 4 scrapers.

### Magento scrapers (Lib Tech, GNU)

**2 of 7 scrapers** use server-rendered Magento HTML (Mervin Manufacturing platform). Both already parse spec tables on detail pages but only read the **first row** — additional size rows are available but discarded.

Current price extraction: single price from JSON-LD `Product` schema or `.price` CSS class. No sale vs. original price distinction. Magento typically uses `<span class="old-price">` / `<span class="special-price">` for sale items.

**What's needed:** Parse all spec table rows for size data. Investigate Magento size-selector widget for availability. Check for old-price/special-price DOM patterns.

### Burton

**Custom platform** with `window.__bootstrap` JSON blobs. Already distinguishes list vs. sale pricing — the `BootstrapProduct` interface types `price: { list: { value }, sales: { value } }`, but the scraper only keeps `list.value` as MSRP and discards `sales.value`.

Size/variant data is likely in the `__bootstrap` JSON on detail pages but not currently parsed. The JSON is sometimes malformed (requiring regex extraction), which adds complexity.

**What's needed:** Investigate detail page `__bootstrap` structure for variant data. Extract `sales.value` as `salePrice` and `list.value` as `originalPrice` per variant.

## Per-Scraper Work Summary

| Scraper | Platform | Sale Price Available? | Size Data Available? | Difficulty | Notes |
|---------|----------|-----------------------|----------------------|------------|-------|
| CAPiTA | Shopify | Yes (`compare_at_price`) | Yes (variants array) | Easy | Extend variant interface, iterate all variants |
| Jones | Shopify | Yes (`compare_at_price`) | Yes (variants array) | Easy | Same as CAPiTA |
| Yes. | Shopify | Yes (`compare_at_price`) | Yes (variants array) | Easy | Same as CAPiTA |
| Season | Shopify | Yes (`compare_at_price`) | Yes (variants array) | Easy | Same as CAPiTA |
| Lib Tech | Magento | Maybe (old-price/special-price DOM) | Yes (spec table rows) | Medium | Already parses table, need all rows + availability |
| GNU | Magento | Maybe (same Mervin platform) | Yes (spec table rows) | Medium | Same as Lib Tech |
| Burton | Custom JSON | Yes (`price.sales.value` exists) | Unknown (need to investigate) | Medium-hard | Malformed JSON, custom variant structure |

## Plan

### Phase 1: Shopify scrapers (CAPiTA, Jones, Yes., Season)

1. Create a shared Shopify variant extraction utility (e.g. in `adapters.ts` or a new `shopify-utils.ts`):
   - Accept `ShopifyProduct.variants[]`, product URL, and currency
   - For each variant: parse `title` → `lengthCm`, map `price` → `salePrice`, `compare_at_price` → `originalPrice`, `available` → `availability`
   - Return `ScrapedListing[]`

2. Update `adaptManufacturerOutput()` or bypass it — manufacturer scrapers need to pass listings through to `ScrapedBoard.listings` instead of always `[]`.

3. Update all 4 Shopify scrapers to call the shared utility and attach listings.

4. MSRP: when `compare_at_price` is non-null, use it as `msrpUsd` on the `ScrapedBoard`. When null, the regular `price` is the MSRP (no discount).

### Phase 2: Magento scrapers (Lib Tech, GNU)

1. Extend spec table parsing to iterate all rows instead of just the first. Extract size from the "Size" column.

2. Investigate the Magento size-selector widget (likely a `<select>` or JS config block) for per-size availability.

3. Check for sale pricing patterns (`old-price`, `special-price` Magento classes).

4. If per-size pricing isn't available (single price per product), create one listing per size with the same price.

### Phase 3: Burton

1. Investigate the `__bootstrap` JSON on detail pages — look for variant/size arrays. May need to dump actual JSON from a cached page.

2. Extract `price.sales.value` as `salePrice` and `price.list.value` as `originalPrice`.

3. Parse variant sizes and availability from the blob.

### Pipeline considerations

- The `coalesce()` function in `src/lib/scrapers/coalesce.ts` already handles merging `ScrapedBoard[]` from multiple sources. Manufacturer listings will be grouped with retailer listings for the same board.
- Source attribution: manufacturer listings will have `source: "manufacturer:burton"` etc., which the coalesce layer already handles for spec priority.
- The `listings` table `retailer` column will need to accept manufacturer source names (or be renamed to `source`).
