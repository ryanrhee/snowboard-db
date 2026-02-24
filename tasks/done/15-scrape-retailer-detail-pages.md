# Task 15: Scrape retailer product detail pages for additional data

## Problem

The evo, backcountry, and rei scrapers currently only process search/listing index pages, extracting basic data: brand, model, price, URL, sizes, and availability. They skip the individual product detail pages entirely. These detail pages contain substantially more information that would improve board data quality:

- **Detailed descriptions** (riding style, terrain recommendations, construction)
- **Full size charts** (waist width per length, weight ranges, stance setback)
- **Spec tables** (flex rating, profile/camber type, shape, base material, core)
- **Images** (product photos, profile diagrams)
- **User reviews / ratings**
- **Condition details** (for used/outlet listings)
- **Related product links** (prior year models, similar boards)

Task 9 covers the spec-extraction subset of this work. This task is broader: build the infrastructure for detail-page scraping across retailers and extract all useful structured data, not just the five core spec fields.

## Goal

For each retailer scraper (evo, backcountry, rei), add a detail-page fetch pass that:

1. Follows the product URL from the listing page
2. Parses the detail page HTML for all available structured data
3. Returns the additional fields alongside the existing listing data

The detail-page fetch should use the existing `http_cache` so pages are only fetched once per TTL window.

## Approach

### Per-retailer detail page data

**Evo** (`evo.com`):
- Spec table with flex, profile, shape, ability level, terrain, etc.
- "Tech Specs" section with detailed construction info
- Size chart with waist width per length
- User reviews and ratings

**Backcountry** (`backcountry.com`):
- Structured specs section
- Size chart
- User reviews and ratings
- "Features" list

**REI** (`rei.com`):
- "Specs & features" accordion with key-value pairs
- Size chart
- User reviews and ratings
- "Key features" bullet list

### Implementation steps

1. Add a `scrapeDetailPage(html: string)` function to each retailer scraper that extracts all available structured data from a detail page into a typed object.
2. In each scraper's main flow, after collecting listings from index pages, batch-fetch detail page URLs (using `http_cache`).
3. Merge detail-page data into the listing/board records returned by the scraper.
4. Feed any spec fields (flex, profile, shape, category, ability level) into `spec_sources` with source `retailer:<name>`.

### Considerations

- Detail-page fetches multiply network requests (~1 per board per retailer). Rely on `http_cache` to keep this manageable.
- Some retailers may require different request headers or have anti-scraping measures on detail pages vs. listing pages.
- Parse defensively — detail page structure varies by product and may change over time.

## Completed: 2026-02-24

### What was done

**Evo (`src/lib/retailers/evo.ts`):**
- Added `.spec-table` size chart parsing → extracts `widthMm` and rider weight per size
- When size chart has multiple entries, returns one `RawBoard` per size (matching backcountry's array return pattern)
- Updated `searchBoards()` to handle `RawBoard[]` returns from `fetchBoardDetails()`
- Added PowerReviews extraction: `.pr-snippet-rating-decimal` → rating, `.pr-snippet-review-count` → review count
- Both stored in `specs["rating"]` and `specs["review count"]`

**Backcountry (`src/lib/retailers/backcountry.ts`):**
- Added `product.customerReviews` extraction from `__NEXT_DATA__`
- Stores `customerReviews.average` → `specs["rating"]` and `customerReviews.count` → `specs["review count"]`

**REI (`src/lib/retailers/rei.ts`):**
- Added `tryFetchDetailPage()` using regular HTTP `fetchPage()` (not browser)
- Tests first URL; if WAF blocks (403, captcha, short response), logs and skips all remaining detail pages
- If successful, parses spec tables (tr/td and dt/dd patterns) for ability level, flex, profile, shape, category
- Integrated into `searchBoards()` after listing scrape completes
