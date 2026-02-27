# Task 45: Remove beginner score, use extracted ability level instead

**Completed: 2026-02-27**

## Summary

Removed the synthetic `beginnerScore` computation and `beginner_score` DB column. `finalScore` now equals `valueScore` directly. Ability level from spec_sources (`abilityLevelMin`/`abilityLevelMax`) is the primary indicator of who a board is for.

### Changes made
- Deleted `src/lib/scoring.ts` and `src/components/ScoreExplanation.tsx`
- Removed `beginnerScore` from `Board` type in `types.ts`
- Removed scoring import and 3 scoring loops from `pipeline.ts`
- Removed scoring import and `beginnerScore: 0` default from `coalesce.ts`
- Updated `db.ts`: dropped `beginner_score` from schema, upsert SQL, row mappings; simplified `finalScore = valueScore`; added migration to drop column from existing DBs
- Updated `SearchResults.tsx`: removed Beginner and Score columns, kept Value column
- Updated `BoardDetail.tsx`: removed Bgn and Tot score bars, kept Val
- Updated `coalesce.test.ts`: removed `scoring` mock

## Problem

The pipeline computes a `beginnerScore` for each board via `calcBeginnerScoreForBoard()` in `src/lib/scoring.ts`. This is a synthetic score derived from specs (flex, profile, shape, category) using hardcoded heuristics — e.g. softer flex = more beginner-friendly, twin shape = more beginner-friendly, park category = bonus.

This is redundant now that we extract actual ability level data from multiple sources:
- Manufacturer scrapers (Burton, CAPiTA, Jones, Lib Tech, GNU) extract ability level directly
- Review sites (The Good Ride) provide rider level ratings
- Retailer detail pages (evo, REI) have structured ability level specs
- The `spec_sources` table stores ability level with multi-source resolution

The extracted ability level is more accurate than a synthetic score — it reflects what the manufacturer and reviewers actually say about who the board is for, rather than guessing from proxy specs.

## Goal

1. Remove `calcBeginnerScoreForBoard()` and the `beginner_score` column from the `boards` table.
2. Use the resolved `abilityLevelMin` / `abilityLevelMax` from spec_sources as the primary way to indicate who a board is for.
3. Update UI to display/filter by ability level range instead of beginner score.

## Approach

1. **Remove scoring code**: Delete `calcBeginnerScoreForBoard()` from `scoring.ts` and its call in the pipeline.
2. **Remove DB column**: Drop `beginner_score` from the `boards` table schema and `Board` type.
3. **Update UI**: Replace beginner score display/sorting with ability level range (beginner, intermediate, advanced, expert). The ability level range is already available on boards via spec resolution.
4. **Update filtering**: If the UI has beginner score filters/sorting, replace with ability level filters (e.g. "show boards suitable for beginners" = abilityLevelMin <= beginner).
5. **Clean up**: Remove any dead code that only existed to feed the beginner score calculation.

## Considerations

- Some boards may not have ability level data from any source. For these, the UI should show "unknown" rather than computing a synthetic guess.
- This simplifies the pipeline by removing a computation step and a DB column.
- Relates to Task 24 (collapse specs into spec_sources) — ability level is already in spec_sources; removing the beginner score column is one less top-level field to maintain.
