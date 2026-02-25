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

Per-size pricing and availability is available in a Magento swatch config JSON blob embedded in the page JavaScript. Each size variant (including B-Grade variants) has its own product ID, price, and stock status. The swatch config also contains "- B-Grade" suffixed variants at ~10% discount.

**What's needed:** Parse the swatch config JSON for per-size pricing/availability. Parse all spec table rows for size dimensions. Filter or flag B-Grade variants appropriately.

### Burton

**Custom platform** with `window.__bootstrap` JSON blobs. Already distinguishes list vs. sale pricing — the `BootstrapProduct` interface types `price: { list: { value }, sales: { value } }`, but the scraper only keeps `list.value` as MSRP and discards `sales.value`.

Size/variant data is likely in the `__bootstrap` JSON on detail pages but not currently parsed. The JSON is sometimes malformed (requiring regex extraction), which adds complexity.

**What's needed:** Investigate detail page `__bootstrap` structure for variant data. Extract `sales.value` as `salePrice` and `list.value` as `originalPrice` per variant.

## Per-Scraper Work Summary

| Scraper | Platform | Sale Price Available? | Size Data Available? | B-Grade? | Difficulty | Notes |
|---------|----------|-----------------------|----------------------|----------|------------|-------|
| CAPiTA | Shopify | Yes (`compare_at_price`) | Yes (variants array) | No | Easy | Extend variant interface, iterate all variants |
| Jones | Shopify | Yes (`compare_at_price`) | Yes (variants array) | No | Easy | Same as CAPiTA |
| Yes. | Shopify | Yes (`compare_at_price`) | Yes (variants array) | No | Easy | Same as CAPiTA |
| Season | Shopify | Yes (`compare_at_price`) | Yes (variants array) | No | Easy | Same as CAPiTA |
| Lib Tech | Magento | Yes (per-size via swatch config JSON) | Yes (spec table rows + swatch config) | **Yes** | Medium | B-Grade as discounted size variants (~10% off) |
| GNU | Magento | Yes (per-size via swatch config JSON) | Yes (spec table rows + swatch config) | **Yes** | Medium | Same Mervin platform as Lib Tech |
| Burton | Custom JSON | Yes (`price.sales.value` exists) | Unknown (need to investigate) | No | Medium-hard | Malformed JSON, custom variant structure |

## B-Grade / Blem Products

**Only Mervin Manufacturing (GNU + Lib Tech)** sells B-grade boards directly on their manufacturer sites.

B-grade variants appear as size options in the Magento swatch config JSON, e.g.:
- `154.5`
- `154.5 - B-Grade`
- `155W`
- `155W - B-Grade`

Every regular size has a corresponding B-Grade option. Most are out of stock, but some are available. B-grade pricing is consistently ~10% below regular:

| Example | Regular Price | B-Grade Price | Discount |
|---------|--------------|---------------|----------|
| Lib Tech Orca 144 | $699.99 | $629.99 | 10% |
| GNU (mens, 159) | $549.99 | $494.99 | 10% |
| GNU (womens, 143) | $479.99 | $431.99 | 10% |

**Handling**: Create separate listings for B-grade variants with `condition: "blemished"`. Parse "- B-Grade" suffix from the size label.

No other manufacturer (Burton, CAPiTA, Jones, Yes., Season) sells B-grade directly. Evo resells Lib Tech blems as separate products (~20% off) but those are already handled by the retailer scraper.

## "W" Suffix on Sizes = Wide (NOT Women's)

Across all manufacturers, **"W" in size names always means "Wide"**, never "Women's". Women's boards are entirely separate products. The evidence:

**Jones** — perfect negative correlation: every men's board has W variants (e.g. 156W, 159W, 162W), zero women's boards have W variants. Women's boards are separate Shopify products with smaller sizes.

**CAPiTA** — tags explicitly confirm. Some women's boards (Birds of a Feather, Space Metal Fantasy) have BOTH `"Women's"` and `"wide"` tags with W sizes (148W, 150W) — proving W is a width modifier orthogonal to gender.

**GNU/Lib Tech** — spec table data confirms. Comparing waist widths for adjacent sizes:

| Size | Waist Width |
|------|------------|
| 154.5 | 25.2 cm |
| **155W** | **26.5 cm** |
| 157.5 | 25.5 cm |
| **158W** | **26.8 cm** |

W sizes are consistently 1.0-1.3 cm wider. Lib Tech's Skunk Ape also uses **"UW" for Ultra-Wide** (28+ cm waist width).

**Season** — uses lowercase "w" (158w, 164w) but same meaning.

**Handling**: When parsing size variants, strip the W/w suffix to get `lengthCm`, and set a `wide: true` flag or store "wide" in extras. "UW" should parse similarly. Do NOT interpret W as women's.

## Plan

### Phase 1: Shopify scrapers (CAPiTA, Jones, Yes., Season)

1. Create a shared Shopify variant extraction utility (e.g. in `adapters.ts` or a new `shopify-utils.ts`):
   - Accept `ShopifyProduct.variants[]`, product URL, and currency
   - For each variant: parse `title` → `lengthCm` (strip W/w suffix), map `price` → `salePrice`, `compare_at_price` → `originalPrice`, `available` → `availability`
   - Detect wide boards: titles ending in W/w → set `widthMm` or store "wide" flag in extras
   - Return `ScrapedListing[]`

2. Update `adaptManufacturerOutput()` or bypass it — manufacturer scrapers need to pass listings through to `ScrapedBoard.listings` instead of always `[]`.

3. Update all 4 Shopify scrapers to call the shared utility and attach listings.

4. MSRP: when `compare_at_price` is non-null, use it as `msrpUsd` on the `ScrapedBoard`. When null, the regular `price` is the MSRP (no discount).

### Phase 2: Magento scrapers (Lib Tech, GNU)

1. Parse the Magento swatch config JSON for per-size variant data (product IDs, prices, stock status).

2. Extend spec table parsing to iterate all rows instead of just the first. Cross-reference with swatch config for width data per size.

3. Handle B-Grade variants: create separate listings with `condition: "blemished"`. Parse "- B-Grade" suffix from the size label. B-Grade prices are typically ~10% below regular.

4. Parse size labels: strip "W" suffix for wide boards, "UW" for ultra-wide (Lib Tech Skunk Ape). Extract `lengthCm` from the numeric portion.

### Phase 3: Burton

1. Investigate the `__bootstrap` JSON on detail pages — look for variant/size arrays. May need to dump actual JSON from a cached page.

2. Extract `price.sales.value` as `salePrice` and `price.list.value` as `originalPrice`.

3. Parse variant sizes and availability from the blob.

### Pipeline considerations

- The `coalesce()` function in `src/lib/scrapers/coalesce.ts` already handles merging `ScrapedBoard[]` from multiple sources. Manufacturer listings will be grouped with retailer listings for the same board.
- Source attribution: manufacturer listings will have `source: "manufacturer:burton"` etc., which the coalesce layer already handles for spec priority.
- The `listings` table `retailer` column will need to accept manufacturer source names (or be renamed to `source`).
