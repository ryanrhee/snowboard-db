# COMPLETED TASKS

## 1. Brand normalization is not applied when generating board keys from retailer data

**Completed:** 2026-02-23
**Commit:** (pending)

### What was done

- `specKey()` in `db.ts` now calls `canonicalizeBrand()` on the brand before building the key, so non-canonical brand inputs (e.g. `"gnu"`, `"lib"`) produce correct keys.
- The canonical brand is also passed to `normalizeModel()`, enabling correct brand-prefix stripping.

### Files changed

- `src/lib/db.ts` — added `canonicalizeBrand` import; updated `specKey()` to canonicalize brand.

---

## 2. Model names not fully normalized — brand name leaks into model string

**Completed:** 2026-02-23
**Commit:** (pending)

### What was done

- Added generic brand-prefix stripping to `normalizeModel()`: if the model starts with the canonical brand name followed by a space, strip it. This handles all brands generically instead of requiring per-brand hacks.
- Existing Lib Tech (`"Tech ..."`) and DWD (`"Will Die ..."`) hacks retained for the Evo-specific partial-brand-suffix case.
- Added 14 new test cases covering GNU, Jones, Rossignol, Sims, Season, Yes., Salomon, Rome, Lib Tech, Never Summer, plus no-op and mid-model-brand edge cases.

### Files changed

- `src/lib/normalization.ts` — added generic brand-prefix strip before existing Lib Tech/DWD hacks.
- `src/__tests__/canonicalization.test.ts` — added "strips brand name prefix from model (generic)" test block.

---

## 4. Some model names retain unsanitized retailer formatting

**Completed:** 2026-02-23
**Commit:** (pending)

### What was done

- Added trailing slash stripping (`model.replace(/\/+$/, "")`) to `normalizeModel()`.
- Added 2 test cases for single and multiple trailing slashes.

### Files changed

- `src/lib/normalization.ts` — added `\/+$` strip in cleanup section.
- `src/__tests__/canonicalization.test.ts` — added "strips trailing slashes (Task #4)" test block.
