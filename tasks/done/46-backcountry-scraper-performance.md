# Task 46: Fix backcountry scraper performance (130s → ~10s target)

**Completed:** 2026-02-27

## What was done

Replaced `cheerio.load()` with regex-based JSON extraction in `src/lib/retailers/backcountry.ts`. Added two helpers (`extractNextData`, `extractJsonLd`) that extract `__NEXT_DATA__` and JSON-LD blobs via regex + `JSON.parse()`, avoiding full DOM construction.

### Functions modified
- **`extractTotalPages()`** — now uses `extractNextData()` instead of cheerio
- **`parseProductsFromHtml()`** — tiers 1-3 (Apollo, older NEXT_DATA, JSON-LD) use regex helpers; cheerio only loaded for tier 4 HTML card fallback (rare)
- **`parseDetailHtml()`** — JSON-LD and `__NEXT_DATA__` extraction via regex helpers; cheerio only loaded when no specs found from JSON (HTML spec fallback)

### Profiling results (289 cached pages, 236 MB HTML)
- Regex extraction: **0.22s** (0.8ms/page)
- cheerio.load(): **6.18s** (21.4ms/page)
- **Speedup: 27.8x** for the JSON extraction portion

All 1014 tests pass.

## Problem

Pipeline profiling (task 44) reveals backcountry takes **130s** — more than all other scrapers combined — despite producing a similar number of boards to evo (256 vs 197 boards). Evo finishes in 12s, tactics in 10s.

```
scraper:retailer:backcountry:total          129883ms  boards=256
scraper:retailer:evo:total                   11685ms  boards=197
scraper:retailer:tactics:total               10007ms  boards=157
scraper:retailer:rei:total                    4162ms  boards=57
```

Backcountry alone accounts for ~90% of the scraping phase and ~90% of total pipeline time (130s / 145s).

## Full profile for context

```
pipeline:total                                145179ms
pipeline:scrape                               129887ms
pipeline:review-enrich                         14550ms  targets=508
pipeline:coalesce                                595ms
pipeline:db-write                                 27ms
pipeline:resolve                                  19ms
```

**Important:** This profile was run with warm caches. All HTML was served from `http_cache` in SQLite — no real network requests or browser launches occurred.

## Root cause analysis

### The 3s browser wait is NOT the cause

`fetchPageWithBrowser` (`browser.ts:76-78`) checks the SQLite cache and returns immediately on a hit, **before** the polite delay, browser launch, and 3s JS rendering wait. None of that code executes on cache hits. So the browser path is irrelevant here — the bottleneck is entirely in what happens _after_ the cached HTML is returned.

### What's actually slow

With all cache hits, 130s for ~260 pages (listing + detail) means **~500ms per page** spent on:

1. **Cache reads** — Reading large HTML blobs from SQLite (`getHttpCache`). Backcountry pages may be significantly larger than other retailers' pages. Deserializing a multi-MB HTML string from SQLite on every call adds up.

2. **Cheerio parsing** — `cheerio.load(html)` on large HTML documents is expensive. Backcountry's `parseDetailHtml` and `parseProductsFromHtml` each call `cheerio.load()`, so every detail page parse allocates a full DOM.

3. **Sequential processing** — Even though cache reads are fast individually, 256 sequential iterations of (cache read + cheerio parse + extract data) with no concurrency means the costs add linearly.

### Why evo is 10x faster with the same pattern

Both evo and backcountry use `fetchPageWithBrowser` + sequential detail pages. Possible explanations for evo's 12s vs backcountry's 130s:
- **Fewer detail pages** — evo may have fewer products or extract more data from listing pages, requiring fewer detail fetches
- **Smaller HTML** — evo pages may be smaller, making both cache reads and cheerio parsing faster
- **Simpler parsing** — evo's `parseDetailHtml` may do less work per page
- Needs measurement to confirm

## Investigation steps

1. **Measure cache read time vs parse time per page** — Add timing around the `getHttpCache()` call and the `parseDetailHtml()` / `parseProductsFromHtml()` calls separately. This determines whether the bottleneck is SQLite I/O or cheerio CPU.

2. **Measure HTML page sizes** — Query `http_cache` for backcountry URLs and compare body sizes to evo/tactics. If backcountry pages are 5-10x larger, that explains the difference directly.
   ```sql
   SELECT
     CASE
       WHEN url LIKE '%backcountry.com%' THEN 'backcountry'
       WHEN url LIKE '%evo.com%' THEN 'evo'
       WHEN url LIKE '%tactics.com%' THEN 'tactics'
     END AS retailer,
     COUNT(*) AS pages,
     ROUND(AVG(LENGTH(body)) / 1024) AS avg_kb,
     ROUND(MAX(LENGTH(body)) / 1024) AS max_kb
   FROM http_cache
   WHERE url LIKE '%backcountry.com%'
      OR url LIKE '%evo.com%'
      OR url LIKE '%tactics.com%'
   GROUP BY 1;
   ```

3. **Count detail pages per scraper** — Log how many detail page fetches each scraper makes. If backcountry fetches 256 detail pages while evo fetches 50, that alone is a 5x multiplier.

4. **Profile a single backcountry detail page** — Time just the `cheerio.load()` call vs the data extraction to see where within parsing the time goes.

## Potential fixes (by expected impact)

### A. Reduce number of detail page fetches
- If listing pages already contain enough data (price, brand, model, sizes), skip detail page fetches for boards that don't need specs
- Many retailers embed JSON-LD or `__NEXT_DATA__` in listing pages with full product data

### B. Cache parsed results (not just HTML)
- Cache the output of `parseDetailHtml()` keyed by HTML content hash
- On repeat runs with same cached HTML, skip cheerio parsing entirely
- Expected savings: eliminates ~500ms × 256 = ~128s of parse time

### C. Add concurrency for detail page processing
- Even with cache hits, `Promise.all` with concurrency limit could parallelize cheerio parsing across CPU cores (though Node is single-threaded, it may still help with async I/O interleaving)
- More useful if cache reads are the bottleneck (SQLite I/O)

### D. Reduce HTML size before caching
- Strip unnecessary parts of the HTML before storing in `http_cache` (scripts, CSS, ads)
- Reduces both storage (~50MB cache) and read/deserialize time
- Risk: may strip data needed by parsers

### E. Switch to lighter parsing
- If backcountry pages contain `__NEXT_DATA__` JSON, parse that directly instead of loading the full DOM with cheerio
- Backcountry already parses `__NEXT_DATA__` for listing pages (`backcountry.ts:20`), so detail pages likely have it too
- JSON.parse of a `__NEXT_DATA__` blob is orders of magnitude faster than `cheerio.load()` on the full HTML
