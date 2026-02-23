# Development Environment

## Sandbox Constraints

The Claude process is sandboxed. Browsers (Chromium, Chrome, Firefox, etc.) cannot run in this sandbox. Do not run Playwright, Puppeteer, or anything that launches a browser. Running `node`, `npx`, and `npm run` directly is fine for tasks that don't depend on a browser (e.g. `npm run test` for unit tests).

## Dev Server

A separate terminal window runs the dev server in a restart loop:

```
while true; do npx next dev -p 3099 2>&1 | tee output.txt; echo "--- restarted ---"; sleep 1; done
```

### How to use it

1. **Code changes + restart**: Use `./debug.sh '{"action":"..."}'` to kill the server (triggering restart with code changes), wait, then curl the debug endpoint. Edit `src/app/api/debug/route.ts` to add new debug actions as needed.
2. **Server logs**: Read `output.txt` for all server output.
3. **Triggering non-debug endpoints**: Add a new action to debug route that calls the desired code path internally, then use `./debug.sh`. Do NOT use `kill` or `curl` directly — `debug.sh` handles the kill+wait+curl cycle and avoids per-command user approval.
4. **Never launch a browser directly** — scraping that requires a browser must go through the dev server via `./debug.sh`. Non-browser commands (`npm run test`, `node` scripts, etc.) can be run directly.

## Database

Single SQLite file at `data/snowboard-finder.db` (configurable via `DB_PATH` env var). The `snowboards.db` in the project root is a stale empty file — ignore it.

### Schema

**Pipeline output** (re-derived each run, safe to clear):

- **`search_runs`** — One row per pipeline run. Stores run ID, timestamp, scope JSON, board count, retailers queried, duration.
- **`boards`** — One row per unique board (keyed by `brand|model`). Stores specs (flex, profile, shape, category, ability level), beginner score, gender, MSRP. Upserted each run.
- **`listings`** — One row per retailer×board×size. Links to `boards` (board_key FK) and `search_runs` (run_id FK). Stores price, length, width, availability, condition, gender, stock count.
- **`boards_legacy`** — Old flat schema (one row = one board+listing). Deprecated, not used by current code.

**Spec data** (accumulated across runs, expensive to rebuild):

- **`spec_sources`** — Multi-source spec provenance. Keyed by `(brand_model, field, source)`. Sources: `manufacturer`, `review-site`, `retailer:*`, `llm`, `judgment`. Fields: flex, profile, shape, category, abilityLevel, plus extras.
- **`spec_cache`** — Enrichment result cache keyed by input hash (hash of scraper output). Stores resolved flex/profile/shape/category/msrp with source attribution.

**Caches** (avoid network requests, expensive to rebuild):

- **`http_cache`** — Raw HTML bodies keyed by URL hash. 24-hour default TTL. ~50MB for ~140 pages.
- **`review_sitemap_cache`** — The Good Ride sitemap entries (URL → brand/model mapping). ~625 entries.
- **`review_url_map`** — Resolved board → The Good Ride review URL mappings. ~148 entries.

## Re-running the Pipeline from Cached HTML

The HTTP cache (`http_cache` table in `data/snowboard-finder.db`) stores raw HTML from retailer pages with a 24-hour TTL. The pipeline checks this cache first and only makes network requests on a miss or expiry.

### Quick re-run (no enrichment)

```bash
./debug.sh '{"action":"metadata-check"}'
```

Runs `runSearchPipeline({ skipEnrichment: true })` — scrapes all retailers (hitting cache), normalizes, resolves specs from existing `spec_sources`, stores in DB. Fast.

### Full re-run (with enrichment)

```bash
./debug.sh '{"action":"full-pipeline"}'
```

Runs `runSearchPipeline({ skipEnrichment: false })` — same as above but also hits The Good Ride for review-site spec lookups on boards missing specs. LLM enrichment is currently disabled in code (`enrich.ts:102`). Slower due to review-site network requests.

### Reset pipeline output + re-run

```bash
# Clear pipeline output, keep cached HTML and spec data
sqlite3 data/snowboard-finder.db "
  DELETE FROM listings;
  DELETE FROM boards;
  DELETE FROM search_runs;
"

./debug.sh '{"action":"metadata-check"}'
```

### Extend cache TTL (if entries are >24h old)

```bash
sqlite3 data/snowboard-finder.db "
  UPDATE http_cache SET ttl_ms = 7 * 24 * 60 * 60 * 1000;
"
```

### Table reference

| Table | Safe to clear? | Notes |
|-------|---------------|-------|
| `http_cache` | **No** | Raw HTML — keeps you off the network |
| `review_sitemap_cache` | **No** | The Good Ride sitemap cache |
| `review_url_map` | **No** | Board → review URL mappings |
| `spec_sources` | Only to re-derive | Accumulated specs from mfr/retailer/review/llm |
| `spec_cache` | Only to re-enrich | Enrichment results keyed by input hash |
| `search_runs` | Yes | Pipeline run metadata |
| `boards` | Yes | Re-derived from raw data each run |
| `listings` | Yes | Re-derived from raw data each run |
| `boards_legacy` | Yes | Deprecated old schema |

## Task Tracking

Each task is its own markdown file:

- **Open tasks**: `tasks/todo/` — one `.md` file per task.
- **Completed tasks**: `tasks/done/` — move the file from `todo/` to `done/` when finished, adding a completion date and summary of what was done.
