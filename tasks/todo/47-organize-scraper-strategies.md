# Task 47: Organize scraper strategies by underlying technology

## Problem

The retailer and manufacturer scrapers each contain their own fetch + parse logic, but many share the same underlying technology. There's no shared abstraction for common patterns, leading to duplicated code and inconsistent handling across scrapers that talk to the same kind of backend.

## Current scraper technology map

| Scraper | Fetch | Primary data source | Platform |
|---------|-------|-------------------|----------|
| **CAPiTA** | fetchPage | Shopify `/products.json` API | Shopify |
| **Jones** | fetchPage | Shopify `/products.json` API | Shopify |
| **Yes.** | fetchPage | Shopify `/products.json` API | Shopify |
| **Season** | fetchPage | Shopify `/products.json` API | Shopify |
| **Backcountry** | fetchPageWithBrowser | `__NEXT_DATA__` → `__APOLLO_STATE__` | Next.js + Apollo GraphQL |
| **Lib Tech** | fetchPage | Magento spec table + infographic images | Magento |
| **GNU** | fetchPage | Magento spec table + infographic images | Magento |
| **Burton** | fetchPage | `window.__bootstrap` JSON | Custom (Burton-specific) |
| **Tactics** | fetchPage | Cheerio CSS + JSON-LD | Custom HTML |
| **Evo** | fetchPageWithBrowser | Cheerio CSS + JSON-LD + spec tables | Custom HTML |
| **REI** | Mixed | `script#initial-props` JSON + tech-specs table | Custom HTML |

## Shared technology groups

### Shopify (4 scrapers: CAPiTA, Jones, Yes., Season)

All four use the same Shopify REST API pattern:
- Catalog: `GET /collections/<collection>/products.json?page=X&limit=250`
- Returns structured product JSON with `variants[]`, pricing, tags, images
- Detail pages: HTML with cheerio for brand-specific spec extraction (hexagons, bar charts, image filenames, etc.)

**Shared code that should exist in `shopify.ts`:**
- `fetchShopifyProducts(baseUrl, collection)` — paginated product list fetch
- `ShopifyProduct` / `ShopifyVariant` types
- Common variant → listing mapping (price, compare_at_price, availability, sizes)
- Gender detection from Shopify tags
- Filter logic (skip bindings, splitboards, bundles)

Each scraper would then only implement its brand-specific detail page parsing (hexagon charts for CAPiTA, progress bars for Jones, bar-chart attributes for Yes., image filenames for Season).

### Magento (2 scrapers: Lib Tech, GNU)

Both are Mervin Manufacturing brands on the same Magento platform:
- Catalog: Plain HTML product grid
- Detail pages: Spec table with columnar layout, category/shape from `[itemprop="description"]`, profile from contour image alt/src
- Pricing: JSON-LD + inline Magento pricing JSON (regex extraction)
- Infographic image analysis: Download bar chart images, analyze pixel colors for terrain/flex/ability

**Shared code that should exist in `magento.ts`:**
- Spec table parsing (columnar headers → key/value pairs)
- JSON-LD + Magento pricing extraction
- Infographic image download + pixel analysis (currently duplicated between lib-tech.ts and gnu.ts)
- Profile extraction from contour image patterns (c2x, c2e, c2, c3, btx)
- Category/shape parsing from description first line

### Next.js + Apollo (1 scraper: Backcountry)

Only backcountry currently uses this pattern, but it could apply to future scrapers on similar stacks:
- `__NEXT_DATA__` → `pageProps.__APOLLO_STATE__` for listing data
- `__NEXT_DATA__` → `pageProps.product` for detail data
- JSON-LD `ProductGroup` with `hasVariant[]` for size variants

Worth extracting `__NEXT_DATA__` parsing utilities into a shared module even for one scraper — it would make the backcountry code cleaner and provide a foundation for future Next.js sites.

### No clear group (Tactics, Evo, REI, Burton)

These use site-specific patterns that don't generalize well:
- **Burton**: Custom `window.__bootstrap` format unique to Burton's site
- **Tactics**: JSON-LD + product.init() JS array
- **Evo**: Heavy cheerio parsing with spec tables and size charts
- **REI**: `script#initial-props` JSON blob

These stay as standalone scrapers.

## Proposed file structure

```
src/lib/scraping/
  platforms/
    shopify.ts        # Shared Shopify /products.json fetching, types, variant mapping
    magento.ts        # Shared Magento spec table, pricing, infographic analysis
    nextjs.ts         # __NEXT_DATA__ extraction utilities
  utils.ts            # fetchPage, delay, etc. (existing)
  browser.ts          # fetchPageWithBrowser (existing)
  http-cache.ts       # (existing)

src/lib/manufacturers/
  capita.ts           # Uses shopify.ts + brand-specific hexagon parsing
  jones.ts            # Uses shopify.ts + brand-specific progress bar parsing
  yes.ts              # Uses shopify.ts + brand-specific bar-chart parsing
  season.ts           # Uses shopify.ts + brand-specific image filename parsing
  lib-tech.ts         # Uses magento.ts + brand-specific infographic config
  gnu.ts              # Uses magento.ts + brand-specific infographic config
  burton.ts           # Standalone (__bootstrap is Burton-only)

src/lib/retailers/
  backcountry.ts      # Uses nextjs.ts + Apollo-specific extraction
  tactics.ts          # Standalone
  evo.ts              # Standalone
  rei.ts              # Standalone
```

## Implementation order

1. **`shopify.ts`** — biggest win (4 scrapers), most duplicated code
2. **`magento.ts`** — 2 scrapers (Lib Tech + GNU) with nearly identical parse logic
3. **`nextjs.ts`** — 1 scraper but cleans up backcountry + enables future sites

## Considerations

- Each scraper's brand-specific parsing (how to extract flex, profile, terrain, etc.) stays in the individual scraper file. Only the platform-level boilerplate (fetching product lists, parsing common structures) moves to the shared module.
- Existing tests should continue to pass unchanged — this is a pure refactor with no behavior changes.
- The infographic pixel analysis shared between Lib Tech and GNU is the most obviously duplicated code — it's likely copy-pasted today.
