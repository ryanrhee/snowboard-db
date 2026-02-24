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

| Brand | File | Platform | Fetch Method | Detail Pages | Boards in DB |
|-------|------|----------|--------------|--------------|--------------|
| Burton | `burton.ts` | Custom (`__bootstrap` JSON) | HTTP | Yes | 35 |
| Lib Tech | `lib-tech.ts` | Magento 2 (Mervin) | HTTP + cheerio | Yes | 30 |
| CAPiTA | `capita.ts` | Shopify | HTTP (JSON API + HTML) | Yes | 40 |
| Jones | `jones.ts` | Shopify | HTTP (JSON API + HTML) | Yes | 40 |
| GNU | `gnu.ts` | Magento 2 (Mervin) | HTTP + cheerio | Yes | 29 |
| Yes. | `yes.ts` | Shopify | HTTP (JSON API only) | No | 12 |
| Season | `season.ts` | Shopify | HTTP (JSON API only) | No | 5 |

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

- Burton includes the profile variant in the product name (e.g. "Custom Camber", "Custom Flying V"), producing keys like `burton|custom camber` that don't match retailer keys (`burton|custom`). Fixed in task 3.
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

- Lib Tech uses the base model name without profile code (e.g. `legitimizer`), while retailers append the code (e.g. `legitimizer c3`). Fixed in task 3.
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

- Retailer keys sometimes include artist prefixes (e.g. `arthur longo aeronaut`) that the manufacturer omits (`aeronaut`). Fixed in task 3.

---

## Jones

- **File:** `src/lib/manufacturers/jones.ts`
- **Base URL:** `https://www.jonessnowboards.com`
- **Catalog URL:** `/collections/snowboards/products.json` (Shopify JSON API)
- **Fetch method:** HTTP — Shopify JSON API primary, detail pages via `fetchPage()` + cheerio

### Scraping strategy

Two-phase: Shopify JSON API, then individual detail pages (concurrency 3).

**Primary: Shopify JSON API.** Fetches `/collections/snowboards/products.json` (paginated, up to 5 pages). Filters to snowboard products by `tags`. Extracts model name, MSRP from first variant price, and parses `body_html` for category via keyword matching.

**Detail pages** (fetched for each product) extract:
- **Flex:** From `.specs-container` with "Personality/Flex" title. Uses `.spec-ratio-value` (1–5 scale, converted to 1–10). Also captures the descriptive label (e.g. "Mid-stiff & lively") from `.spec-name` as a "flex description" extra.
- **Profile:** From `.product-shape-content` section, under the `<h4>Profile</h4>` heading (e.g. "Directional Camber / Rocker").
- **Shape:** From `.product-shape-content` section, under the `<h4>Shape</h4>` heading (e.g. "Directional").
- **Terrain ratings:** From `.specs-container` with "Terrain" title. Each `.spec` element has a `.spec-name` label (e.g. "On-piste / All-mountain") and `.spec-ratio-value` score (e.g. "10"). Stored as extras (e.g. "on-piste / all-mountain": "10/10").
- **Ability level:** From the `.specs-container.riding-level` section. Each level (Beginner, Intermediate, Expert) has a `.content-riding-level` element; active levels have `.spec-name` without the `disabled` class. Combined into a range (e.g. "intermediate-expert").
- **Category:** Derived from the highest-scoring terrain rating via `deriveCategoryFromRatings()`.
- **Shape extras:** Taper and 3D Contour Base from `.product-shape-content`.

**Body HTML parsing** detects:
- **Ability level:** beginner, intermediate, advanced, expert (fallback if detail page widget absent)

### Model name cleaning

Strips gender prefixes ("Men's", "Women's", "Youth"), " Snowboard" suffix, and year suffixes (2025, 2026).

### Known issues

- Some products are non-board items (snowskate, packages) that pass the tag filter.

---

## GNU

- **File:** `src/lib/manufacturers/gnu.ts`
- **Base URL:** `https://www.gnu.com`
- **Catalog URLs:** `/snowboards/mens`, `/snowboards/womens`
- **Fetch method:** HTTP + cheerio — server-rendered Magento store (same Mervin platform as Lib Tech)

### Scraping strategy

Two-phase: catalog pages (men's + women's), then individual detail pages (concurrency 3). Deduplicates by URL across catalogs.

**Catalog pages** parse `.product-item` cards for product names, URLs, and prices (same Magento selectors as Lib Tech).

**Detail pages** extract:
- **Spec table:** columnar table with headers like "Size | Contact Length | ... | Flex (10 = Firm) | Weight Range". All columns captured into extras; flex extracted specifically.
- **Description text:** regex-based detection of profile terms (C2, C2x, C3, BTX, B.C.), shape (true twin, directional twin, directional), category (all-mountain, freestyle, freeride, powder, park), and ability level.
- **Infographic image:** Same Mervin system as Lib Tech — per-product terrain/riderlevel PNG. Rider level inferred from image filename via slug-to-level mapping.
- **JSON-LD:** price from `Product` schema.

### Known issues

- Same infographic fragility as Lib Tech — new boards require adding slugs to the mapping.
- GNU model names in retailer listings sometimes include "Asym" prefix (e.g. "Asym Ladies Choice") that the manufacturer omits.

---

## Yes.

- **File:** `src/lib/manufacturers/yes.ts`
- **Base URL:** `https://www.yessnowboards.com`
- **Catalog URL:** `/collections/snowboards/products.json` (Shopify JSON API)
- **Fetch method:** HTTP — Shopify JSON API only, no detail page scraping

### Scraping strategy

Single-phase: Shopify JSON API only. Detail pages have size charts but no spec widgets worth extracting.

**Shopify JSON API.** Fetches `/collections/snowboards/products.json` (paginated, up to 5 pages). All products in this collection are snowboards; non-board items (bindings, apparel) are filtered out by title keywords. Extracts model name, MSRP from first variant price, and parses `body_html` for specs via keyword matching.

**Body HTML parsing** detects:
- **Profile:** hybrid camber, hybrid rocker, camber, rocker, flat
- **Shape:** true twin, asymmetrical twin (→ true twin), directional volume twin (→ directional twin), directional twin, directional
- **Category:** all-mountain freestyle (→ all-mountain), freestyle park (→ freestyle), all-mountain, freeride, freestyle, park, powder, backcountry
- **Flex:** soft/medium/stiff keywords (sparse — most descriptions don't mention flex)
- **Ability level:** beginner, intermediate, advanced, expert keywords

**Gender derivation:** from title ("Women's" → womens, "Youth"/"Kid" → youth) and Shopify tags (`2526-snowboards-women`, `2526-snowboards-kids`).

### Model name cleaning

Strips "Yes." brand prefix, gender prefixes/suffixes ("Men's", "Women's", "Youth", "Kid's"), " Snowboard" suffix, and year suffixes.

### Known issues

- Yes. does not publish flex ratings anywhere on their site — flex coverage is 0 from this scraper.
- Tags contain only year and gender — no spec data in tags.

---

## Season

- **File:** `src/lib/manufacturers/season.ts`
- **Base URL:** `https://seasoneqpt.com`
- **Catalog URL:** `/collections/snowboards/products.json` (Shopify JSON API)
- **Fetch method:** HTTP — Shopify JSON API only, no detail page scraping

### Scraping strategy

Single-phase: Shopify JSON API only.

**Shopify JSON API.** Fetches `/collections/snowboards/products.json` (paginated, up to 5 pages). Filters by `product_type` ("Snowboards" only, skips "Bundle") and title keywords (skips splitboards). Extracts model name, MSRP from first variant price, and parses `body_html` for specs via keyword matching.

**Body HTML parsing** detects:
- **Flex:** "medium-stiff" → medium-stiff, "soft-flexing" / "softer flex" / "soft flex" → soft, "stiff" → stiff, "medium" (near "flex") → medium
- **Shape:** true twin, freestyle twin (→ true twin), directional twin, directional
- **Profile:** hybrid camber, hybrid rocker, camber, rocker, flat
- **Category:** all-mountain freestyle (→ all-mountain), freestyle park (→ freestyle), all-mountain, freeride, freestyle, park (→ freestyle), powder (→ freeride), backcountry (→ freeride)
- **Ability level:** beginner, intermediate, advanced, expert keywords

**No gender derivation** — Season doesn't have gendered product lines.

### Model name cleaning

Strips "Season" brand prefix, " Snowboard" suffix, and year suffixes.

### Known issues

- Profile coverage is sparse — only a few boards mention camber explicitly in `body_html`. Most boards' profiles come from other sources.
- The Pass Splitboard is listed as a separate product and is filtered out by title keyword.

---

## Coverage Analysis

### Current state (2026-02-25)

7 of 21 brands in the database have manufacturer scrapers. Coverage by brand:

| Brand (normalized) | Boards in DB | Listings | Has Mfr Scraper | Mfr Spec Entries |
|---------------------|-------------|----------|-----------------|------------------|
| CAPiTA | 40 | 18 | Yes | 560 |
| Jones | 40 | 70 | Yes | 148 |
| Burton | 35 | 15 | Yes | 632 |
| Lib Tech | 30 | 43 | Yes | 361 |
| GNU | 29 | 16 | Yes | 298 |
| Yes. | 12 | 44 | Yes | ~60 |
| Season | 6 | 43 | Yes | ~25 |
| Sims | 6 | 24 | No | 0 |
| Arbor | 5 | 10 | No | 0 |
| Rossignol | 5 | 25 | No | 0 |
| Dinosaurs Will Die | 4 | 5 | No | 0 |
| Salomon | 4 | 13 | No | 0 |
| Nitro | 3 | 3 | No | 0 |
| Ride | 3 | 5 | No | 0 |
| Rome | 3 | 9 | No | 0 |
| Bataleon | 2 | 13 | No | 0 |
| Never Summer | 2 | 2 | No | 0 |
| K2 | 1 | 1 | No | 0 |
| Roxy | 1 | 2 | No | 0 |
| Telos | 1 | 1 | No | 0 |
| Weston | 1 | 4 | No | 0 |

### Property coverage by scraper

Total boards scraped and number with each core property filled in:

| Scraper | # Boards | flex | profile | shape | category | ability level |
|---------|----------|------|---------|-------|----------|---------------|
| Burton | 34 | 34 (100%) | 34 (100%) | 34 (100%) | 31 (91%) | 31 (91%) |
| CAPiTA | 39 | 39 (100%) | 30 (77%) | 31 (79%) | 31 (79%) | 39 (100%) |
| Jones | 39 | 39 (100%) | 37 (95%) | 37 (95%) | 39 (100%) | 39 (100%) |
| Lib Tech | 29 | 29 (100%) | 16 (55%) | 14 (48%) | 29 (100%) | 26 (90%) |
| GNU | 25 | 24 (96%) | 15 (60%) | 13 (52%) | 25 (100%) | 2 (8%) |
| Yes. | 22 | 1 (5%) | — | 14 (64%) | 9 (41%) | 2 (9%) |
| Season | 5 | 3 (60%) | 2 (40%) | 4 (80%) | 5 (100%) | 1 (20%) |

**Extras coverage** (non-core properties stored in `extras` field of `spec_sources`):

| Scraper | Notable extras |
|---------|----------------|
| Burton | bend, camber, effective edge, nose/tail width, rider weight range, sidecut radius, stance location, stance width, taper, terrain, waist width (all 34/34) |
| CAPiTA | hexagon scores: jibbing, skill level, powder, groomers, versatility, jumps (all 39/39); tags |
| Jones | tags (39/39), gender (15/39), flex description (39/39), taper (38/39), 3D contour base (34/39) |
| Lib Tech | spec table: contact length, nose/tail width, sidecut, waist width, weight range, surface area (29/29); stance setback (26–28/29) |
| GNU | spec table: contact length, nose/tail width, sidecut, waist width, weight range (24/25); stance setback (23–24/25) |
| Yes. | tags (22/22), gender (6/22) |
| Season | (none) |

**Key gaps:**

- **Profile** is weakest for Lib Tech (55%) and GNU (60%). These brands embed profile info in descriptions that don't always use detectable keywords.
- **Shape** is weakest for Lib Tech (48%) and GNU (52%) — same issue with description-based extraction.
- **Ability level** is very sparse for GNU (8%). GNU's infographic-based inference only covers 2 boards.
- **Yes.** has almost no flex data (5%) — the brand simply doesn't publish flex ratings on their site.
- **Burton** and **CAPiTA** have the most complete coverage overall, with structured data sources (Bootstrap JSON and hexagon charts respectively).

### Priority candidates for new scrapers

Ranked by impact (board count × listing count × feasibility):

#### 1. Rossignol — well-represented at retailers

- **Boards in DB:** 5
- **Listings:** 25
- **Feasibility:** Large corporate site, likely complex.
- **Impact:** Medium-high — good retailer representation.

#### 2. Nitro — Shopify (same as CAPiTA)

- **Website:** https://www.nitrosnowboards.com
- **Platform:** Shopify (DTC setup, shop domain `dtc-2526-nitrosnowboards.myshopify.com`, Impact theme v6.6.0)
- **Catalog URL:** `/collections/snowboards`, with sub-collections for men's, women's, step-on
- **JSON API:** Confirmed working at `/collections/snowboards.json`
- **Boards in DB:** 3
- **Listings:** 3
- **Feasibility:** Low effort — standard Shopify implementation. The existing `capita.ts` scraper pattern (JSON API → detail pages) can be reused almost directly. Pricing is in EUR (Nitro is a European brand), will need currency note.
- **Impact:** Medium — well-established brand but currently low retailer representation.

#### 3. Arbor — Shopify (same as CAPiTA)

- **Website:** https://www.arborcollective.com
- **Platform:** Shopify (shop domain `arbor-collective-1.myshopify.com`, Flicker theme v2.1)
- **Catalog URL:** `/collections/featured-snowboards`, with sub-collections for men's, women's, Coda collection
- **JSON API:** Standard Shopify, likely available at `/collections/featured-snowboards.json`
- **Boards in DB:** 5
- **Listings:** 10
- **Feasibility:** Low effort — same Shopify pattern as CAPiTA and Nitro. Can reuse the JSON API + detail page approach.
- **Impact:** Medium — Arbor has solid retailer coverage and their boards (Element, Foundation, Westmark, Bryan Iguchi Pro) are popular across ability levels.

### Other notable candidates (not prioritized)

| Brand | Boards | Listings | Notes |
|-------|--------|----------|-------|
| Sims | 6 | 24 | Smaller brand, website platform unknown |
| Salomon | 4 | 13 | Large corporate site (Amer Sports group), likely complex |
| Bataleon | 2 | 13 | Moderate listings but low board count |
| Rome | 3 | 9 | Moderate listings |
| Ride | 3 | 5 | Custom Nuxt.js + Amplience headless CMS — requires reverse-engineering undocumented API |
| Dinosaurs Will Die | 4 | 5 | Small brand |

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
   const ALL_MANUFACTURERS: ManufacturerModule[] = [burton, libTech, capita, jones, gnu, yes, myBrand];
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
