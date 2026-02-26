# Task 39: Fix board data integrity issues

**Status:** In progress — Round 3 fixes applied, awaiting further review

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

### Pipeline results

| Metric | Before | After Round 1 | After Round 2 | After Round 3 |
|--------|--------|---------------|---------------|---------------|
| Total boards | 544 | 513 | 500 | 490 |
| Total listings | — | 3272 | 3272 | 3272 |
| Duplicate keys | ~30 | 0 | 0 | 0 |
| Orphan boards | 3 | 0 | 0 | 0 |
| Mis-split brands | 6 | 0 | 0 | 0 |
| Zero-width dupes | 3 | 0 | 0 | 0 |
| Near-dupe pairs | ~130 | 123 | 107 | 101 |

### Files modified

| File | Changes |
|------|---------|
| `src/lib/normalization.ts` | Zero-width strip, model aliases, period/hyphen/article normalization, rider name stripping (prefix/suffix/infix), GNU C/Asym stripping, WMN gender detection, season suffix stripping, trailing size stripping, new rider names (Lib Tech/Arbor/Gentemstick) |
| `src/lib/scraping/utils.ts` | Zero-width strip in `normalizeBrand`, brand aliases |
| `src/lib/scrapers/coalesce.ts` | Profile collision splitting: check profile suffixes differ, not just URLs |
| `src/lib/db.ts` | Kids prefix strip in `specKey()`, `deleteOrphanBoards()` |
| `src/lib/retailers/evo.ts` | Multi-word brand parsing, prefer JSON-LD brand |
| `src/lib/pipeline.ts` | Orphan cleanup at end of run |
| `src/lib/manufacturers/capita.ts` | WMN gender detection in `deriveGender` |
| `src/__tests__/canonicalization.test.ts` | 403 tests (added tests for all normalization rules) |
| `src/__tests__/orphan-boards.test.ts` | 3 tests for orphan board cleanup |
| `src/__tests__/evo-brand-parsing.test.ts` | 9 tests for multi-word brand parsing |

### Test results

All 641 tests pass across 16 test files.

### Remaining near-dupes (101 pairs) — all legitimate

Most are expected variants: Pro/non-Pro editions, Split/non-Split, version 2.0 vs original, signature rider editions (Benny Milam Ltd, Miles Fallon Ltd), Junior/Youth variants, profile splits from `identifyBoards()` (e.g. Money C2 vs Money C3).

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
