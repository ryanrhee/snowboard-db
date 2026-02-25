# Task 34: Improve retailer spec extraction with structured DOM over regex

**Completed**: 2026-02-25

## Summary

Audited all retailer and manufacturer scrapers for regex usage. Made structural improvements where possible, documented unavoidable regex, and removed dead code.

### Changes

1. **REI**: Replaced bracket-counting with structured JSON parse of `<script id="initial-props">`. Products at `ProductSearch.products.searchResults.results`, pagination at `.pagination.totalPages`. Bracket-counting removed entirely.

2. **Backcountry**: Removed bullet-point regex fallback for profile/shape extraction. Only fired for 1/41 boards (a board+binding package). Profile/shape now come exclusively from structured `product.attributes`/`product.features` in `__NEXT_DATA__`.

3. **Lib Tech + GNU**: `extractMagentoListings()` now accepts `jsonLdPrice` from `parseDetailHtml()`, avoiding redundant JSON-LD re-parsing. Documented that contour image alt/src regex and Magento inline pricing regex are unavoidable.

4. **Season**: Documented that SVG filename regex (`flex-Nof10.svg`) and image alt regex are correct — visual assets encode the data.

5. **Yes.**: Documented that heading text regex and bar-chart fallback are correct — no structured alternative exists.

## Files modified

- `src/lib/retailers/rei.ts` — replaced bracket-counting with structured JSON parse
- `src/lib/retailers/backcountry.ts` — removed bullet-point regex fallback
- `src/lib/manufacturers/lib-tech.ts` — pass JSON-LD price to listing extraction, documentation
- `src/lib/manufacturers/gnu.ts` — same as lib-tech
- `src/lib/manufacturers/season.ts` — documentation on SVG filename and image alt regex
- `src/lib/manufacturers/yes.ts` — documentation on bar-chart and heading text extraction
