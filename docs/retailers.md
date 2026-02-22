# Supported Retailers

## Overview

| Retailer | URL | Region | Fetch Method | Detail Pages | Status |
|----------|-----|--------|--------------|--------------|--------|
| Tactics | tactics.com | US | HTTP | Yes | Active |
| Evo | evo.com | US | Playwright | No | Active |
| Backcountry | backcountry.com | US | Playwright | No | Active |
| REI | rei.com | US | Playwright (system Chrome) | No | Active |
| BestSnowboard | bestsnowboard.co.kr | KR | HTTP | Yes | Inactive |

**Active** = included in searches. **Inactive** = code exists but blocked by Cloudflare/bot protection.

## Data Richness

Retailers that fetch detail pages provide specs directly from product pages. Listing-only retailers rely on LLM enrichment to fill in missing specs.

| Retailer | Brand | Model | Price | Flex | Profile | Shape | Category | Length | Width | Description |
|----------|-------|-------|-------|------|---------|-------|----------|--------|-------|-------------|
| Tactics | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes (per-size) | No | Yes |
| Evo | Yes | Yes | Yes | No | No | No | No | No | No | No |
| Backcountry | Yes | Yes | Yes | No | No | No | No | No | No | No |
| REI | Yes | Yes | Yes | No | No | No | No | No | No | Yes |
| BestSnowboard | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | Yes |

---

## Tactics

- **File:** `src/lib/retailers/tactics.ts`
- **Base URL:** `https://www.tactics.com`
- **Search URL:** `https://www.tactics.com/snowboards/sale`
- **Fetch method:** HTTP (`fetchPage`) for both listing and detail pages
- **Currency:** USD

### Scraping strategy

Two-phase: listing page, then individual product detail pages.

**Listing page** parses `div.browse-grid-item` cards for brand, model, image, sale price, and original price (derived from discount %). Non-snowboard items are filtered by checking the URL for "snowboard". A price filter is applied before fetching detail pages.

**Detail pages** extract:
- **JSON-LD:** brand, model, image, price, availability
- **Spec icons:** CSS selector `.product-spec-icon-container` with `img[alt]` values for ride style (category), profile, shape, and flex
- **Size/stock data:** Parsed from `product.init()` JavaScript call — bracket-counted JSON array of `[size, ?, salePrice, origPrice, stock, [locations]]`
- **Description:** `.product-description-text` or `.product-description`

Returns one `RawBoard` per in-stock size variant. If no sizes are in stock, returns all sizes.

### Special logic

- Year extracted from model name via `/\b(20[1-2]\d)\b/`
- Original price derived from discount percentage when not directly available
- Per-size pricing: each size variant can have a different sale/original price

---

## Evo

- **File:** `src/lib/retailers/evo.ts`
- **Base URL:** `https://www.evo.com`
- **Search URL:** `https://www.evo.com/shop/snowboard/snowboards/sale`
- **Fetch method:** Playwright (`fetchPageWithBrowser`) — requires JS rendering
- **Currency:** USD

### Scraping strategy

Listing-only — no detail page fetching.

Parses `.product-thumb` cards. Price text contains original + sale on separate lines (e.g. `$549.95\n$439.96\nSale`). Brand is extracted as the first word of the product title; the rest becomes the model.

All spec fields (flex, profile, shape, category, length, width, description) are left empty and filled later via LLM enrichment.

### Special logic

- Brand/model split assumes first word of title is the brand name
- Availability hardcoded to `in_stock` (listing implies availability)

---

## Backcountry

- **File:** `src/lib/retailers/backcountry.ts`
- **Base URL:** `https://www.backcountry.com`
- **Search URL:** `https://www.backcountry.com/snowboards`
- **Fetch method:** Playwright (`fetchPageWithBrowser`) — Cloudflare protection
- **Currency:** USD

### Scraping strategy

Listing-only — no detail page fetching.

Uses a multi-fallback extraction pipeline:

1. **Apollo GraphQL cache** (primary): Parses `#__NEXT_DATA__` script for `pageProps.__APOLLO_STATE__`, extracts `Product:ID` entries with brand, name, URL, min sale/list prices
2. **Legacy data shapes:** Falls back to `pageProps.initialState.products.items` or `pageProps.products`
3. **JSON-LD:** Standard `application/ld+json` with `@type === "Product"`
4. **HTML cards:** `[data-id="productCard"]`, `[class*="product-card"]`, `[class*="ProductCard"]`, `.product-listing-item`

All spec fields are left empty and filled via LLM enrichment.

### Special logic

- Multiple data format fallbacks for resilience against site changes
- Availability hardcoded to `in_stock`

---

## REI

- **File:** `src/lib/retailers/rei.ts`
- **Base URL:** `https://www.rei.com`
- **Search URL:** `https://www.rei.com/c/snowboards`
- **Fetch method:** Playwright with system Chrome (`channel: "chrome"`, `waitUntil: "domcontentloaded"`)
- **Currency:** USD

### Scraping strategy

Listing-only — no detail page fetching. REI requires system Chrome (not Playwright's bundled Chromium) because their bot protection does TLS fingerprinting and rejects headless Chromium's fingerprint.

**Product data extraction:**
REI embeds product data as inline JavaScript objects in Vue.js server-rendered templates. Each product object contains a `"link":"/product/..."` field used as an anchor to extract the full JSON object via bracket-depth parsing.

Extracted fields: `brand`, `cleanTitle` (model), `displayPrice.min` (sale price), `displayPrice.compareAt` (original price), `regularPrice`, `percentageOff`, `available`, `sale`, `clearance`, `benefit` (description), `thumbnailImageLink`.

Only boards with `sale: true`, `clearance: true`, or a nonzero `percentageOff` are included.

### Special logic

- Requires `channel: "chrome"` — Playwright's bundled Chromium is blocked by REI's TLS fingerprinting
- The dev server must be started outside of Claude's sandbox for system Chrome to launch successfully
- Model names use season format (`"2025/2026"`) which `normalizeModel` handles
- Specs (flex, profile, shape, category) are not available from the listing page and are filled via LLM enrichment

---

## BestSnowboard (bestsnowboard.co.kr)

- **File:** `src/lib/retailers/bestsnowboard.ts`
- **Base URL:** `https://www.bestsnowboard.co.kr`
- **Search URL:** `https://www.bestsnowboard.co.kr/product/list.html?cate_no=25&sort_method=6`
- **Fetch method:** HTTP (`fetchPage`) for both listing and detail pages
- **Currency:** KRW
- **Status:** Inactive (Cloudflare blocking)

### Scraping strategy

Two-phase: listing page, then individual product detail pages.

**Listing page** tries multiple Korean e-commerce card selectors: `.prd-list .item`, `.product-list .product`, `[class*="product-item"]`, `.item_gallery_type li`, `.prdList .prdItem`, `ul.prdList > li`, `.thumbnail`.

**Detail pages** extract specs from tables and definition lists, supporting both English and Korean keys:
- flex: `flex`, `플렉스`, `강도`
- profile: `profile`, `프로파일`, `캠버`
- shape: `shape`, `쉐이프`, `형태`
- category: `terrain`, `지형`, `용도`
- length: `size`, `사이즈`, `길이`, `length`

### Special logic

- Korean Won price parsing: strips `₩`, `원`, commas
- Brand extraction: if first word is all-caps, treat as brand
- Known brand fallback list for brand extraction from model name
- Price filter converts max USD to KRW using configured exchange rate (`config.krwToUsdRate`)

---

## Adding a New Retailer

1. Create `src/lib/retailers/{name}.ts` implementing the `RetailerModule` interface:
   ```typescript
   interface RetailerModule {
     name: string;
     region: Region;       // US or KR
     baseUrl: string;
     searchBoards(constraints: SearchConstraints): Promise<RawBoard[]>;
   }
   ```

2. Register in `src/lib/retailers/registry.ts`:
   - Import and add to `ALL_RETAILERS` array
   - Add name to `ACTIVE_RETAILERS` set

3. If the retailer requires Playwright (JS-rendered pages, Cloudflare), add its name to the `browserRetailers` set in `src/lib/pipeline.ts` `refreshPipeline()` so price refreshes use the correct fetch method. If the retailer's bot protection does TLS fingerprinting (blocks Playwright's bundled Chromium), pass `channel: "chrome"` to `fetchPageWithBrowser()` to use the system-installed Chrome.

4. The HTTP cache (`http_cache` table) is used automatically by both `fetchPage()` and `fetchPageWithBrowser()` with a 24h default TTL.

5. Normalization, enrichment, and scoring are handled automatically by the pipeline — no per-retailer configuration needed.
