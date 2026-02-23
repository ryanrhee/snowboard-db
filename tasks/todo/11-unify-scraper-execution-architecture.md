# Task 11: Unify scraper execution architecture

## Problem

The current pipeline has a rigid two-phase architecture:
1. Retailer scrapers run first, producing listings (price/availability/size data)
2. Manufacturer scrapers run separately, enriching boards with spec data

This creates artificial distinctions:
- Manufacturer sites can have sales/pricing (e.g. burton.com sells direct) but that data is ignored
- Retailer sites have spec info (flex, profile, shape) but it's treated as secondary
- Scrapers depend on ordering — manufacturer enrichment assumes retailer data already exists
- The pipeline's rigid phasing makes it hard to add new sources that blur the line (e.g. a review site that also lists prices)

## Goal

Each website scraper should be independent and return **all** data it finds — specs, listings, pricing, whatever. No scraper depends on another scraper's output. A separate coalescence stage merges everything afterward.

## Architecture

### Phase 1: Scrape (independent, parallelizable)

Each scraper returns a uniform bag of data from its source:
- Board identity (brand, model, year)
- Specs (flex, profile, shape, category, ability level, etc.)
- Listings (price, size, availability, condition, URL)
- MSRP
- Extras (any source-specific metadata)

All scrapers run independently. A retailer scraper and a manufacturer scraper produce the same output shape — they just populate different fields.

### Phase 2: Coalesce (merge + resolve)

After all scrapers finish, merge all data:
- Group by board identity (brand + model)
- Resolve specs using the existing multi-source priority system (manufacturer > review-site > retailer > llm)
- Aggregate listings across retailers
- Resolve MSRP (manufacturer source preferred)

### Phase 3: Query / UI

Filter and display the coalesced data:
- Filter by gender, length, price range, flex, category, etc.
- No data transformation at this layer — just filtering and presentation

## Subtasks

### 1. Design unified scraper output type
Define a single output shape that all scrapers (retailer, manufacturer, review site) return. Must accommodate both listing data (price/size/availability) and spec data (flex/profile/shape).

### 2. Refactor manufacturer scrapers to unified output
Burton, CAPiTA, Lib Tech scrapers currently return `ManufacturerSpec`. Adapt to return the unified type, including any pricing/listing data they already have access to.

### 3. Refactor retailer scrapers to unified output
evo, Tactics, etc. currently return `RawBoard`. Adapt to return the unified type, preserving spec data they extract.

### 4. Build coalescence layer
Replace the current pipeline orchestration with:
- Run all scrapers (any order, parallelizable)
- Collect all unified output
- Group by board identity
- Resolve specs via priority system
- Aggregate listings
- Write to DB

### 5. Remove pipeline ordering dependencies
Eliminate any code that assumes retailers run before manufacturers or vice versa.
