# Task 8: Document how to re-run pipeline from cached HTML

**Completed:** 2026-02-23

## How to re-run the pipeline without network requests

### Background

The HTTP cache (`http_cache` table in `data/snowboard-finder.db`) stores raw HTML from retailer pages with a 24-hour TTL. When the pipeline scrapes a URL, it checks this cache first and only makes a network request on a cache miss or expiry.

### Quick method: `metadata-check` debug action

The simplest way to re-run the full pipeline from cached HTML:

```bash
./debug.sh '{"action":"metadata-check"}'
```

This calls `runSearchPipeline({ skipEnrichment: true })`, which scrapes all retailers (hitting cache for pages fetched within 24h), normalizes, resolves specs, and stores everything in the DB.

### Manual reset + re-run

To clear pipeline output while keeping cached HTML and spec data:

```bash
# Clear only pipeline output (runs, boards, listings)
sqlite3 data/snowboard-finder.db "
  DELETE FROM listings;
  DELETE FROM boards;
  DELETE FROM search_runs;
"

# Re-run pipeline (hits HTTP cache, no network)
./debug.sh '{"action":"metadata-check"}'
```

To also reset spec data for a full re-derivation:

```bash
sqlite3 data/snowboard-finder.db "
  DELETE FROM listings;
  DELETE FROM boards;
  DELETE FROM search_runs;
  DELETE FROM spec_sources;
  DELETE FROM spec_cache;
"
```

### Extending cache TTL

If cached pages are older than 24 hours, the cache will miss and trigger network requests. To force use of expired cache entries, temporarily bump their TTL:

```bash
# Set all cache entries to 7-day TTL
sqlite3 data/snowboard-finder.db "
  UPDATE http_cache SET ttl_ms = 7 * 24 * 60 * 60 * 1000;
"
```

### What NOT to clear

| Table | Purpose | Safe to clear? |
|-------|---------|---------------|
| `http_cache` | Raw HTML from retailer/mfr pages | No — this is what avoids network requests |
| `review_sitemap_cache` | The Good Ride sitemap cache | No — avoids re-fetching sitemaps |
| `review_url_map` | Board → review site URL mappings | No — avoids re-resolving URLs |
| `spec_sources` | Accumulated specs from all sources | Only if you want to re-derive from scratch |
| `spec_cache` | Enrichment result cache (keyed by input hash) | Only if you want to re-enrich |
| `search_runs` | Pipeline run metadata | Yes |
| `boards` | Board entities | Yes (re-derived from raw data) |
| `listings` | Listing entities | Yes (re-derived from raw data) |
| `boards_legacy` | Old schema boards | Yes (deprecated) |

### Using `/api/search` instead

```bash
curl -X POST http://localhost:3099/api/search \
  -H 'Content-Type: application/json' \
  -d '{"force": true}'
```

Note: this also uses the 1-hour result cache — pass `"force": true` to bypass it. The pipeline will still use the HTTP cache for individual page fetches.
