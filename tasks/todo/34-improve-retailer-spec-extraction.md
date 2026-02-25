# Task 34: Improve retailer spec extraction with structured DOM over regex

## Problem

Retailer scrapers vary widely in what fields they extract and how. Some use structured DOM selectors or JSON parsing, while others fall back to regex on raw HTML or description text. Regex-based extraction is fragile — it breaks when markup changes and can produce false matches.

All scrapers should prefer structured DOM/table/JSON extraction over blind keyword regex on HTML body text.

## Current state: fields extracted per scraper

### Retailer scrapers

| Field | Tactics | Evo | Backcountry | REI |
|-------|---------|-----|-------------|-----|
| brand | DOM | DOM | JSON | JSON |
| model | DOM | DOM | JSON | JSON |
| price (sale + original) | DOM | DOM + JSON-LD | JSON + JSON-LD | inline JSON |
| sizes | JS array parse | spec table | JSON-LD ProductGroup | inline JSON |
| width (mm) | JS array | spec table | — | — |
| flex | spec icon DOM | spec table | — | detail page table |
| profile | spec icon DOM | spec table | regex on bullets | detail page table |
| shape | spec icon DOM | spec table | regex on bullets | detail page table |
| category | spec icon DOM | spec table | regex on bullets | detail page table |
| ability level | spec icon DOM | spec table | — | detail page table |
| weight range | — | spec table | — | — |
| rating / reviews | — | DOM (PowerReviews) | JSON (__NEXT_DATA__) | — |
| stock count | JS array | — | — | — |
| description | DOM | DOM | JSON | — |

### Manufacturer scrapers

| Field | Burton | Lib Tech | GNU | CAPiTA | Jones | Yes. | Season |
|-------|--------|----------|-----|--------|-------|------|--------|
| flex | **regex** (Personality slider) | spec table DOM | spec table DOM | DOM + regex | DOM | DOM + regex | **regex** (SVG filename) |
| profile | regex (attributes) | **regex** (image alt/src) | **regex** (image alt/src) | DOM | DOM | — | **regex** (img alt) |
| shape | regex (attributes) | description parsing | description parsing | DOM | DOM | **regex** (heading) | **regex** (img alt) |
| category | regex (attributes) | description parsing | description parsing | DOM | terrain ratings DOM | text includes | — |
| ability level | regex (attributes) | infographic | infographic | hexagon DOM | DOM (disabled class) | — | — |
| MSRP | **regex** (JSON price) | JSON-LD + **regex** (Magento) | JSON-LD + **regex** (Magento) | Shopify JSON | Shopify JSON | Shopify JSON | Shopify JSON |

## Regex hot spots to replace with structured extraction

### Retailers

**Backcountry** (`src/lib/retailers/backcountry.ts:275-288`):
- Profile/shape inferred via regex on bullet point description text (`/camber/`, `/rocker/`, `/directional twin/`, etc.)
- Should use structured spec attributes from `__NEXT_DATA__` Apollo cache or product attributes array instead

**REI** (`src/lib/retailers/rei.ts:43-93`):
- Bracket-counting algorithm to extract inline product JSON from Vue.js template
- Fragile — breaks if template structure changes
- Should look for a more structured data source (embedded JSON, API endpoint)

### Manufacturers

**Burton** (`src/lib/manufacturers/burton.ts:43-73, 121-124`):
- Flex extracted via regex from raw `__bootstrap` JSON (Personality slider): `/\"title"\s*:\s*"Personality"[^}]*"lowerValue"\s*:\s*"(\d+)"/`
- All attributes extracted via regex: `/\"label"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*(\[[^\]]*\])/g`
- Prices via regex: `/\"list"\s*:\s*\{[^}]*"value"\s*:\s*([\d.]+)/`
- Root cause: `__bootstrap` JSON is malformed, can't JSON.parse — but could try partial JSON repair or more targeted extraction

**Lib Tech / GNU** (`lib-tech.ts:177-191,251-252`, `gnu.ts:209-226,282-291`):
- Profile from image alt text regex: `/Lib Tech (.+?) Snowboard Contour/i`
- Profile fallback from image src URL pattern matching (c2x, c2e, c3, btx)
- Prices from Magento inline JSON regex: `/\"oldPrice"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/`
- Description text split parsing with regex validation

**Season** (`src/lib/manufacturers/season.ts:169-201`):
- Flex from SVG filename regex: `/flex-(\d+)of(\d+)\.svg/`
- Shape/profile from image alt text regex patterns

**Yes.** (`src/lib/manufacturers/yes.ts:191,202,232-240`):
- Shape from heading regex: `/shape\s*:\s*(.+)/i`
- Flex ratio regex: `/(\d+)\s*\/\s*10/`

## Goal

1. Replace regex-on-body-text extraction with structured DOM/JSON parsing wherever possible.
2. Where regex is unavoidable (e.g. Burton's malformed JSON), document why and keep patterns as narrow as possible.
3. Expand retailer spec extraction to cover more fields — especially backcountry (missing flex, ability level, width) and REI (missing width, weight range, reviews).
4. Ensure all scrapers extract the same core fields when the data is available on the page.

## Approach

1. Audit each regex hot spot — determine if a structured alternative exists on the page.
2. For backcountry: check if `__NEXT_DATA__` or product attributes array contains flex, ability level, and other specs that are currently missed.
3. For REI: investigate whether there's a cleaner data source than bracket-counting on inline Vue.js templates.
4. For Burton: investigate partial JSON repair for `__bootstrap` to avoid regex attribute extraction.
5. For Lib Tech/GNU: the image alt/src regex for profile is reasonable (no structured alternative), but Magento price extraction should use JSON-LD when available.
6. Standardize: every scraper should attempt to extract flex, profile, shape, category, ability level from detail pages using structured selectors first.
