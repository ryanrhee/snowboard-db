# 2. Model names not fully normalized — brand name leaks into model string

**Completed:** 2026-02-23

## What was done

- Added generic brand-prefix stripping to `normalizeModel()`: if the model starts with the canonical brand name followed by a space, strip it. This handles all brands generically instead of requiring per-brand hacks.
- Existing Lib Tech (`"Tech ..."`) and DWD (`"Will Die ..."`) hacks retained for the Evo-specific partial-brand-suffix case.
- Added 14 new test cases covering GNU, Jones, Rossignol, Sims, Season, Yes., Salomon, Rome, Lib Tech, Never Summer, plus no-op and mid-model-brand edge cases.

## Files changed

- `src/lib/normalization.ts` — added generic brand-prefix strip before existing Lib Tech/DWD hacks.
- `src/__tests__/canonicalization.test.ts` — added "strips brand name prefix from model (generic)" test block.
