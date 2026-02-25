# Task 31: Unify manufacturer and retailer scrapers into a single scraper interface

## Problem

The codebase maintains a hard distinction between manufacturer scrapers and retailer scrapers: separate interfaces (`ManufacturerModule` vs retailer scraper), separate registries, separate ingest paths, separate pipeline phases, and separate debug actions (`run` vs `run-manufacturers`). This adds architectural complexity without much benefit — both types of scrapers do fundamentally the same thing: visit a site, extract board data (specs, prices, listings), and return structured results.

The only real difference is **source priority**: when a manufacturer site says a board's flex is 6, that should outrank a retailer saying it's 5. But this is a metadata property of the source, not a reason for two parallel architectures.

## Goal

Collapse manufacturer and retailer scrapers into a single `Scraper` interface. The only distinction is a priority/trust level flag on the source. A scraper for burton.com produces boards, listings, and specs just like a scraper for evo.com — burton.com's specs just get higher priority for Burton boards.

## Approach

1. **Single scraper interface**: One interface that returns boards with specs and listings. Every scraper (whether it's burton.com, evo.com, or thegoodride.com) implements it. All scrapers extract board specs aggressively — retailer detail pages have structured spec data (flex, profile, shape, terrain, ability level) that should be scraped just as thoroughly as manufacturer pages.
2. **Source trust metadata**: Each scraper declares which brands it manufactures (if any). Specs for those brands get `manufacturer` priority. Everything else gets `retailer` priority. A site like evo.com manufactures nothing. Burton.com manufactures Burton boards. If a manufacturer site also sells other brands, those listings get retailer-level priority.
3. **Uniform listing output**: All scrapers produce listings (price, sizes, availability, URL). Manufacturer sites run sales and discounts just like retailers — a discounted price on burton.com is a listing just like a discounted price on evo.com.
4. **MSRP is manufacturer-only**: MSRP (the non-discounted original price) can only come from the manufacturer source. When a manufacturer site shows both a compare-at/original price and a sale price, the original price is MSRP and the sale price is the listing price. Retailers never set MSRP — they only produce listing prices. This is the one semantic distinction the `manufactures` metadata enables beyond spec priority.
5. **Single registry**: One list of all scrapers, filterable by name/region/etc. No separate `getRetailers()` / `getManufacturers()` — just `getScrapers()`.
6. **Single pipeline path**: One ingest flow that handles all scrapers uniformly. Priority is determined by source metadata, not by which code path ran.
7. **Simplify debug actions**: Collapse `run` / `run-full` / `run-manufacturers` into one action with optional site filters.

## Considerations

- This subsumes Task 26 (manufacturer listings and MSRP). Task 15 (retailer detail pages) is already done but its pattern should generalize to all scrapers.
- Review sites (The Good Ride) could also become just another scraper with `review-site` priority, further unifying the architecture.
- The `ScrapeScope` filtering (`retailers`, `manufacturers` arrays) collapses into a single `sites` array.
- Existing per-scraper code (HTML parsing, etc.) doesn't change — only the wrapping interface and pipeline plumbing.

## Per-site implementation notes

### Manufacturer sale/discount price detection (from Task 26)

When extracting listings from manufacturer sites, detect sale vs. original price:
- **Shopify-based (CAPiTA, Jones, Yes., Season)**: `compare_at_price` vs `price` in products.json
- **Burton**: `salePrice` vs `listPrice` in `__bootstrap` JSON
- **Lib Tech / GNU**: strikethrough price elements on detail pages
- Some manufacturers may not sell direct (e.g. GNU redirects to evo) — only create listings where the site actually has purchase capability.

### Retailer detail page data available (from Task 15)

Already implemented for evo, backcountry, REI (Task 15 done). Available structured data:
- **Evo**: spec table (flex, profile, shape, ability, terrain), size chart (width per length, weight range), reviews/ratings
- **Backcountry**: structured specs from `__NEXT_DATA__`, reviews/ratings
- **REI**: spec tables (dt/dd and tr/td patterns) for ability, flex, profile, shape, category; WAF may block detail pages
- **Tactics**: already fetches detail pages and extracts specs
