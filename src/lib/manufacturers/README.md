# Manufacturer Spec Scrapers

Scrape snowboard specs directly from manufacturer websites. Each scraper implements the unified `ScraperModule` interface (see `src/lib/scrapers/types.ts`) and is registered in `src/lib/scrapers/registry.ts`.

## Usage

```bash
# All manufacturers (via debug route)
./debug.sh '{"action":"run","retailers":[]}'

# Specific manufacturer
./debug.sh '{"action":"run","sites":["manufacturer:burton"]}'

# Via CLI script
npx tsx src/scripts/scrape-specs.ts
npx tsx src/scripts/scrape-specs.ts --brand burton

# Via API
curl -X POST http://localhost:3099/api/scrape-specs -H "Content-Type: application/json" -d '{"brands":["Burton"]}'
```

## Architecture

```
src/lib/manufacturers/
├── burton.ts       # Burton scraper (ScraperModule)
├── lib-tech.ts     # Lib Tech scraper
├── capita.ts       # CAPiTA scraper
├── jones.ts        # Jones scraper
├── gnu.ts          # GNU scraper
├── yes.ts          # Yes. scraper
└── season.ts       # Season scraper

src/lib/scrapers/
├── types.ts        # ScraperModule, ScrapedBoard interfaces
├── registry.ts     # Unified registry (all retailers + manufacturers)
└── adapters.ts     # ManufacturerSpec type + adaptManufacturerOutput/adaptRetailerOutput helpers
```

Manufacturer scrapers internally build `ManufacturerSpec[]` (an intermediate type in `adapters.ts`), then call `adaptManufacturerOutput()` to convert to `ScrapedBoard[]` (with empty listings arrays).

See `docs/scrapers.md` for full per-scraper documentation and property coverage tables.
