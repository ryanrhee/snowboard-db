# Task 16: Scrape all boards, not just sale/clearance listings

**Completed: 2026-02-26**

## Summary

Updated all four retailer scrapers to fetch full catalogs instead of sale-only subsets. Added pagination support to evo, tactics, and backcountry. Removed sale-only filters from evo, backcountry, and REI.

### Changes made

1. **Evo** (`src/lib/retailers/evo.ts`):
   - URL: `/shop/snowboard/snowboards/sale` → `/shop/snowboard/snowboards/rpp_200` (200 per page)
   - Added `extractTotalPages()` parsing `.results-pagination-numerals` links
   - Added pagination loop in `scrape()`
   - Removed `salePrice` requirement from listing filter
   - Added fallback: full-price boards use `originalPrice` as `salePrice`

2. **Tactics** (`src/lib/retailers/tactics.ts`):
   - URL: `/snowboards/sale` → `/snowboards`
   - Added `extractTotalPages()` parsing `.pagination-pages-content` links and dropdown
   - Added pagination loop in `scrape()` (4 pages, ~162 products)

3. **REI** (`src/lib/retailers/rei.ts`):
   - Removed sale/clearance/percentageOff filter in `productsToRawBoards()`
   - Now includes all boards with a valid `displayPrice.min`

4. **Backcountry** (`src/lib/retailers/backcountry.ts`):
   - Added `extractTotalPages()` parsing `__NEXT_DATA__` pageProps
   - Added pagination loop in `scrape()` (7 pages)
   - Removed `salePrice` requirement from listing filter
   - Added price fallback: `minSalePrice || minListPrice`

### Verification

- Tactics: 162 products across 4 pages → 354 boards (up from ~20 sale-only)
- REI: 68 products across 3 pages, all included (previously filtered to sale-only)
- REI detail pages: all 68 slow-scraped via system Chrome CDP, specs parsed for all
- Full pipeline run: 544 boards, 3,272 listings, zero errors
- TypeScript compilation clean
