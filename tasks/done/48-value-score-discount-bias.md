# Task 48: Redesign value score — fix discount bias, add profile-aware scoring

**Completed: 2026-02-27**

## Problem

An expensive board at full price (no discount) could get a high value score (0.82) because the discount factor was excluded from the weighted average when null/zero, inflating scores from the remaining premium-tier and year factors.

## Solution: Three-pillar scoring

Replaced `calcValueScoreFromBoardAndPrice` with a three-pillar system in `src/lib/scoring.ts`:

### Pillar 1: Deal score (profile-independent)
- Discount tiers: 50%+ → 1.0, 40% → 0.9, 30% → 0.75, 20% → 0.55, 10% → 0.35, <10% → 0.2, **0%/null → 0.1** (the bug fix)
- Condition bonus: blemished/closeout → +0.1 (capped at 1.0)
- Derives discount from MSRP when `discountPercent` is null

### Pillar 2: Core fit score (profile-dependent)
- 5 binary dimensions: flex in range, profile match, shape match, category match, ability overlap
- Each match = 1.0, miss = 0.0, null data = 0.5 (neutral)
- Score = average of 5 dimensions

### Pillar 3: Versatility score (profile-dependent)
- **beginner**: ability breadth (3+ levels → 1.0, 2 → 0.7, 1 → 0.4)
- **intermediate_am_freestyle**: piste baseline + freestyle/park lean + terrain extras
- **intermediate_am_freeride**: piste baseline + freeride/powder lean + terrain extras
- **advanced_freestyle/freeride**: primary terrain ≥2 required, bonus for extras
- **advanced_am**: returns 0 (redundant with fit — weight is 0)

### Per-profile weights

| Profile | Deal | Fit | Versatility |
|---------|------|-----|-------------|
| beginner | 0.50 | 0.40 | 0.10 |
| intermediate_am_freestyle | 0.45 | 0.30 | 0.25 |
| intermediate_am_freeride | 0.45 | 0.30 | 0.25 |
| advanced_freestyle | 0.35 | 0.45 | 0.20 |
| advanced_freeride | 0.35 | 0.45 | 0.20 |
| advanced_am | 0.35 | 0.65 | 0.00 |

## Profile changes

- Split `intermediate_am` into `intermediate_am_freestyle` and `intermediate_am_freeride` — same fit criteria, different versatility terrain emphasis
- Both share AM fit criteria (flex 4-7, hybrid_camber/camber, directional_twin/true_twin, all_mountain)

## Pre-computation

Fit and versatility scores are pre-computed per board × profile during the pipeline and stored in `board_profile_scores` table (keyed on `board_key, profile`). Deal score is computed at query time since it depends on listing prices.

## Files changed

- `src/lib/scoring.ts` — new: calcDealScore, calcCoreFitScore, calcVersatilityScore, calcFinalScore with per-profile weights
- `src/lib/profiles.ts` — added SpecFitCriteria, getSpecFitCriteria(), ALL_RIDING_PROFILES, intermediate split
- `src/lib/types.ts` — BoardWithListings: valueScore → dealScore + fitScore + versatilityScore + finalScore
- `src/lib/db.ts` — board_profile_scores table + CRUD, updated getBoardsWithListings to accept profile param, removed calcValueScoreFromBoardAndPrice, fixed deleteOrphanBoards FK constraint
- `src/lib/pipeline.ts` — pre-compute profile scores after spec resolution (all 3 paths)
- `src/app/api/boards/route.ts` — accepts profile query param
- `src/app/page.tsx` — passes active profile's ridingProfile to API (via ref to avoid re-render loop)
- `src/components/SearchResults.tsx` — 4 sortable score columns: Score, Deal, Fit, Vers
- `src/components/BoardDetail.tsx` — shows Deal/Fit/Vers score bars in detail panel
- `src/__tests__/scoring.test.ts` — new: 16 tests for all 3 pillars + integration
