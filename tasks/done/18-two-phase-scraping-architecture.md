# Task 18: Two-phase scraping architecture (regular + CDP)

**Completed:** 2026-02-24

## What was done

Simplified the overall pipeline architecture and implemented the two-phase scraping design as part of a broader cleanup:

### Pipeline simplification
- Removed `skipManufacturers`, `skipEnrichment`, `skipJudgment` flags from `ScrapeScope`
- Simplified `getScrapers()` filtering: empty array = skip source type, undefined/null = include all
- Default scope now includes all retailers + all manufacturers (previously manufacturers were skipped by default)
- `DEFAULT_SCOPE` reduced to just `{ regions: [Region.US, Region.KR] }`

### Two-phase scraping
- **Phase 1** (automated): `./debug.sh '{"action":"metadata-check"}'` or `'{"action":"run"}'` — runs all retailers from cache, no manufacturers by default
- **Phase 1 + manufacturers**: `./debug.sh '{"action":"full-pipeline"}'` or `'{"action":"run-full"}'` — runs everything
- **Phase 2** (CDP-assisted): `./debug.sh '{"action":"slow-scrape"}'` — unchanged, fetches uncached detail pages via CDP
- **New**: `./debug.sh '{"action":"scrape-status"}'` — shows cached vs uncached detail pages per retailer

### Debug route cleanup
- Gutted from 1826 lines to 237 lines
- Removed ~30 one-off diagnostic actions (ability level research, retailer HTML analysis, key mismatch debugging, LLM audit, etc.)
- Kept only operational endpoints: run, run-full, run-manufacturers, slow-scrape, scrape-status

### Deleted unused LLM code
- Deleted `src/lib/llm/enrich.ts` and `src/lib/llm/evaluate.ts` (LLM enrichment was disabled, evaluation never used)
- Removed LLM judgment from spec-resolution (Anthropic client, `judgeDisagreement`, `REPORT_JUDGMENT_TOOL`)
- Removed `CanonicalBoard` interface (only used by deleted LLM code)
- Removed `calcValueScore`/`scoreBoard` from scoring.ts, `normalizeBoard` from normalization.ts
- Removed `setCachedSpecsWithPriority`/`setCachedSpecsIfNotManufacturer`/`populateFromLegacy` from db.ts
- Removed `anthropicApiKey`/`enableSpecEnrichment` from config

### Net result
- 15 files changed, 59 insertions, 2,623 deletions
- All 657 tests pass
- Zero TypeScript errors
