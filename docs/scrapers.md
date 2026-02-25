# Scrapers

## Overview

All scrapers implement the unified `ScraperModule` interface defined in `src/lib/scrapers/types.ts`:

```typescript
interface ScraperModule {
  name: string;           // e.g. "retailer:tactics", "manufacturer:burton"
  sourceType: "retailer" | "manufacturer" | "review-site";
  baseUrl: string;
  region?: Region;
  scrape(scope?: ScrapeScope): Promise<ScrapedBoard[]>;
}
```

Scrapers are registered in `src/lib/scrapers/registry.ts` as a flat list. No separate registries or adapter layers exist — each scraper directly returns `ScrapedBoard[]`.

## Active Scrapers

### Retailers

| Scraper Name | Region | Fetch Method | Detail Pages | Status |
|--------------|--------|--------------|--------------|--------|
| `retailer:tactics` | US | HTTP | Yes | Active |
| `retailer:evo` | US | Playwright | Yes | Active |
| `retailer:backcountry` | US | Playwright | Yes | Active |
| `retailer:rei` | US | Playwright (system Chrome) | Yes (CDP pre-cache) | Active |
| `retailer:bestsnowboard` | KR | HTTP | Yes | Blocked (Cloudflare) |

### Manufacturers

| Scraper Name | Platform | Fetch Method | Detail Pages | Boards |
|--------------|----------|--------------|--------------|--------|
| `manufacturer:burton` | Custom (`__bootstrap` JSON) | HTTP | Yes | ~35 |
| `manufacturer:lib tech` | Magento 2 (Mervin) | HTTP + cheerio | Yes | ~30 |
| `manufacturer:capita` | Shopify | HTTP (JSON API + HTML) | Yes | ~40 |
| `manufacturer:jones` | Shopify | HTTP (JSON API + HTML) | Yes | ~40 |
| `manufacturer:gnu` | Magento 2 (Mervin) | HTTP + cheerio | Yes | ~29 |
| `manufacturer:yes.` | Shopify | HTTP (JSON API only) | No | ~12 |
| `manufacturer:season` | Shopify | HTTP (JSON API only) | No | ~5 |

## Retailer Data Richness

Retailers that fetch detail pages provide specs directly from product pages.

| Retailer | Brand | Model | Price | Flex | Profile | Shape | Category | Length | Width | Reviews | Description |
|----------|-------|-------|-------|------|---------|-------|----------|--------|-------|---------|-------------|
| Tactics | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes (per-size) | No | No | Yes |
| Evo | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes (per-size) | Yes (per-size) | Yes | Yes |
| Backcountry | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes (per-size) | No | Yes | Yes |
| REI | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No | Yes | Yes |
| BestSnowboard | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No | No | Yes |

---

## Retailer Details

### Tactics

- **File:** `src/lib/retailers/tactics.ts`
- **Base URL:** `https://www.tactics.com`
- **Search URL:** `https://www.tactics.com/snowboards/sale`
- **Fetch method:** HTTP (`fetchPage`) for both listing and detail pages
- **Currency:** USD

Two-phase: listing page, then individual product detail pages.

**Listing page** parses `div.browse-grid-item` cards for brand, model, image, sale price, and original price (derived from discount %). Non-snowboard items are filtered by checking the URL for "snowboard".

**Detail pages** extract:
- **JSON-LD:** brand, model, image, price, availability
- **Spec icons:** CSS selector `.product-spec-icon-container` with `img[alt]` values for ride style (category), profile, shape, and flex
- **Size/stock data:** Parsed from `product.init()` JavaScript call — bracket-counted JSON array of `[size, ?, salePrice, origPrice, stock, [locations]]`
- **Description:** `.product-description-text` or `.product-description`

Returns one board per in-stock size variant. If no sizes are in stock, returns all sizes.

---

### Evo

- **File:** `src/lib/retailers/evo.ts`
- **Base URL:** `https://www.evo.com`
- **Search URL:** `https://www.evo.com/shop/snowboard/snowboards/sale`
- **Fetch method:** Playwright (`fetchPageWithBrowser`) — requires JS rendering
- **Currency:** USD

Two-phase: listing page, then individual product detail pages.

**Listing page** parses `.product-thumb` cards. Price text contains original + sale on separate lines.

**Detail pages** extract specs from `.pdp-spec-list`, size chart from `.spec-table`, reviews from PowerReviews widget. Returns one board per size when a size chart is present.

---

### Backcountry

- **File:** `src/lib/retailers/backcountry.ts`
- **Base URL:** `https://www.backcountry.com`
- **Search URL:** `https://www.backcountry.com/snowboards`
- **Fetch method:** Playwright (`fetchPageWithBrowser`) — Cloudflare protection
- **Currency:** USD

Two-phase: listing page, then individual product detail pages.

**Listing page** uses a multi-fallback extraction pipeline: Apollo GraphQL cache → legacy data shapes → JSON-LD → HTML cards.

**Detail pages** extract from `#__NEXT_DATA__`: specs from `product.features`, size variants from `product.skusCollection`, reviews from `product.customerReviews`.

---

### REI

- **File:** `src/lib/retailers/rei.ts`
- **Base URL:** `https://www.rei.com`
- **Search URL:** `https://www.rei.com/c/snowboards`
- **Fetch method:** Playwright with system Chrome (`channel: "chrome"`, `waitUntil: "domcontentloaded"`)
- **Currency:** USD

REI embeds product data as inline JavaScript objects in Vue.js server-rendered templates. Each product object is extracted via bracket-depth parsing. Also extracts `tileAttributes` (flex, profile, shape, category).

**Detail pages** use plain HTTP with 24h cache. First uncached URL that gets WAF blocked stops further attempts. Extracts from `table.tech-specs`.

**CDP pre-caching workaround:** REI's Akamai WAF aggressively blocks automated requests. Use `./debug.sh '{"action":"slow-scrape","useSystemChrome":true}'` to drive a real Chrome instance via CDP and pre-cache detail pages.

---

### BestSnowboard (bestsnowboard.co.kr)

- **File:** `src/lib/retailers/bestsnowboard.ts`
- **Base URL:** `https://www.bestsnowboard.co.kr`
- **Fetch method:** HTTP (`fetchPage`)
- **Currency:** KRW
- **Status:** Blocked (Cloudflare)

Korean retailer with bilingual spec extraction (English + Korean keys).

---

## Manufacturer Details

### Burton

- **File:** `src/lib/manufacturers/burton.ts`
- **Base URL:** `https://www.burton.com`
- **Catalog URLs:** `/us/en/c/mens-boards?start=0&sz=100`, `/us/en/c/womens-boards?start=0&sz=100`
- **Fetch method:** HTTP (`fetchPage`)

Two-phase: catalog page (`window.__bootstrap` JSON), then detail pages (also `__bootstrap` JSON, parsed via regex for attributes: Board Skill Level, Board Terrain, Board Bend, Board Shape, Board Flex).

---

### Lib Tech

- **File:** `src/lib/manufacturers/lib-tech.ts`
- **Base URL:** `https://www.lib-tech.com`
- **Catalog URL:** `/snowboards`
- **Fetch method:** HTTP + cheerio (Magento server-rendered HTML)

Two-phase: catalog page (`.product-item` cards), then detail pages (concurrency 3). Extracts spec table (flex, weight range, dimensions), profile from contour image alt text, category/shape from description text, price from JSON-LD.

---

### CAPiTA

- **File:** `src/lib/manufacturers/capita.ts`
- **Base URL:** `https://www.capitasnowboarding.com`
- **Fetch method:** HTTP (Shopify JSON API + HTML fallback)

Shopify JSON API (primary) → HTML catalog (fallback). Detail pages extract hexagon chart (`data-skills` attribute for jibbing, skill level, powder, groomers, versatility, jumps) and flex from `.c-spec` elements.

---

### Jones

- **File:** `src/lib/manufacturers/jones.ts`
- **Base URL:** `https://www.jonessnowboards.com`
- **Fetch method:** HTTP (Shopify JSON API + detail pages)

Detail pages extract flex from `.specs-container` (1-5 scale → 1-10), terrain ratings, profile/shape from `.product-shape-content`, and ability level from `.specs-container.riding-level`.

---

### GNU

- **File:** `src/lib/manufacturers/gnu.ts`
- **Base URL:** `https://www.gnu.com`
- **Catalog URLs:** `/snowboards/mens`, `/snowboards/womens`
- **Fetch method:** HTTP + cheerio (same Magento/Mervin platform as Lib Tech)

Same structure as Lib Tech. Scrapes both men's and women's catalogs, deduplicates by URL. Extracts profile from contour image alt text.

---

### Yes.

- **File:** `src/lib/manufacturers/yes.ts`
- **Base URL:** `https://www.yessnowboards.com`
- **Fetch method:** HTTP (Shopify JSON API only)

Shopify JSON API only. Extracts flex from `body_html` keywords (sparse — most descriptions don't mention flex). Profile, shape, and category from keyword matching.

---

### Season

- **File:** `src/lib/manufacturers/season.ts`
- **Base URL:** `https://seasoneqpt.com`
- **Fetch method:** HTTP (Shopify JSON API only)

Shopify JSON API only. Extracts flex, shape, profile, and category from `body_html` keyword matching.

---

## Manufacturer Property Coverage

| Scraper | # Boards | flex | profile | shape | category | ability level |
|---------|----------|------|---------|-------|----------|---------------|
| Burton | 34 | 34 (100%) | 34 (100%) | 34 (100%) | 31 (91%) | 31 (91%) |
| CAPiTA | 39 | 39 (100%) | 30 (77%) | 31 (79%) | 31 (79%) | 39 (100%) |
| Jones | 39 | 39 (100%) | 37 (95%) | 37 (95%) | 39 (100%) | 39 (100%) |
| Lib Tech | 29 | 29 (100%) | 16 (55%) | 14 (48%) | 29 (100%) | 26 (90%) |
| GNU | 25 | 24 (96%) | 15 (60%) | 13 (52%) | 25 (100%) | 2 (8%) |
| Yes. | 22 | 1 (5%) | — | 14 (64%) | 9 (41%) | 2 (9%) |
| Season | 5 | 3 (60%) | 2 (40%) | 4 (80%) | 5 (100%) | 1 (20%) |

---

## Adding a New Scraper

1. Create `src/lib/retailers/{name}.ts` or `src/lib/manufacturers/{name}.ts` implementing `ScraperModule`:

   ```typescript
   import { ScraperModule, ScrapedBoard } from "../scrapers/types";
   import { adaptRetailerOutput } from "../scrapers/adapters"; // for retailers
   // or: import { ManufacturerSpec, adaptManufacturerOutput } from "../scrapers/adapters"; // for manufacturers

   export const myBrand: ScraperModule = {
     name: "manufacturer:mybrand",  // or "retailer:myretailer"
     sourceType: "manufacturer",    // or "retailer"
     baseUrl: "https://...",
     region: Region.US,             // optional, for retailers
     async scrape(scope?: ScrapeScope): Promise<ScrapedBoard[]> {
       // Scrape and return ScrapedBoard[]
       // Retailers: build RawBoard[], then return adaptRetailerOutput(boards, "myretailer")
       // Manufacturers: build ManufacturerSpec[], then return adaptManufacturerOutput(specs, "My Brand")
     },
   };
   ```

2. Register in `src/lib/scrapers/registry.ts`:
   ```typescript
   import { myBrand } from "../manufacturers/my-brand";
   const ALL_SCRAPERS: ScraperModule[] = [...existing, myBrand];
   ```

3. For blocked scrapers, add to `BLOCKED_SCRAPERS` set.

4. Platform-specific patterns:
   - **Shopify:** Use `/collections/{name}/products.json` API first. See `capita.ts`.
   - **Magento:** Server-rendered HTML, use `fetchPage()` + cheerio. See `lib-tech.ts`.
   - **Custom:** May need `__bootstrap` JSON extraction (Burton) or browser rendering.

5. Test with `./debug.sh '{"action":"run","sites":["manufacturer:mybrand"]}'`.

6. Write tests for HTML/JSON parsing in `src/__tests__/{brand}.test.ts`.
