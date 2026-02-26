# Task 40: Rearchitect model name normalization for testability

**Status:** Completed — 2026-02-26

## Summary of changes

Replaced the monolithic 31+ regex chain in `normalizeModel()` with a structured, composable normalization pipeline. Zero behavior changes — all 641 original tests pass unchanged, plus 202 new tests added.

### Architecture

- **`NormalizationStep` interface**: Each step has a `name`, optional `brands[]` scope, and `transform(model, brand)` function
- **`NORMALIZATION_PIPELINE` array**: 22 named steps in explicit order, exported for direct testing
- **`normalizeModel()`**: Iterates the pipeline, skipping brand-scoped steps that don't apply
- **`normalizeModelDebug()`**: Returns `{ step, result }[]` trace showing intermediate results after each step

### Data tables (constants extracted for visibility)

- `MODEL_ALIASES` — exact match aliases (mega merc → mega mercury, etc.)
- `MODEL_PREFIX_ALIASES` — prefix-based aliases (sb → spring break, etc.)
- `RIDER_NAMES` — brand-scoped rider name lists (7 brands, 19 riders)

### Test structure

1. **Snapshot tests** (143 cases): JSON fixture at `src/__tests__/fixtures/normalization-inputs.json` — every unique input from existing tests, run through normalization and compared against approved output
2. **Step-level unit tests** (53 cases): Each pipeline step tested in isolation via `findStep(name).transform()`
3. **Debug trace tests** (6 cases): `normalizeModelDebug()` verified for trace output, early returns, step skipping, and keepProfile behavior
4. **Original tests** (641 cases): All existing tests across 16 test files pass unchanged

### Files modified

| File | Changes |
|------|---------|
| `src/lib/normalization.ts` | Rewrote `normalizeModel()` as pipeline; added `NormalizationStep` interface, `NORMALIZATION_PIPELINE` array, `normalizeModelDebug()`, extracted `MODEL_ALIASES`/`MODEL_PREFIX_ALIASES`/`RIDER_NAMES` to module scope |
| `src/__tests__/normalization-pipeline.test.ts` | New — 202 tests (snapshot + step-level + debug) |
| `src/__tests__/fixtures/normalization-inputs.json` | New — 143 snapshot entries |

### Test results

All 843 tests pass across 17 test files (641 original + 202 new).
