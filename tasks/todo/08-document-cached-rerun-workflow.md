# Task 8: Document how to re-run pipeline from cached HTML

## Goal

Document a workflow for re-running all scraping, normalization, and storage logic without making any network requests — by clearing pipeline output data while preserving the HTTP cache.

## Details

- Explain which tables/data to clear (search_runs, boards, listings, spec_sources, etc.) vs which to keep (http_cache)
- Provide a concrete command or script to reset pipeline output while keeping cached HTML
- Document how to trigger a full pipeline run that hits the cache instead of the network
- Explain how the HTTP cache TTL works and how to ensure cached pages are still valid
- Cover the debug endpoint approach (`metadata-check` action) and any alternatives
