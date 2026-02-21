# Manufacturer Spec Scrapers

Scrape snowboard specs directly from manufacturer websites into `spec_cache`, reducing LLM enrichment calls.

## Usage

```bash
# All manufacturers
npx tsx src/scripts/scrape-specs.ts

# Specific brand
npx tsx src/scripts/scrape-specs.ts --brand burton
npx tsx src/scripts/scrape-specs.ts --brand "Lib Tech"
npx tsx src/scripts/scrape-specs.ts --brand capita

# Via API (requires dev server running)
curl -X POST http://localhost:3099/api/scrape-specs -H "Content-Type: application/json" -d '{"brands":["Burton"]}'
```

## Scraper Status

### Active Scrapers

| Brand | Strategy | Flex | Profile | Shape | Category | MSRP |
|-------|----------|------|---------|-------|----------|------|
| **Burton** (38 boards) | Plain fetch, parse `window.__bootstrap` JSON from catalog pages | — | 84% | 55% | 82% | 100% |
| **Lib Tech** (25 boards) | Plain fetch + cheerio, Magento server-rendered HTML | 100% | 28% | 44% | 100% | 100% |
| **CAPiTA** (39 boards) | Shopify `/collections/all-snowboards/products.json` API | — | 8% | 5% | 79% | 100% |

**Notes:**
- **MSRP** is the highest-value field — 100% across all scrapers. Retailers often omit original price, so this enables discount/premium calculations.
- **Flex** is only available from Lib Tech's columnar spec table. Burton and CAPiTA don't expose flex on catalog/listing pages.
- **Profile** is strong for Burton (encoded in product names: "Custom Camber", "Process Flying V") and partial for Lib Tech (from description text: BTX, C2, C3). CAPiTA stores profile info in images, not text.
- **Shape** and **Category** are extracted from product description keywords across all three.

### Deferred Manufacturers

| Brand | Reason | Notes |
|-------|--------|-------|
| **Jones** | hCaptcha blocks automated scraping | All requests hit a captcha wall. Would need a captcha-solving service or manual cookie injection. |
| **Yes.** | Site connection issues | `yesnowboard.com` intermittently refuses connections. May be geo-restricted or have aggressive bot protection. |
| **Season** | Domain not resolving | `seasonsnowboards.com` DNS fails. May have moved domains or shut down. |

## Architecture

Manufacturer scrapers are **separate from retailer scrapers**. They don't deal with prices/availability/deals — they enumerate board models and return specs.

```
src/lib/manufacturers/
├── types.ts        # ManufacturerSpec, ManufacturerModule interfaces
├── registry.ts     # getManufacturers(), getAllManufacturerBrands()
├── ingest.ts       # Normalize specs and write to spec_cache
├── burton.ts       # Burton scraper
├── lib-tech.ts     # Lib Tech scraper
└── capita.ts       # CAPiTA scraper

src/scripts/
└── scrape-specs.ts # CLI entry point

src/app/api/scrape-specs/
└── route.ts        # POST /api/scrape-specs
```

### Key Normalization

Manufacturer and retailer model names differ (e.g., "Custom Camber Snowboard 2026" vs "Custom Camber"). The `cleanModelForKey()` function strips:
- "Snowboard", year suffixes (2024–2029)
- Gender prefixes ("Men's", "Women's")
- Profile terms ("Camber", "Rocker", "Flat", "C2", "BTX", etc.)
- Abbreviation dot spacing ("T. Rice" → "T.Rice")

### Data Priority

Manufacturer data (`source: 'manufacturer'`) takes priority over LLM data (`source: 'llm'`). LLM enrichment will not overwrite manufacturer-sourced cache entries.

### Sandbox Note

Playwright crashes with SIGSEGV when launched from Claude Code's sandbox (Meta's sandbox blocks Chromium's mach port bootstrap calls). Burton's scraper was rewritten to use plain `fetchPage` instead. For any future scraper that needs Playwright, use the `POST /api/scrape-specs` endpoint via curl against the dev server running in a regular terminal.
