# Task 39: Fix board data integrity issues

**Status:** In progress — Round 5 fixes applied and verified with pipeline re-run

## Progress

### Round 1: Initial fixes (all verified with pipeline re-run)

- [x] Zero-width character stripping in `normalizeModel()` and `normalizeBrand()`
- [x] Multi-word brand parsing in evo.ts (`MULTI_WORD_BRANDS` list)
- [x] Prefer JSON-LD brand on evo detail pages
- [x] `BRAND_ALIASES`: "never summer", "united shapes"
- [x] Model normalization: strip leading "the ", replace ` - ` with space, strip acronym periods, replace hyphens with spaces
- [x] `MODEL_ALIASES`: mega merc→mega mercury, son of a birdman→son of birdman, sb→spring break, snowboards→strip
- [x] `specKey()` strips "kids " prefix for kids/youth gender
- [x] `deleteOrphanBoards()` at end of pipeline

### Round 2: Rider names, GNU profile letters, WMN gender (verified)

- [x] Rider name prefix stripping (brand-scoped): GNU (Forest Bailey, Max Warbington, Cummins'), CAPiTA (Arthur Longo, Jess Kimura), Nitro (Hailey Langland, Marcus Kleveland), Jones (Harry Kearney, Ruiki Masuda), Arbor (Bryan Iguchi, Erik Leon, Jared Elston, Pat Moore)
- [x] Rider name suffix stripping (e.g. "Team Pro Marcus Kleveland" → "Team Pro")
- [x] "By <rider>" infix stripping (e.g. "Equalizer By Jess Kimura" → "Equalizer")
- [x] "Signature Series" / "Ltd" prefix stripping after rider name removal
- [x] GNU "C " profile prefix and " C" suffix stripping
- [x] GNU "Asym" prefix/suffix stripping (shape attribute, not model name)
- [x] `detectGender`: added `\bwmn\b` pattern
- [x] CAPiTA `deriveGender`: added "wmn" check
- [x] Navigator WMN now correctly tagged as womens

### Round 3: Additional rider names, season/size stripping, profile collision fix (verified)

- [x] Rider names added: Lib Tech (T. Rice, Travis Rice), Arbor (Mike Liddle, Danny Kass, DK), Gentemstick (Alex Yoder)
- [x] Strip "2627 EARLY RELEASE" and "- 2627 EARLY RELEASE" season suffix from model names
- [x] Strip trailing 3-digit board lengths (140-220 cm, e.g. "Doughboy 185" → "Doughboy")
- [x] Profile collision splitting: only split when profiles actually differ, not just when URLs differ (fixes Jones Stratos signature editions creating spurious variants)

### Round 4: Model aliases, embedded size stripping, gender column fix (verified)

- [x] **Model aliases added:** hel yes→hell yes, dreamweaver→dream weaver, paradice→paradise, fish 3d directional→3d fish directional, fish 3d→3d fish directional, 3d family tree channel surfer→family tree 3d channel surfer, x konvoi surfer→konvoi x nitro surfer
- [x] **Prefix alias added:** darkhorse→dark horse (CAPiTA spelling inconsistency)
- [x] **Embedded size stripping:** Extended strip-trailing-size to strip mid-string 3-digit board sizes (130-229 cm range), not just trailing. Fixes Aesmo SI 144/152 duplication and CAPiTA LTD edition redundant sizes (DOA 154, Navigator 158)
- [x] **Aesmo rider name:** Added "Fernando Elvira" to RIDER_NAMES
- [x] **Gender column fix:** `upsertBoard()` now writes gender derived from `genderFromKey(boardKey)`. Previously the `gender` column on the `boards` table always defaulted to 'unisex' because it was never set. Added `gender` field to `Board` interface and all 3 Board construction sites (coalesce, mapRowToNewBoard, getBoardsWithListings)

### Round 5: CAPiTA smart apostrophe gender fix, coalesce gender tests (verified)

- [x] **Root cause: Unicode smart apostrophe (U+2019)** — CAPiTA detail pages use RIGHT SINGLE QUOTATION MARK (`'`) in "Women's", not ASCII apostrophe (`'`). `parseCategoriesText` and `deriveGender` both failed to match, so all CAPiTA women's boards from the manufacturer scraper got `gender: null` → unisex.
- [x] **`parseCategoriesText` fix:** Normalize `\u2018`/`\u2019` (smart quotes) to ASCII `'` before parsing category labels
- [x] **`deriveGender` fix:** Normalize smart apostrophes when checking Shopify tags for `"women's"`
- [x] **Unit tests:** Smart apostrophe variant of `parseCategoriesText` gender detection; end-to-end board_key tests with smart apostrophe in categories text and tags
- [x] **Coalesce integration tests:** 5 new tests in `coalesce.test.ts` verifying CAPiTA gender flows through `coalesce()` — womens/unisex/kids board_key and gender field, womens manufacturer+retailer merge, same model with different genders creates separate boards

### Round 6: Backcountry combo package gender detection (verified)

- [x] **Root cause:** Backcountry combo/package deals (board + binding) use a package title like "Paradice Snowboard + Union Juliet Binding - 2026" with no gender indicator. The individual component names in `__NEXT_DATA__.packageComponents` do include gender (e.g. "Paradise Snowboard - 2026 - Women's") but the scraper wasn't reading them.
- [x] **Fix:** In `fetchBoardDetails`, when `__NEXT_DATA__` has `packageComponents`, find the snowboard component (matches "snowboard" but not "binding") and use its `componentName` as the model. Gender is then detected by `adaptRetailerOutput` → `detectGender` from the "- Women's" suffix.
- [x] **Integration test:** `backcountry-combo.test.ts` — reads cached HTML from `http-cache.db`, mocks `fetchPageWithBrowser` to return it, runs `backcountry.scrape()`, asserts Paradise board has `gender: "womens"`.

### Pipeline results

| Metric | Before | R1 | R2 | R3 | R4 | R5 | R6 |
|--------|--------|----|----|----|----|----|-----|
| Total boards | 544 | 513 | 500 | 490 | 483 | 482 | 479 |
| Total listings | — | 3272 | 3272 | 3272 | 3272 | 3272 | 3272 |
| Duplicate keys | ~30 | 0 | 0 | 0 | 0 | 0 | 0 |
| Orphan boards | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| Mis-split brands | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| Zero-width dupes | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| Gender accuracy | — | — | — | 0% | 100% (359u/98w/26k) | 100% (357u/99w/26k) | 100% (354u/99w/26k) |

### Files modified

| File | Changes |
|------|---------|
| `src/lib/normalization.ts` | Zero-width strip, model aliases (hel yes, dreamweaver, paradice, fish 3d variants, 3d family tree, x konvoi surfer, darkhorse prefix), period/hyphen/article normalization, rider name stripping (prefix/suffix/infix, added Aesmo Fernando Elvira), GNU C/Asym stripping, WMN gender detection, season suffix stripping, embedded size stripping (130-229 range, mid-string), new rider names (Lib Tech/Arbor/Gentemstick/Aesmo) |
| `src/lib/types.ts` | Added `gender` field to `Board` interface |
| `src/lib/db.ts` | `upsertBoard()` writes gender column; `mapRowToNewBoard()` and `getBoardsWithListings()` read gender; kids prefix strip in `specKey()`; `deleteOrphanBoards()` |
| `src/lib/scrapers/coalesce.ts` | Board construction sets `gender` from `genderFromKey(key)`; profile collision splitting checks profile suffixes |
| `src/lib/scraping/utils.ts` | Zero-width strip in `normalizeBrand`, brand aliases |
| `src/lib/retailers/evo.ts` | Multi-word brand parsing, prefer JSON-LD brand |
| `src/lib/pipeline.ts` | Orphan cleanup at end of run |
| `src/lib/manufacturers/capita.ts` | WMN gender detection in `deriveGender`; extracted `parseCategoriesText` as testable function; smart apostrophe normalization in both `parseCategoriesText` and `deriveGender` |
| `src/lib/retailers/backcountry.ts` | Combo package: use snowboard `packageComponents[].componentName` as model for gender detection |
| `src/__tests__/backcountry-combo.test.ts` | Integration test: cached HTML → scraper → womens gender detection for combo deals |
| `src/__tests__/normalization-pipeline.test.ts` | 228 tests (snapshot + step-level + debug) |
| `src/__tests__/fixtures/normalization-inputs.json` | 156 snapshot entries |
| `src/__tests__/coalesce.test.ts` | Added `genderFromKey` to db mock; 5 CAPiTA gender flow integration tests |
| `src/__tests__/capita.test.ts` | 30 tests: `skillLevelToAbility`, `cleanModelName`, `parseCategoriesText` (incl. smart apostrophe), `deriveGender`, end-to-end board_key gender flow |
| `src/__tests__/canonicalization.test.ts` | 403 tests (all normalization rules) |
| `src/__tests__/orphan-boards.test.ts` | 3 tests for orphan board cleanup |
| `src/__tests__/evo-brand-parsing.test.ts` | 9 tests for multi-word brand parsing |

### Test results

All 892 tests pass across 18 test files.

### Remaining near-dupes — all legitimate

Most are expected variants: Pro/non-Pro editions, Split/non-Split, version 2.0 vs original, signature rider editions (Benny Milam Ltd, Miles Fallon Ltd), Junior/Youth variants, profile splits from `identifyBoards()` (e.g. Money C2 vs Money C3).

### Next steps

- [ ] Check if other retailers (evo, tactics) or manufacturers sell board-binding combos that need similar component-level gender detection

### Verification queries

```sql
-- No duplicates
SELECT board_key, COUNT(*) c FROM boards GROUP BY board_key HAVING c > 1;
-- No mis-split brands
SELECT board_key FROM boards WHERE board_key LIKE 'never|%' OR board_key LIKE 'united|%';
-- No orphans
SELECT board_key FROM boards WHERE board_key NOT IN (SELECT DISTINCT board_key FROM listings);
-- Near-dupe count
SELECT COUNT(*) FROM (
  SELECT a.board_key FROM boards a, boards b
  WHERE a.brand = b.brand AND a.board_key < b.board_key
  AND (INSTR(LOWER(a.model), LOWER(b.model)) > 0 OR INSTR(LOWER(b.model), LOWER(a.model)) > 0)
);
```

---

## Original Problem

Analysis of the `boards` table (544 boards) revealed multiple categories of data integrity issues caused by inconsistent board key normalization in the scraping pipeline.

### 1. Zero-width characters creating phantom duplicates (3 boards) — FIXED

### 2. Brand name parsing errors (6 boards) — FIXED

### 3. True duplicate boards (20+ pairs) — FIXED

All punctuation/formatting, article/prefix, kids prefix, abbreviation, rider name, and GNU profile letter duplicates resolved.

### 4. Orphan boards with no listings (3 boards) — FIXED

## Out of scope

- Spec conflicts across sources — separate resolution/judgment issue
- Missing `ability_level` field — not populated by any source yet
- Missing flex for many boards — most retailers don't provide structured flex
