# Task 28: Replace regex text matching with structured DOM extraction in manufacturer scrapers

## Problem

Most manufacturer scrapers extract board properties (profile, shape, category, ability level) by lowercasing the entire page text and running regex/keyword matching against it. This is fragile — it can match unrelated text, miss data in structured widgets, and produces lower-quality values than extracting from the actual DOM elements the site uses to present specs.

Jones was recently refactored to extract from structured DOM (`.specs-container`, `.product-shape-content`) and went from ~50% coverage on profile/shape to 95%, and category from 87% to 100%.

## Current state

| Scraper | Flex | Profile | Shape | Category | Ability Level |
|---------|------|---------|-------|----------|---------------|
| Burton | Structured JSON | Text fallback | Text fallback | Text fallback | Text fallback |
| CAPiTA | Text | Text | Text | Text | Text (+ hexagon widget) |
| GNU | Structured table | Text | Text | Text | Text (+ infographic) |
| Jones | **Structured DOM** | **Structured DOM** | **Structured DOM** | **Structured DOM** | Text fallback |
| Lib Tech | Structured table | Text | Text | Text | Text (+ infographic) |
| Season | Text | Text | Text | Text | Text |
| Yes. | Text | Text | Text | Text | Text |

"Text" = regex or `.includes()` on lowercased full-page/body text (sole extraction method). "Text fallback" = a structured extraction runs first, but falls back to text matching when the structured path doesn't find a value. Both should be replaced — the fallback case is easier since there's already a structured path that can be expanded.

## Approach

For each scraper, inspect the actual product pages to find structured DOM elements (spec tables, widgets, data attributes, JSON-LD, Shopify tags) that contain the properties currently being extracted via text matching. Replace the text matching with cheerio selectors targeting those elements.

### Priority order

1. **CAPiTA** — 39 boards, already fetches detail pages. The hexagon widget extracts ability level structurally; profile/shape/category/flex likely have structured sources on detail pages too. Profile and shape are partially extracted from Shopify tags already.

2. **Lib Tech** — 29 boards, already fetches detail pages with spec tables. Profile/shape/category are in description text but the site likely has structured elements (similar Mervin platform as GNU).

3. **GNU** — 25 boards, same Mervin platform as Lib Tech. Profile/shape/category should have the same structured sources.

4. **Burton** — 34 boards, already extracts flex from structured JSON. The `extractSpecsFromText()` fallback for profile/shape/category/ability could likely use the structured `__bootstrap` JSON attributes instead (the primary extraction path already does this — the text fallback may be unnecessary).

5. **Yes.** — 22 boards, Shopify JSON only (no detail pages). Would need to add detail page fetching to find structured elements, or find structured data in the JSON API response (tags, metafields).

6. **Season** — 5 boards, smallest catalog. Same situation as Yes. — Shopify JSON only.

## Subtasks

### 1. CAPiTA: extract specs from detail page DOM
Inspect CAPiTA detail pages for structured spec elements. The hexagon chart (`.c-hexagon`) already works. Look for profile/shape/category/flex in spec widgets or data attributes.

### 2. Lib Tech / GNU: extract specs from structured elements
These share the Mervin/Magento platform. Look for profile/shape/category in spec tables, product attribute sections, or structured markup beyond the free-text description.

### 3. Burton: audit text fallback necessity
Check whether `extractSpecsFromText()` is actually needed given the structured JSON attribute extraction. If all boards get profile/shape/category from JSON attributes, remove the text fallback.

### 4. Yes. / Season: investigate structured data sources
Check if Shopify JSON API responses contain spec data in tags, metafields, or product options. If not, add detail page fetching and look for structured spec elements.
