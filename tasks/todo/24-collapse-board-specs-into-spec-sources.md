# Task 24: Collapse top-level board spec columns into spec_sources

## Problem

Board specs (flex, profile, shape, category, ability_level_min, ability_level_max) are stored in two places:

1. **`spec_sources`** — multi-row provenance table with one row per (board, field, source). Append-only audit trail.
2. **`boards` table columns** — resolved single values written at pipeline time after applying source priority (manufacturer > review-site > retailer).

This duplication means:
- Two representations must stay in sync (mitigated by upsert-on-each-run, but still a source of bugs — see Task 21's key mismatch).
- The resolution step (`resolveSpecSources`) is an extra pipeline phase that writes back into `boards`.
- Code must decide which to read from — scoring and display use top-level columns, the UI provenance panel reads `spec_sources`.

The top-level columns aren't used for SQL filtering or indexing today. At ~200 boards × ~5 fields, resolving on read is negligible.

## Goal

Remove the duplicated spec columns from the `boards` table. Resolve specs from `spec_sources` at read time instead of write time. Single source of truth.

## Approach

1. **Add a read-time resolver**: Function that takes a board key and returns resolved specs by querying `spec_sources` and applying source priority. Could be done per-board or batched for all boards.
2. **Remove spec columns from `boards` table**: Drop `flex`, `profile`, `shape`, `category`, `ability_level_min`, `ability_level_max` from the schema and `Board` type (or keep them as computed/transient fields populated at read time).
3. **Update `coalesce.ts`**: Stop setting spec fields on board objects — just write to `spec_sources`.
4. **Remove `resolveSpecSources` pipeline phase**: No longer needed as a write-time step.
5. **Update read paths**: Scoring (`calcBeginnerScoreForBoard`), API responses (`results/route.ts`), and any other consumers should get specs from the resolver.
6. **Update `upsertBoards`**: Remove spec columns from INSERT/UPDATE.
7. **Migration**: Drop columns from existing DBs (or just let the next pipeline run recreate the table without them).

## Considerations

- `msrpUsd` and `manufacturerUrl` are also populated from manufacturer sources during coalesce but are not multi-source fields — they could stay on `boards` as simple metadata.
- If future SQL filtering on specs becomes needed, it could be added back as a materialized view or index, but that's not a current requirement.
- The `spec_sources` table becomes the sole spec storage — make sure its key structure (brand_model + field + source) is well-documented.
