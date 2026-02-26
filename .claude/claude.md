# Workflow Rules

- **Test-first fixes:** When the user points out a bug or data problem, always write a failing test _before_ implementing the fix.

# Development Environment

## Sandbox Constraints

The Claude process is sandboxed. Browsers (Chromium, Chrome, Firefox, etc.) cannot run in this sandbox. Do not run Playwright, Puppeteer, or anything that launches a browser. Running `node`, `npx`, and `npm run` directly is fine for tasks that don't depend on a browser (e.g. `npm run test` for unit tests).

## Inline Scripts

When you need to run Node.js analysis or one-off scripts, **always write a `.mjs` file first** and run it with `npx tsx <file>.mjs`. Do not try to pass JavaScript via `node -e '...'` — shell escaping issues (especially with `$`, `!`, template literals, and cheerio's `$`) will waste multiple attempts.

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

Two SQLite files:

- **`data/snowboard-finder.db`** (`DB_PATH` env var) — Pipeline output and spec data. Safe to delete and re-derive.
- **`data/http-cache.db`** (`CACHE_DB_PATH` env var) — Long-lived caches (~50MB). Expensive to rebuild.

On first run after the split, cache tables are automatically migrated from the main DB to the cache DB.

### Schema

#### Main DB (`data/snowboard-finder.db`)

**Pipeline output** (re-derived each run, safe to clear):

- **`search_runs`** — One row per pipeline run. Stores run ID, timestamp, scope JSON, board count, retailers queried, duration.
- **`boards`** — One row per unique board (keyed by `brand|model`). Stores specs (flex, profile, shape, category, ability level), beginner score, gender, MSRP. Upserted each run.
- **`listings`** — One row per retailer×board×size. Links to `boards` (board_key FK) and `search_runs` (run_id FK). Stores price, length, width, availability, condition, gender, stock count.
- **`boards_legacy`** — Old flat schema (one row = one board+listing). Deprecated, not used by current code.

**Spec data** (accumulated across runs, expensive to rebuild):

- **`spec_sources`** — Multi-source spec provenance. Keyed by `(brand_model, field, source)`. Sources: `manufacturer`, `review-site`, `retailer:*`, `llm`, `judgment`. Fields: flex, profile, shape, category, abilityLevel, plus extras.
- **`spec_cache`** — Enrichment result cache keyed by input hash (hash of scraper output). Stores resolved flex/profile/shape/category/msrp with source attribution.

#### Cache DB (`data/http-cache.db`)

- **`http_cache`** — Raw HTML bodies keyed by URL hash. 24-hour default TTL. ~50MB for ~140 pages.
- **`review_sitemap_cache`** — The Good Ride sitemap entries (URL → brand/model mapping). ~625 entries.
- **`review_url_map`** — Resolved board → The Good Ride review URL mappings. ~148 entries.

## Re-running the Pipeline

All scraping goes through a single `run` action (the default). Use `sites`, `retailers`, or `manufacturers` to filter. Use `from` to skip early pipeline steps.

### Quick reference

```bash
# All scrapers (default)
./debug.sh '{"action":"run"}'

# Specific scrapers by name
./debug.sh '{"action":"run","sites":["retailer:tactics","manufacturer:burton"]}'

# All retailers, no manufacturers
./debug.sh '{"action":"run","manufacturers":[]}'

# No retailers, all manufacturers
./debug.sh '{"action":"run","retailers":[]}'

# Specific retailers + specific manufacturers
./debug.sh '{"action":"run","retailers":["tactics"],"manufacturers":["burton"]}'

# Re-run review site enrichment + resolve (skip retailer/mfr scraping)
./debug.sh '{"action":"run","from":"review-sites"}'

# Re-resolve specs from existing spec_sources (skip all scraping)
./debug.sh '{"action":"run","from":"resolve"}'
```

### Reset pipeline output + re-run

```bash
# Clear pipeline output (main DB only — cache DB is untouched)
sqlite3 data/snowboard-finder.db "
  DELETE FROM listings;
  DELETE FROM boards;
  DELETE FROM search_runs;
"

./debug.sh '{"action":"run"}'
```

### Extend cache TTL (if entries are >24h old)

```bash
sqlite3 data/http-cache.db "
  UPDATE http_cache SET ttl_ms = 7 * 24 * 60 * 60 * 1000;
"
```

### Table reference

| Table | DB file | Safe to clear? | Notes |
|-------|---------|---------------|-------|
| `http_cache` | `http-cache.db` | **No** | Raw HTML — keeps you off the network |
| `review_sitemap_cache` | `http-cache.db` | **No** | The Good Ride sitemap cache |
| `review_url_map` | `http-cache.db` | **No** | Board → review URL mappings |
| `spec_sources` | `snowboard-finder.db` | Only to re-derive | Accumulated specs from mfr/retailer/review/llm |
| `spec_cache` | `snowboard-finder.db` | Only to re-enrich | Enrichment results keyed by input hash |
| `search_runs` | `snowboard-finder.db` | Yes | Pipeline run metadata |
| `boards` | `snowboard-finder.db` | Yes | Re-derived from raw data each run |
| `listings` | `snowboard-finder.db` | Yes | Re-derived from raw data each run |
| `boards_legacy` | `snowboard-finder.db` | Yes | Deprecated old schema |

## Task Tracking

Each task is its own markdown file:

- **Open tasks**: `tasks/todo/` — one `.md` file per task.
- **Completed tasks**: `tasks/done/` — move the file from `todo/` to `done/` when finished, adding a completion date and summary of what was done.
- **Creating tasks**: Run `tasks/new.sh "slug" "Title"` to create a file with the next available number. Never pick a number manually.
