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

---

## 3. Manufacturer spec keys include profile suffixes that retailers don't use

**Completed:** 2026-02-23

### What was done

- Added trailing profile designator stripping to `normalizeModel()`: regex strips `Camber`, `Flying V`, `Flat Top`, `PurePop`, `PurePop Camber`, `C2X`, `C2E`, `C2`, `C3 BTX`, `C3`, `BTX` when they appear at the end of the model name. Since `specKey()` calls `normalizeModel()` on both manufacturer and retailer sides, both converge to the same base key.
- Added `T.Rice` → `T. Rice` normalization for consistent Lib Tech model naming.
- Updated 10 existing test expectations to reflect profile suffix stripping.
- Added 16 new test cases: Burton profile stripping (5), Lib Tech/GNU profile code stripping (6), no-op cases (3), T.Rice normalization (2).

### Files changed

- `src/lib/normalization.ts` — added profile designator strip regex + T.Rice normalization after brand-prefix stripping.
- `src/__tests__/canonicalization.test.ts` — updated existing expectations; added "strips trailing profile designators" and "normalizes T.Rice → T. Rice" test blocks.
