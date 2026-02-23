# Manufacturer Scrapers

## Overview

Manufacturer scrapers fetch spec data (flex, profile, shape, category, ability level, MSRP) directly from brand websites. This data has the highest priority in spec resolution (priority 4, above review sites and retailers). Each scraper implements the `ManufacturerModule` interface:

```typescript
interface ManufacturerModule {
  brand: string;
  baseUrl: string;
  scrapeSpecs(): Promise<ManufacturerSpec[]>;
}
```

Scrapers are registered in `src/lib/manufacturers/registry.ts` and invoked via `ingestManufacturerSpecs()` in `src/lib/manufacturers/ingest.ts`. The ingest layer normalizes raw spec values, writes to `spec_cache`, `spec_sources`, and upserts into the `boards` table.

## Active Scrapers

| Brand | File | Platform | Fetch Method | Detail Pages | Boards Scraped |
|-------|------|----------|--------------|--------------|----------------|
| Burton | `burton.ts` | Custom (`__bootstrap` JSON) | HTTP | Yes | ~38 |
| Lib Tech | `lib-tech.ts` | Magento 2 (Mervin) | HTTP + cheerio | Yes | ~30 |
| CAPiTA | `capita.ts` | Shopify | HTTP (JSON API + HTML) | Yes | ~39 |

---

## Burton

- **File:** `src/lib/manufacturers/burton.ts`
- **Base URL:** `https://www.burton.com`
- **Catalog URLs:** `/us/en/c/mens-boards?start=0&sz=100`, `/us/en/c/womens-boards?start=0&sz=100`
- **Fetch method:** HTTP (`fetchPage`) — no browser needed

### Scraping strategy

Two-phase: catalog page, then individual detail pages.

**Catalog pages** contain a `window.__bootstrap` JSON blob with product listings. Each product has `productName`, `price.list.value` (MSRP), and a detail page URL. Both men's and women's catalog pages are scraped.

**Detail pages** also have `__bootstrap` JSON, but it's often malformed so attributes are extracted via regex: `"label":"...","value":[...]` patterns. Extracted attributes include:

- Board Skill Level → ability level
- Board Terrain → category
- Board Bend → profile
- Board Shape → shape
- Board Flex → flex
- All other label/value pairs → extras

### Known issues

- Burton includes the profile variant in the product name (e.g. "Custom Camber", "Custom Flying V"), producing keys like `burton|custom camber` that don't match retailer keys (`burton|custom`). See TASKS.md #3.
- `__bootstrap` JSON on detail pages is sometimes malformed, requiring regex extraction instead of JSON.parse.

---

## Lib Tech

- **File:** `src/lib/manufacturers/lib-tech.ts`
- **Base URL:** `https://www.lib-tech.com`
- **Catalog URL:** `https://www.lib-tech.com/snowboards`
- **Fetch method:** HTTP + cheerio — server-rendered Magento store

### Scraping strategy

Two-phase: catalog page, then individual detail pages (concurrency 3).

**Catalog page** parses `.product-item` cards for product names, URLs, and prices.

**Detail pages** extract:
- **Spec table:** columnar table with headers like "Size | Contact Length | ... | Flex (10 = Firm) | Weight Range". All columns captured into extras; flex extracted specifically.
- **Description text:** regex-based detection of profile terms (C2, C2x, C3, BTX, B.C.), shape (true twin, directional twin, directional), category (all-mountain, freestyle, freeride, powder, park), and ability level.
- **Infographic image:** Lib Tech uses per-product terrain/riderlevel PNG images. Rider level is inferred from the image filename via a hardcoded slug-to-level mapping.
- **JSON-LD:** price from `Product` schema.

### Known issues

- Lib Tech uses the base model name without profile code (e.g. `legitimizer`), while retailers append the code (e.g. `legitimizer c3`). See TASKS.md #3.
- Rider level inference from infographic filenames is fragile — new boards require adding slugs to the mapping.

---

## CAPiTA

- **File:** `src/lib/manufacturers/capita.ts`
- **Base URL:** `https://www.capitasnowboarding.com`
- **Fetch method:** HTTP — Shopify JSON API primary, HTML fallback

### Scraping strategy

**Primary: Shopify JSON API.** Fetches `/collections/all-snowboards/products.json` (paginated, up to 5 pages). Filters to snowboard products by `product_type` and `tags`. Extracts model name, MSRP from first variant price, and parses `body_html` for specs (flex, profile, shape, category, ability level) via regex.

**Detail pages** (fetched for each product, concurrency 3) extract:
- **Hexagon chart:** `data-skills` attribute on `.c-hexagon` div contains comma-separated scores for jibbing, skill level, powder, groomers, versatility, jumps. Skill level is mapped to ability range (1=beginner, 5=advanced-expert).
- **Spec bars:** CSS `--dot-position` custom properties on `.c-spec` elements.

**Fallback: HTML catalog.** If JSON API fails, scrapes `.product-card` elements from the collection page for basic name/price data only.

### Known issues

- Retailer keys sometimes include artist prefixes (e.g. `arthur longo aeronaut`) that the manufacturer omits (`aeronaut`). See TASKS.md #3.

---

## Coverage Analysis

### Current state

Only 3 of ~20 brands in the database have manufacturer scrapers. After brand normalization, the coverage looks like:

| Brand (normalized) | Boards in DB | Listings | Has Mfr Scraper | Mfr Spec Entries |
|---------------------|-------------|----------|-----------------|------------------|
| Lib Tech | 26 | 10+ | Yes | 318 |
| Jones | 20 | 25 | No | 0 |
| Yes. | 20 | 17+ | No | 0 |
| Burton | 15 | 12+ | Yes | 670 |
| GNU | 15 | 14 | No | 0 |
| Arbor | 10 | 11 | No | 0 |
| CAPiTA | 10 | — | Yes | 468 |
| Sims | 10 | 9 | No | 0 |
| Season | 10 | 6 | No | 0 |
| Nitro | 8 | 10 | No | 0 |
| Rossignol | 8 | 5 | No | 0 |
| Salomon | 7 | 6 | No | 0 |
| DWD | 7 | 7 | No | 0 |
| Rome | 6 | 4 | No | 0 |
| Ride | 5 | 7 | No | 0 |
| K2 | 5 | 6 | No | 0 |
| Never Summer | 4 | 4 | No | 0 |
| Bataleon | 4 | 3 | No | 0 |
| Nidecker | 2 | 2 | No | 0 |

Board counts include duplicates from brand normalization issues (e.g. "GNU" + "Gnu" = 15). See TASKS.md #1.

### Priority candidates for new scrapers

Ranked by impact (board count × listing count × feasibility):

#### 1. GNU — Magento (same as Lib Tech)

- **Website:** https://www.gnu.com
- **Platform:** Magento 2.4.5 (Mervin Manufacturing theme — same parent company as Lib Tech)
- **Catalog URL:** `/snowboards`, with sub-collections `/snowboards/mens`, `/snowboards/womens`
- **Boards in DB:** 15 (after normalizing GNU/Gnu)
- **Listings:** 14
- **Feasibility:** Low effort — same Magento platform as Lib Tech. The existing `lib-tech.ts` scraper can be adapted with minimal changes (different base URL, different CSS selectors if any, different infographic slug mapping). Server-rendered HTML, plain fetch + cheerio, no browser needed.
- **Spec availability:** Product pages likely have the same columnar spec table and terrain/riderlevel infographic as Lib Tech (same CMS, same company).
- **Impact:** High — fills specs for the 4th-largest brand group. GNU boards (Headspace, Ladies Choice, Money, etc.) are popular beginner/intermediate boards that are well-represented in retailer listings.

#### 2. Nitro — Shopify (same as CAPiTA)

- **Website:** https://www.nitrosnowboards.com
- **Platform:** Shopify (DTC setup, shop domain `dtc-2526-nitrosnowboards.myshopify.com`, Impact theme v6.6.0)
- **Catalog URL:** `/collections/snowboards`, with sub-collections for men's, women's, step-on
- **JSON API:** Confirmed working at `/collections/snowboards.json`
- **Boards in DB:** 8
- **Listings:** 10
- **Feasibility:** Low effort — standard Shopify implementation. The existing `capita.ts` scraper pattern (JSON API → detail pages) can be reused almost directly. Pricing is in EUR (Nitro is a European brand), will need currency note.
- **Spec availability:** Product pages have spec details in body HTML and potentially structured Shopify metafields. Detail page scraping will extract flex, profile, shape, category.
- **Impact:** Medium-high — Nitro is a well-established brand with good retailer representation. Their boards (Optisym, Alternator, Team, etc.) frequently appear on sale.

#### 3. Arbor — Shopify (same as CAPiTA)

- **Website:** https://www.arborcollective.com
- **Platform:** Shopify (shop domain `arbor-collective-1.myshopify.com`, Flicker theme v2.1)
- **Catalog URL:** `/collections/featured-snowboards`, with sub-collections for men's, women's, Coda collection
- **JSON API:** Standard Shopify, likely available at `/collections/featured-snowboards.json`
- **Boards in DB:** 10
- **Listings:** 11
- **Feasibility:** Low effort — same Shopify pattern as CAPiTA and Nitro. Can reuse the JSON API + detail page approach.
- **Spec availability:** ~32 boards visible on featured collection. Product pages should have spec data in body HTML.
- **Impact:** Medium-high — Arbor has solid retailer coverage and their boards (Element, Foundation, Westmark, Bryan Iguchi Pro) are popular across ability levels.

### Other notable candidates (not prioritized)

| Brand | Boards | Why not top 3 |
|-------|--------|---------------|
| **Jones** (20 boards, 25 listings) | Shopify but **hCaptcha protected** — automated scraping blocked without captcha-solving service. Highest board count but infeasible without additional tooling. |
| **Yes.** (20 boards, 17 listings) | Website platform unknown. Needs investigation. High board count but unknown feasibility. |
| **Rossignol** (8 boards, 43% avg discount) | Large corporate site, likely complex. Best discounts but moderate board count. |
| **Ride** (5 boards, 7 listings) | Custom Nuxt.js + Amplience headless CMS — requires reverse-engineering undocumented API. Medium-high effort. |
| **Salomon** (7 boards) | Large corporate site (Amer Sports group), likely complex. |
| **Season** (10 boards) | Smaller brand, website platform unknown. |
| **Sims** (10 boards) | Smaller brand, website platform unknown. |

---

## Adding a New Manufacturer Scraper

1. Create `src/lib/manufacturers/{brand}.ts` implementing `ManufacturerModule`:
   ```typescript
   import { ManufacturerModule, ManufacturerSpec } from "./types";
   import { fetchPage } from "../scraping/utils";

   export const myBrand: ManufacturerModule = {
     brand: "My Brand",        // canonical brand name
     baseUrl: "https://...",
     async scrapeSpecs(): Promise<ManufacturerSpec[]> {
       // Scrape catalog + detail pages
       // Return ManufacturerSpec[] with model, flex, profile, shape, category, msrpUsd, extras
     },
   };
   ```

2. Register in `src/lib/manufacturers/registry.ts`:
   ```typescript
   import { myBrand } from "./my-brand";
   const ALL_MANUFACTURERS: ManufacturerModule[] = [burton, libTech, capita, myBrand];
   ```

3. The `ManufacturerSpec` fields:
   - `brand` — canonical brand name (must match `canonicalizeBrand()` output)
   - `model` — clean model name, brand prefix stripped
   - `flex` — raw string, normalized by ingest layer (e.g. "6", "Medium", "5/10")
   - `profile` — raw string (e.g. "Camber", "C2x", "CamRock")
   - `shape` — raw string (e.g. "True Twin", "Directional")
   - `category` — raw string (e.g. "All-Mountain", "Freestyle")
   - `msrpUsd` — MSRP in USD (convert from other currencies if needed)
   - `sourceUrl` — product page URL
   - `extras` — all additional key-value data (ability level, weight range, etc.)

4. Platform-specific patterns:
   - **Shopify:** Use `/collections/{name}/products.json` API first (structured, paginated). Fall back to HTML. See `capita.ts`.
   - **Magento:** Server-rendered HTML, use `fetchPage()` + cheerio. See `lib-tech.ts`.
   - **Custom:** May need `__bootstrap` JSON extraction (Burton), API reverse-engineering, or browser rendering.

5. Run `./debug.sh '{"action":"scrape-specs"}'` to test. Check `spec_cache` and `spec_sources` tables for results.

6. Write tests for HTML/JSON parsing in `src/__tests__/{brand}.test.ts` and `src/__tests__/{brand}-html.test.ts`. Use saved HTML fixtures where possible.
