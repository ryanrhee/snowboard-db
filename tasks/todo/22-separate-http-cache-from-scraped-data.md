# Task 16: Separate HTTP/HTML cache from scraped data

## Problem

The `http_cache` table lives in the same SQLite database (`data/snowboard-finder.db`) as pipeline output tables (`boards`, `listings`, `search_runs`) and spec data (`spec_sources`, `spec_cache`). This coupling makes it awkward to reset and re-run scraping or pipeline stages independently:

- Clearing pipeline output to re-derive requires surgical `DELETE` statements that carefully avoid the cache tables.
- Backing up or moving the cache independently isn't possible without exporting individual tables.
- The cache can grow large (~50MB+ for ~140 pages) and has different lifecycle concerns (long-lived, expensive to rebuild) compared to pipeline output (cheap to re-derive).
- If the DB file gets corrupted or accidentally deleted, both cached HTML and derived data are lost together.

## Goal

Move `http_cache` (and potentially `review_sitemap_cache` and `review_url_map`) into a separate SQLite file (e.g. `data/http-cache.db`) so that:

1. Pipeline output can be wiped or rebuilt without touching cached HTML.
2. The cache file can be preserved, backed up, or shared independently.
3. Re-scraping from cached HTML is a simple "delete the main DB and re-run" operation.
4. Each file has a clear lifecycle: cache = long-lived network artifact, main DB = derived data.

## Implementation steps

1. Create a separate SQLite file for HTTP/HTML caching (e.g. `data/http-cache.db`, configurable via env var like `CACHE_DB_PATH`).
2. Move `http_cache`, `review_sitemap_cache`, and `review_url_map` table schemas into the new DB.
3. Update the DB initialization code to open/manage both database connections.
4. Update all cache read/write call sites to use the cache DB connection instead of the main DB.
5. Update `CLAUDE.md` documentation (table reference, re-run workflow, env vars) to reflect the split.
6. Add a one-time migration: if the old single-DB layout is detected (cache tables exist in main DB), copy them to the new file and drop from main.

## Considerations

- SQLite doesn't support cross-database foreign keys, but there are no FKs between cache tables and pipeline tables today, so this is a clean split.
- The two DB files should use independent connection instances to avoid locking contention.
- Keep the migration path simple — detect, copy, drop — and log clearly so it's obvious what happened.
