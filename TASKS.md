# TASKS

## 6. Separate data ingestion from personal search constraints

**Status:** open
**Priority:** high — architectural prerequisite for all other work

### Problem

The pipeline currently merges data scraping with personal search filtering (`DEFAULT_CONSTRAINTS`: 155-161cm, max $650, excludeWomens, excludeKids). This means:

1. **Data loss** — boards outside personal constraints are never stored. Closeout/blem items that happen to be wrong size or price are discarded before they even reach the DB.
2. **Single-user lock-in** — the stored data can't serve other queries (e.g. finding a women's board for someone else).
3. **Wrong layer** — filtering belongs in the query/UI layer, not the ingestion layer.

### Solution

Restructure into two phases:

1. **Ingestion phase** — scrape ALL boards from retailers and manufacturers. Store everything: all sizes, all genders, all price points. No personal constraints applied. This includes:
   - Manufacturer specs (Burton, Lib Tech, CAPiTA, etc.)
   - Review site data (The Good Ride, etc.)
   - Retailer listings (Tactics, evo, REI, Backcountry) with condition, gender, stock

2. **Query phase** — apply user-specific filters at query time through the API/UI layer. `DEFAULT_CONSTRAINTS` moves from pipeline ingestion to the frontend/API query parameters.

### Implementation notes

- `runSearchPipeline()` should scrape and store without applying `applyConstraints`
- `applyConstraints` / `filterBoardsWithListings` move to the API response layer
- Frontend filters (length, price, gender, condition) become UI controls
- DB becomes the comprehensive snowboard catalog; queries are views into it
