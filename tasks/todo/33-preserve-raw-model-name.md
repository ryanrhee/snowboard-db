# Task 33: Preserve raw model name through scraper pipeline

## Problem

Scrapers normalize model names early (stripping profile suffixes, gender prefixes, year suffixes, etc. via `normalizeModel()`). The original model name is lost. Task 32 (profile variant collision detection) needs the raw name at coalesce time to recover stripped suffixes like "Camber" or "Flying V" when a collision is detected.

## Goal

Add a `rawModel` field alongside the normalized `model` in scraper output, so the pre-normalization name is available downstream.

## Approach

1. Add `rawModel: string` to `RawBoard` / `ScrapedBoard` / `ManufacturerSpec` types (whichever carries model data through the pipeline).
2. Set `rawModel` to the original model string before normalization in each scraper.
3. Pass `rawModel` through to the coalesce phase so it's available for collision detection (Task 32).
4. No changes to board keys or normalization logic — just preserving the original alongside the normalized value.

## Considerations

- This is a prerequisite for Task 32.
- The raw name should be the scraper's extracted name after brand stripping but before profile/suffix normalization — e.g. "Custom Camber" not "Burton Custom Camber Snowboard".
- `rawModel` does not need to be stored in the database — it's only needed during the coalesce phase within a single pipeline run.
