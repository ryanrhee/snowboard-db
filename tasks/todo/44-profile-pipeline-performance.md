# Task 44: Profile pipeline performance and cache slow operations

## Problem

A full pipeline run (all retailers + manufacturers from cache) takes longer than it should for iterative development. When working on normalization, spec resolution, or UI changes, re-running the pipeline to see results is a slow feedback loop. Many operations likely produce identical output run after run when only a small part of the code has changed.

## Goal

1. **Profile a full pipeline run** to identify where time is spent: HTML parsing, normalization, spec resolution, DB writes, network (even cached), image analysis, etc.
2. **Identify operations that are stable across runs** and can be cached or skipped during development.
3. **Add caching or short-circuiting** for the biggest wins so iterative development cycles are faster.

## Approach

### 1. Add timing instrumentation

Add a lightweight profiling wrapper that logs phase name + elapsed ms. The profiling must cover every phase below at the granularity shown. The goal is to identify which part of which step is the bottleneck without having to re-instrument.

#### Pipeline-level phases (in `src/lib/pipeline.ts` — `runSearchPipeline`)

| Timer label | What it measures | Location |
|---|---|---|
| `pipeline:total` | Entire `runSearchPipeline` wall clock | Wrap the whole function |
| `pipeline:scrape` | All scrapers via `Promise.allSettled` | Lines ~131–158 |
| `pipeline:review-enrich` | Review site enrichment | Lines ~184–196 |
| `pipeline:coalesce` | `coalesce()` call | Lines ~198–200 |
| `pipeline:resolve` | `resolveSpecSources()` | Lines ~202–205 |
| `pipeline:scoring` | Beginner score loop | Lines ~202–205 |
| `pipeline:discounts` | MSRP-based discount fill | Lines ~207–224 |
| `pipeline:db-write` | All DB writes (search run + upsert boards + insert listings + delete orphans) | Lines ~241–250 |
| `pipeline:prune-cache` | `pruneHttpCache()` | Line ~252 |

#### Per-scraper breakdown (inside each scraper's `scrape()` function)

Each scraper (tactics, evo, backcountry, rei, burton, lib-tech, capita, jones, gnu, yes, season) should log:

| Timer label | What it measures |
|---|---|
| `scraper:<name>:total` | Entire `scrape()` call |
| `scraper:<name>:listing-pages` | Fetching + parsing all listing/catalog pages |
| `scraper:<name>:detail-pages` | Fetching + parsing all detail pages |
| `scraper:<name>:adapt` | `adaptRetailerOutput` / `adaptManufacturerOutput` |

For listing and detail pages, also log **per-page** timings at debug level so we can see cache-hit vs real-fetch distribution:
- `scraper:<name>:fetch:<url-suffix>` — time for `fetchPage()` or `fetchPageWithBrowser()` call (includes delay if any)
- `scraper:<name>:parse:<url-suffix>` — time for `parseProductCards()` / `parseDetailHtml()` / equivalent

#### Coalesce sub-phases (in `src/lib/scrapers/coalesce.ts`)

| Timer label | What it measures |
|---|---|
| `coalesce:identify` | `identifyBoards()` — strategy lookup + model normalization |
| `coalesce:write-spec-sources` | All `writeSpecSources()` calls (DB writes to `spec_sources`) |
| `coalesce:build-entities` | Building Board + Listing objects from groups |

#### Spec resolution sub-phases (in `src/lib/spec-resolution.ts`)

| Timer label | What it measures |
|---|---|
| `resolve:db-read` | Reading all spec_sources rows from DB |
| `resolve:priority-sort` | Priority sorting + field selection |
| `resolve:apply` | Applying resolved values to board objects |

#### Review site enrichment (in `src/lib/scrapers/review-site-scraper.ts` and `src/lib/review-sites/the-good-ride.ts`)

| Timer label | What it measures |
|---|---|
| `review:total` | All review lookups |
| `review:per-board:<brand-model>` | Individual `tryReviewSiteLookup()` call (fetch + parse) |

#### DB write sub-phases (in `src/lib/db.ts`)

| Timer label | What it measures |
|---|---|
| `db:insert-search-run` | `insertSearchRun()` |
| `db:upsert-boards` | `upsertBoards()` |
| `db:insert-listings` | `insertListings()` |
| `db:delete-orphans` | `deleteOrphanBoards()` |

#### Output format

Print a summary table at the end of the run, sorted by duration descending, so the biggest bottlenecks are immediately visible:

```
=== Pipeline Profile ===
pipeline:total                    45200ms
pipeline:scrape                   38100ms
  scraper:evo:total               12300ms
    scraper:evo:detail-pages       9800ms  (32 pages, 28 cache hits, 4 fetched)
    scraper:evo:listing-pages      2100ms  (3 pages, 3 cache hits)
    scraper:evo:adapt                40ms
  scraper:backcountry:total        8900ms
    ...
pipeline:coalesce                  2100ms
  coalesce:write-spec-sources      1800ms
  coalesce:identify                 200ms
  coalesce:build-entities           100ms
pipeline:resolve                    800ms
...
```

### 2. Likely candidates for caching

**HTML parsing results**: If the cached HTML hasn't changed (same URL hash, same TTL window), the parsed output (boards, listings, specs) should be identical. Could cache parsed results keyed by HTML content hash, skipping the parse entirely on repeat runs.

**Normalization**: `normalizeModel()` is a pure function of (raw, brand). If called with the same inputs, it returns the same output. A simple in-memory map would avoid re-running 31 regex passes for every board on every run. May not be a bottleneck but worth measuring.

**Spec resolution**: `resolveSpecSources()` reads from `spec_sources` and applies priority. If spec_sources hasn't changed for a board, the resolution output is the same. Could skip boards whose spec_sources rows haven't been modified since last run.

**Manufacturer detail page parsing**: Parsing the same detail page HTML multiple times produces the same specs. Already partially cached via `spec_cache` but worth checking if it's being bypassed.

### 3. Development-mode shortcuts

Consider a `--fast` or `--only=<scraper>` mode that:
- Only runs a single scraper (e.g. `--only=burton`) instead of all 11
- Skips spec resolution if only testing scraper output
- Skips DB writes if only testing normalization

## Sleep / delay inventory

All sleep/delay calls in the codebase. Default `scrapeDelayMs` is **1000ms** (from `src/lib/config.ts:4`, env `SCRAPE_DELAY_MS`).

| File | Line | Call | Notes |
|------|------|------|-------|
| `src/lib/scraping/utils.ts` | 5-6 | `delay(ms)` — definition | `new Promise(resolve => setTimeout(resolve, ms))` |
| `src/lib/scraping/utils.ts` | 39 | `setTimeout(() => controller.abort(), timeoutMs)` | Fetch timeout (abort controller) |
| `src/lib/scraping/utils.ts` | 59,79 | `delay(backoff)` | Retry backoff in `fetchWithRetry` |
| `src/lib/scraping/browser.ts` | 97 | `delay(3000)` | Hard-coded 3s wait after browser page load |
| `src/lib/scraping/browser.ts` | 116 | `delay(backoff)` | Browser retry backoff |
| `src/lib/retailers/tactics.ts` | 302 | `delay(config.scrapeDelayMs)` | Between listing pages |
| `src/lib/retailers/tactics.ts` | 331 | `delay(config.scrapeDelayMs)` | Between detail pages |
| `src/lib/retailers/evo.ts` | 327 | `delay(config.scrapeDelayMs)` | Between listing pages |
| `src/lib/retailers/evo.ts` | 353 | `delay(config.scrapeDelayMs)` | Between detail pages |
| `src/lib/retailers/backcountry.ts` | 392 | `delay(config.scrapeDelayMs)` | Between listing pages |
| `src/lib/retailers/backcountry.ts` | 418 | `delay(config.scrapeDelayMs)` | Between detail pages |
| `src/lib/retailers/rei.ts` | 209 | `delay(config.scrapeDelayMs)` | Between pages |
| `src/lib/scrapers/review-site-scraper.ts` | 54 | `delay(config.scrapeDelayMs)` | Between review page fetches |

**Key observation:** When running from cache (no actual network requests), these delays are pure waste. A full run hitting ~140 cached pages at 1s each adds ~2+ minutes of idle sleep. Skipping delays on cache hits would be the single biggest quick win.

### Fix: move the politeness delay into `fetchPage`

Currently every scraper manually calls `await delay(config.scrapeDelayMs)` before `await fetchPage(url)`. The problem is that the delay fires unconditionally — even when the response comes from `http_cache` and no network request is made.

The delay should be **inside** `fetchPage` itself, applied only on real network fetches. This:
- Eliminates ~10 `delay()` call sites scattered across scrapers
- Automatically skips the delay on cache hits (zero code in scrapers)
- Keeps the politeness behavior correct for real fetches

**Implementation:**

1. **In `src/lib/scraping/utils.ts` — `fetchPage()`**: Add a `politeDelayMs` option (default `config.scrapeDelayMs`). Apply the delay **after** the cache check, **before** the actual `undiciFetch` call. Callers that want no delay (e.g. tests) can pass `politeDelayMs: 0`.

```ts
export async function fetchPage(
  url: string,
  options: {
    retries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    cacheTtlMs?: number;
    politeDelayMs?: number;  // NEW — default config.scrapeDelayMs
  } = {}
): Promise<string> {
  const {
    retries = 3,
    retryDelayMs = 2000,
    timeoutMs = 15000,
    cacheTtlMs,
    politeDelayMs = config.scrapeDelayMs,
  } = options;

  // Cache hit — return immediately, no delay
  const cached = getHttpCache(url, cacheTtlMs);
  if (cached) return cached;

  // Real fetch — be polite
  if (politeDelayMs > 0) await delay(politeDelayMs);

  // ... rest of fetch logic unchanged ...
}
```

2. **In each scraper** (tactics, evo, backcountry, rei, review-site-scraper): Delete all `await delay(config.scrapeDelayMs)` lines. The scrapers just call `fetchPage(url)` and the delay happens automatically only when needed.

3. **Retry backoff delays** (`utils.ts:59,79`) and **browser delays** (`browser.ts:97,116`) are unrelated — leave them as-is. They only fire on actual errors/retries.

## Considerations

- Don't optimize before measuring — profile first, then target the biggest time sinks.
- Caching adds complexity; only add it where the time savings justify it.
- `--only=<scraper>` may already be achievable via the debug route's site filter params (`retailers: ["evo"]`, `manufacturers: ["burton"]`).
- This is related to Task 40 (normalization rearchitect) — a faster normalization pipeline would help, but only if normalization is actually a bottleneck.
