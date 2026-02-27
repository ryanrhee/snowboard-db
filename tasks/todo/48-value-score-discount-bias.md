# Task 48: Redesign value score — fix discount bias, add profile-aware scoring

## Problem

An expensive board at full price (no discount) can get a high value score. A $800 board with 0% discount can score 0.82, which doesn't match the intuition that "value" means getting a good deal.

## Current algorithm (`src/lib/db.ts`, `calcValueScoreFromBoardAndPrice`)

The value score is a weighted average of three factors:

| Factor | Weight | Range | What it measures |
|--------|--------|-------|-----------------|
| **Discount** | 0.50 | 0.2–1.0 | How deep the discount is (10%→0.35, 50%+→1.0) |
| **Premium tier** | 0.35 | 0.25–1.0 | How expensive the MSRP is ($300→0.45, $600+→1.0) |
| **Year/age** | 0.15 | 0.4–0.9 | How old the board is (current year→0.4, 3+ years→0.9) |

**The bug:** When there's no discount (`discountPercent` is null or ≤ 0), the discount factor contributes **0 points and 0 weight** — it's excluded entirely. The score then becomes a weighted average of only premium tier + year, which can be high:

```
No discount, $800 MSRP, 2026 model:
  total  = 0 (discount skipped) + 1.0×0.35 (premium) + 0.4×0.15 (year) = 0.41
  weights = 0 + 0.35 + 0.15 = 0.50
  value  = 0.41 / 0.50 = 0.82  ← high score for a full-price board
```

## What "value" should actually mean

**Value = how much board you're getting relative to what you're paying**, evaluated from a specific rider's perspective. A high value score should mean:

1. A good board at a significant discount (deal quality)
2. A board whose specs match what this rider needs (core fit)
3. A board that offers extra utility beyond the rider's core needs (versatility bonus)

The current algorithm only attempts #1 (discount) and gets it wrong. It completely ignores #2 and #3.

## Available data for scoring

### Data we already have per board

| Signal | Source | Coverage | Notes |
|--------|--------|----------|-------|
| Sale price (USD) | All retailers | ~100% | Lowest across listings |
| MSRP | Manufacturers + retailers | ~80% | From manufacturer sites or JSON-LD |
| Discount % | Derived | ~80% | `(MSRP - salePrice) / MSRP` |
| Condition | Retailers | ~100% | new, blemished, closeout, used |
| Terrain scores | Manufacturers + reviews | ~60% | 5 dimensions: piste, powder, park, freeride, freestyle (1-3 scale) |
| Ability range | Manufacturers + reviews | ~70% | min/max: beginner → expert |
| Flex | Multi-source | ~85% | 1-10 scale |
| Profile | Multi-source | ~85% | camber, rocker, hybrid, etc. |
| Shape | Multi-source | ~80% | twin, directional, etc. |
| Category | Multi-source | ~90% | all-mountain, freestyle, etc. |

### Data we can derive

| Signal | How to get it | Effort |
|--------|--------------|--------|
| **Terrain versatility** | Count terrain dimensions scoring ≥2 | Zero — derive from existing terrain scores |
| **Ability breadth** | Distance between abilityLevelMin and abilityLevelMax | Zero — derive from existing data |

## Redesign: three pillars

All three pillars are **pre-computed** during the pipeline. Pillars 2 and 3 are computed once per board per saved rider profile (read from `rider_profiles` table). The UI selects which pre-computed scores to display based on the active profile chip. If no profile is selected, fall back to intermediate_am (most versatile default).

### Pillar 1: Deal quality (weight TBD)

How good is the discount? Profile-independent — computed once per board.

```
Input: discountPercent, condition
```

- **Discount %** is the primary signal. Same tiers as now, but **always participates** — 0% discount → 0.1, not excluded. This alone fixes the original bug.
- **Condition bonus**: Closeout/blemished boards get a small additive boost (they're a better deal than their discount % suggests, since the "original price" is often already reduced).

### Pillar 2: Core fit (weight TBD)

Does this board match what the rider needs? Profile-dependent — computed per board per saved profile.

```
Input: flex, profile, shape, category, abilityRange
Evaluated against: SpecFitCriteria for the rider's riding profile
```

Binary match on each dimension: flex in range, board profile match, shape match, category match, ability range overlap. Boards missing data for a dimension get neutral credit (not penalized).

#### Spec-fit criteria per riding profile

| Profile | Flex | Profiles | Shapes | Categories | Ability |
|---------|------|----------|--------|------------|---------|
| beginner | 1–4 | rocker, hybrid_rocker, flat | true_twin, directional_twin | all_mountain, freestyle | beginner–intermediate |
| intermediate_am | 4–7 | hybrid_camber, camber | directional_twin, true_twin | all_mountain | intermediate–advanced |
| advanced_freestyle | 4–6 | hybrid_camber, hybrid_rocker | true_twin | freestyle, park | advanced–expert |
| advanced_freeride | 7–10 | camber, hybrid_camber | directional, tapered | freeride, powder | advanced–expert |
| advanced_am | 5–8 | camber, hybrid_camber | directional_twin | all_mountain | advanced–expert |

### Pillar 3: Versatility bonus (weight TBD)

Extra utility beyond the rider's core needs. Profile-dependent — computed per board per saved profile. What counts as "versatility" differs by rider:

- **Beginner**: Ability breadth — a board rated beginner-to-advanced is more valuable than beginner-only because you won't outgrow it after one season. Terrain versatility is not relevant (beginners ride groomers).
- **Intermediate all-mountain**: Terrain breadth, groomer-first — strong piste score is the baseline, bonus for each additional terrain dimension scoring well. Some ability breadth bonus for room to grow.
- **Advanced freestyle / freeride**: Light terrain breadth bonus — specialization matters more, but a park board that also grooms well > park-only. Weighted toward their primary terrain.
- **Advanced all-mountain**: Heavy terrain breadth bonus — this rider wants a quiver-killer board that scores well across many terrain dimensions.

### Example scenarios

**Beginner rider (Ryan):**

| Board | Deal | Core fit | Versatility | Total |
|-------|------|----------|-------------|-------|
| $300 soft rocker twin, 30% off | high | high (perfect specs) | medium (beginner-intermediate range) | high |
| $800 stiff camber directional, 0% off | low | low (wrong specs) | low (advanced-only) | low |
| $250 soft hybrid twin, 0% off | low | high (right specs) | high (beginner-to-advanced range) | medium |

**Advanced freeride rider:**

| Board | Deal | Core fit | Versatility | Total |
|-------|------|----------|-------------|-------|
| $600 stiff directional, 40% off | high | high (great freeride board) | medium (freeride + groomers) | high |
| $300 soft twin park, 50% off | high | low (wrong specs) | low (park only) | medium-low |

## Implementation notes

- **Pillar 1** (deal quality) is profile-independent → pre-compute once per board during pipeline.
- **Pillars 2+3** (core fit, versatility) are profile-dependent → pre-compute per board **per saved profile** (read `rider_profiles` table to determine which profiles exist). Only profiles that exist in the DB need scores computed.
- At query time, the API selects the pre-computed scores matching the active profile. No runtime scoring.
- When no profile is selected, use the intermediate_am scores as the default (most versatile).
- Write tests with specific board + rider profile scenarios (the examples above) to lock in expected behavior.
- All inputs already exist in the database — no new scraping required.
