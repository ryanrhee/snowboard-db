# Task 44: Profile pipeline performance and cache slow operations

## Problem

A full pipeline run (all retailers + manufacturers from cache) takes longer than it should for iterative development. When working on normalization, spec resolution, or UI changes, re-running the pipeline to see results is a slow feedback loop. Many operations likely produce identical output run after run when only a small part of the code has changed.

## Goal

1. **Profile a full pipeline run** to identify where time is spent: HTML parsing, normalization, spec resolution, DB writes, network (even cached), image analysis, etc.
2. **Identify operations that are stable across runs** and can be cached or skipped during development.
3. **Add caching or short-circuiting** for the biggest wins so iterative development cycles are faster.

## Approach

### 1. Add timing instrumentation

Add `console.time` / `console.timeEnd` (or a lightweight profiling wrapper) to each pipeline phase:
- Per-scraper fetch + parse time (broken down by: cache lookup, HTML parsing, normalization)
- Coalesce phase (board grouping, deduplication)
- Spec resolution (`resolveSpecSources`)
- Beginner scoring (`calcBeginnerScoreForBoard`)
- DB writes (`upsertBoards`, `insertListings`, spec_sources writes)
- Infographic analysis (if running manufacturers)
- Total wall clock time

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

## Considerations

- Don't optimize before measuring — profile first, then target the biggest time sinks.
- Caching adds complexity; only add it where the time savings justify it.
- `--only=<scraper>` may already be achievable via the debug route's site filter params (`retailers: ["evo"]`, `manufacturers: ["burton"]`).
- This is related to Task 40 (normalization rearchitect) — a faster normalization pipeline would help, but only if normalization is actually a bottleneck.
