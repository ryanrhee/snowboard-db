# Task 23: Document the architecture from Tasks 18 and 22

## Problem

Tasks 18 and 22 made sweeping architectural changes. Task 18 simplified the pipeline, introduced per-site scrape triggering, cleaned up the debug route, and deleted all unused LLM code. Task 22 split the database into two files — separating long-lived HTTP/HTML caches from re-derivable pipeline output. The rationale and resulting architecture are only captured in task completion notes and `CLAUDE.md`, not in standalone documentation.

## Goal

Add architecture documentation in a standalone file (e.g. `docs/architecture.md` or `ARCHITECTURE.md` — NOT in `CLAUDE.md`, which auto-loads into context) covering what was built in tasks 18 and 22, so future sessions understand the current system without reading old diffs.

## Scope

Document the following in a standalone architecture doc (not `CLAUDE.md`):

1. **Pipeline architecture**: How `runSearchPipeline()` works. Sources (retailers, manufacturers, review sites) all produce boards. `ScrapeScope` controls what runs.
2. **Scraper registry and filtering**: How `getScrapers()` / `getRetailers()` / `getManufacturers()` work. How to trigger a scrape of a specific site or set of sites (e.g. `retailers: ["evo"]`, `manufacturers: ["burton"]`).
3. **Debug route actions**: The 5 operational actions (`run`, `run-full`, `run-manufacturers`, `slow-scrape`, `scrape-status`), what each does, and how to pass site filters.
4. **What was deleted**: LLM enrichment, LLM judgment, Anthropic client integration, value scoring, board normalization — and why (unused/disabled code).
5. **Two-phase scraping**: Phase 1 (automated, from cache) vs Phase 2 (CDP-assisted detail page fetching). When and why each is used.
6. **Database split (Task 22)**: Two SQLite files — `data/snowboard-finder.db` (pipeline output + spec data, cheap to re-derive) and `data/http-cache.db` (HTTP cache + review caches, expensive to rebuild). `getCacheDb()` singleton, `CACHE_DB_PATH` env var, automatic one-time migration from single-DB layout. Why the split was made (independent lifecycles, simpler re-runs, separate backup/sharing).

## Also document if missed

The original instructions for task 18 included:

> "boards should be produced from any source — mfgr, retailer, review site"

Verify and document whether review sites currently produce boards as a source (not just specs), or if that part was not implemented. If not implemented, note it as a gap.

## Completed: 2026-02-25

Created `docs/architecture.md` covering all 6 scope items:

1. Pipeline architecture — phases, ScrapeScope, how each source type produces boards
2. Scraper registry — unified `getScrapers()`, retailer/manufacturer filtering, active status
3. Debug route actions — all 5 actions with aliases, parameters, and usage examples
4. What was deleted — LLM enrichment, value scoring, board normalization, complex debug actions
5. Two-phase scraping — plain HTTP vs CDP-assisted browser, per-retailer choice, shared cache
6. Database split — two SQLite files, table inventory, migration logic, rationale

Also documented the review-site gap: The Good Ride provides spec enrichment only and does not produce boards as a source, contrary to the original Task 18 intent.
