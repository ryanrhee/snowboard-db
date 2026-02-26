# Task 39: Fix board data integrity issues

**Status:** In progress — Round 7 data audit

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
| `src/lib/strategies/brand-identifier.ts` | **New** — `BrandIdentifier` class: immutable raw→cleaned→canonical→manufacturer. Owns `BRAND_ALIASES` table |
| `src/__tests__/brand-identifier.test.ts` | **New** — 43 tests for BrandIdentifier (cleaned, canonical, immutability, manufacturer dispatch) |
| `src/lib/types.ts` | `RawBoard.brand` changed to `BrandIdentifier \| string \| undefined` |
| `src/lib/board-identifier.ts` | Composes `BrandIdentifier` internally, exposes `.brandId` |
| `src/lib/db.ts` | `specKey()` uses `BrandIdentifier` instead of `canonicalizeBrand()` |
| `src/lib/scrapers/coalesce.ts` | Uses `BrandIdentifier` for brand canonicalization |
| `src/lib/scrapers/adapters.ts` | `resolveBrand()` handles `BrandIdentifier \| string`, imports `BrandIdentifier` |
| `src/lib/retailers/evo.ts` | Creates `BrandIdentifier` instances instead of calling `normalizeBrand()` |
| `src/lib/retailers/tactics.ts` | Same |
| `src/lib/retailers/backcountry.ts` | Same |
| `src/lib/retailers/bestsnowboard.ts` | Same |
| `src/lib/retailers/rei.ts` | Same |
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

All 892 tests pass across 18 test files. (932 with brand-identifier tests)

### Round 7 progress: BrandIdentifier

#### Completed

- [x] **`BrandIdentifier` class** (`src/lib/strategies/brand-identifier.ts`) — Immutable identifier following the `BoardIdentifier` pattern. Takes raw brand string, lazily computes `cleaned`, `canonical`, and `manufacturer` (strategy dispatch key: `"burton"`, `"mervin"`, or `"default"`). `BRAND_ALIASES` table consolidated here.
- [x] **Retailers pass `BrandIdentifier` instances** — evo, tactics, backcountry, bestsnowboard, REI all create `new BrandIdentifier(rawBrand)` and set it on `RawBoard.brand`
- [x] **`RawBoard.brand` typed as `BrandIdentifier | string | undefined`** — migration-safe union type
- [x] **`adaptRetailerOutput`** — `resolveBrand()` helper extracts `.canonical` from `BrandIdentifier` instances, falls back to `normalizeBrand()` for plain strings
- [x] **`BoardIdentifier`** — composes `BrandIdentifier` internally (`.brandId` property), delegates `.brand` getter to `brandId.canonical`
- [x] **`coalesce.ts`** — creates `BrandIdentifier` from `sb.brand` to access `.canonical` and `.manufacturer`
- [x] **`db.ts` / `specKey`** — creates `BrandIdentifier` for canonicalization
- [x] **Tests** — 43 `BrandIdentifier` tests (cleaned, canonical, immutability, manufacturer dispatch). All 932 tests pass.

### Round 7: BoardIdentificationStrategy architecture (completed)

- [x] **Strategy pattern:** Created `BoardIdentificationStrategy` interface with `BoardSignal` (immutable input) → `BoardIdentity` (computed output: model + profileVariant)
- [x] **Three strategies:** `BurtonStrategy` (profile names: Camber, Flying V, Flat Top, PurePop Camber), `MervinStrategy` (contour codes: C2, C2X, C2E, C3, BTX; maps Camber→c3; derives from profile spec), `DefaultStrategy` (rider names, model aliases, no profile handling)
- [x] **Strategy dispatch:** `getStrategy(manufacturer)` — driven by `BrandIdentifier.manufacturer`
- [x] **Shared utilities:** `src/lib/strategies/shared.ts` — brand-agnostic normalization functions composed by each strategy
- [x] **`normalizeModel()` delegates to strategy** — no bifurcation, single execution path
- [x] **`specKey()` uses strategy** — calls `getStrategy().identify()` for model normalization
- [x] **`adaptRetailerOutput()` uses strategy** — board identification via strategy instead of raw normalizeModel
- [x] **`BoardIdentifier.model` uses strategy** — lazy computation via strategy.identify()
- [x] **`identifyBoards()` rewritten** — uses strategy profileVariant for splitting, no longer relies on mfr-only URL counting
- [x] **Removed dead code:** `extractProfileSuffix()`, `keepProfile` option from `normalizeModel()`, pipeline-based normalization in production code
- [x] **Data fixes:** toddler gender detection (`toddlers?'?` → kids), pipe char stripping (`|` → space), package deal stripping (`& Bindings`, `Package` keyword), `& Binding` singular

#### New files
| File | Contents |
|------|---------|
| `src/lib/strategies/types.ts` | `BoardSignal`, `BoardIdentity`, `BoardIdentificationStrategy` interfaces |
| `src/lib/strategies/shared.ts` | Generic normalization utility functions |
| `src/lib/strategies/burton.ts` | `BurtonStrategy` — Burton profile names, aliases |
| `src/lib/strategies/mervin.ts` | `MervinStrategy` — Mervin contour codes, GNU/Lib Tech specifics |
| `src/lib/strategies/default.ts` | `DefaultStrategy` — generic, per-brand rider names + aliases |
| `src/lib/strategies/index.ts` | `getStrategy(manufacturer)` dispatch function |
| `src/__tests__/strategies/burton.test.ts` | 9 tests |
| `src/__tests__/strategies/mervin.test.ts` | 19 tests |
| `src/__tests__/strategies/default.test.ts` | 19 tests |

#### Test results
All 996 tests pass across 22 test files.

### Next steps

- [x] Check if other retailers (evo, tactics) or manufacturers sell board-binding combos that need similar component-level gender detection
  - **Result: No action needed.** Tactics has no combos. Evo has false-positive combo_contents ("Snowboard") from Bataleon's `+` naming convention — model names and prices are correct. REI has one similar false positive. Manufacturers don't sell combos. The existing `strip-combo` normalization step and backcountry's `packageComponents` handler cover all real cases.
- [ ] **Round 7: Rearchitect profile variant disambiguation (manufacturer-specific)**

### Round 7 analysis: Profile variant disambiguation

#### Which manufacturers have profile variants?

Only **two manufacturer groups** sell the same base board in multiple camber configurations:

1. **Burton** — Human-readable profile names in product titles: Camber, Flying V, Flat Top, PurePop Camber. **Currently works correctly.** Burton's mfr pages and all retailers include the profile name in the model string. The existing `PROFILE_SUFFIX_RE` + `extractProfileSuffix` handles this well.

2. **Mervin (GNU + Lib Tech)** — Coded profile names: C2, C2X, C2E, C3, BTX. **Currently broken.** The codes aren't in the mfr product titles — they're only consistently in evo's URLs/product names.

All other manufacturers (Jones, CAPiTA, Ride, Salomon, Nitro, etc.) have single-profile boards — no splitting needed.

#### Current bugs in Mervin profile handling

**GNU Ladies Choice** — 3 entries, should be 2:
- `gnu|ladies choice c2|womens` ← **WRONG** (backcountry + gnu mfr, defaulted to "c2")
- `gnu|ladies choice c2x|womens` ← correct (evo says C2X)
- `gnu|ladies choice camber|womens` ← valid separate board, but actually C3 per GNU's site

The C2 and C2X entries are the same board. Root cause: mfr page `/ladies-choice` has no suffix → default "c2" applied, but the board is actually C2X.

**Lib Tech Skunk Ape** — 2 entries, should be 3:
- `lib tech|skunk ape camber|unisex` ← has listings from BOTH `/skunk-ape` (C2X per evo) AND `/skunk-ape-camber` (C3 per evo) — **two different boards merged into one**
- `lib tech|skunk ape twin|unisex` ← correct separate variant

Evo correctly lists Skunk Ape C2X and Skunk Ape C3 as separate products, but they got merged.

**GNU Money** — 1 entry but has 2 mfr pages:
- `gnu|money|unisex` ← has listings from both `/money` (C2) and `/c-money` (C3?)
- The "C " prefix strip (for GNU profile letter) collapsed "C Money" → "Money", preventing split detection
- Evo says Money is C2E

**GNU Gloss** — 1 entry but has 2 mfr pages:
- `gnu|gloss|womens` ← has listings from both `/gloss` and `/gloss-c`
- Same "C" suffix strip issue as Money
- Evo says Gloss is C3

#### Evo as authoritative source for Mervin profile codes

Evo consistently includes the contour code in their URLs. Full mapping from evo:

| Board | Evo code |
|-------|----------|
| **GNU** | |
| 4x4 | C3 |
| Antigravity | C3 |
| Banked Country | C3 |
| Facts | BTX |
| Gloss | C3 |
| Gremlin | C3 |
| Hyper | C2X |
| Ladies Choice | C2X |
| Money | C2E |
| Pro Choice | C3 |
| Something GNU | C2 |
| Wagyu | C3 |
| **Lib Tech** | |
| Cold Brew | C2 (also C2 Ltd) |
| Cortado | C2 |
| Cygnus BM | C2 |
| Doughboy | C3 |
| DPR | C3 |
| Dynamiss | C3 |
| Ejack Knife | C3 |
| Legitimizer | C3 |
| Lib Rig | C3 |
| Mayhem Sweetfish | C3 |
| Mini Ramp | C3 |
| Rasman | C2X |
| Skunk Ape | C2X **and** C3 (two separate evo products) |
| Terrain Wrecker | C2X |
| Theda | C2X |

#### Proposed approach

The current generic approach (hardcoded default suffix per brand, profileToSuffix built from manufacturer sources only) doesn't work for Mervin. A manufacturer-specific strategy is needed.

**Option A: Per-manufacturer profile config (recommended)**

Define a profile strategy per manufacturer:

```typescript
type ProfileStrategy =
  | { type: "name-in-title" }           // Burton: suffix is in the product name
  | { type: "coded"; codes: string[] }  // Mervin: codes from evo/retailer data
  | { type: "none" };                   // All others: single profile, no splitting

const PROFILE_STRATEGIES: Record<string, ProfileStrategy> = {
  burton: { type: "name-in-title" },
  gnu:    { type: "coded", codes: ["c2", "c2x", "c2e", "c3", "btx"] },
  "lib tech": { type: "coded", codes: ["c2", "c2x", "c2e", "c3", "btx"] },
  // all others: { type: "none" } — no profile splitting
};
```

For `"coded"` strategy:
1. Build suffix map from **all sources** (mfr + retailer), not just manufacturer. Evo's URLs are the best source since they include the code.
2. When a retailer (evo) has a profile code in the raw model, extract it and use it for the board key.
3. When a mfr page has no code, look up the matching retailer code via profile spec (`profileToSuffix` built from evo data).
4. **No hardcoded default.** If no code can be determined, use the base model name without any profile suffix — don't guess.
5. GNU's "C " prefix and " C" suffix stripping should NOT happen during normalization — these are profile indicators (C Money = C3 Money, Gloss C = Gloss C3). Instead, the profile code extraction should handle them.

For `"name-in-title"` strategy:
- Keep current behavior (works for Burton).

For `"none"` strategy:
- Skip profile collision splitting entirely.

**Option B: Simpler fix — extend profileToSuffix to include retailers**

Minimal change: in the profile collision splitting code, also include retailer sources when building `profileToSuffix`. This fixes Ladies Choice (evo's C2X + hybrid_camber → correct mapping) but may not fix Skunk Ape (where evo has two separate products) or Money/Gloss (where the GNU "C" stripping prevents split detection).

**Option C: Evo-driven profile code table**

Extract profile codes from evo URLs at scrape time and store as a spec. During coalesce, for Mervin boards, look up the evo-derived code instead of guessing. This is data-driven but couples the system to evo's naming convention.

#### Additional issues found during audit

- `nitro|ripper toddlers'|unisex` — should be kids gender, not unisex
- `gnu|recess package mini & bindings|kids` — package deal, not a standalone board
- `roxy|poppy package small & bindings|kids` — same
- `burton|after school special & bindings package|kids` — same
- `jones|happy mountain package|kids` — same (may duplicate `jones|kid's happy mountain|kids`)
- `burton|family tree gril master|unisex` — "gril" appears to be Burton's actual spelling (not a typo)
- `capita|warpspeed | automobili lamborghini|unisex` — pipe char in model could interfere with board_key parsing

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
