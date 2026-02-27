# Task 48: Value score should not be high for expensive boards with no discount

## Problem

An expensive board at full price (no discount) can get a high value score. A $800 board with 0% discount can score 0.82, which doesn't match the intuition that "value" means getting a good deal.

## Current algorithm (`src/lib/db.ts:694-745`, `calcValueScoreFromBoardAndPrice`)

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

The current algorithm conflates "expensive board" with "good value." A better framing: **value = how much board you're getting relative to what you're paying.** A high value score should mean one of:

1. A good board at a significant discount (deal-hunting)
2. A board that punches above its price class (quality-per-dollar)
3. A versatile board that covers many use cases (utility-per-dollar)

The current algorithm only attempts #1 (discount) and gets it wrong. It completely ignores #2 and #3.

## Available data for a better value score

### Data we already have per board

| Signal | Source | Coverage | Notes |
|--------|--------|----------|-------|
| Sale price (USD) | All retailers | ~100% | Lowest across listings |
| MSRP | Manufacturers + retailers | ~80% | From manufacturer sites or JSON-LD |
| Discount % | Derived | ~80% | `(MSRP - salePrice) / MSRP` |
| Condition | Retailers | ~100% | new, blemished, closeout, used |
| Year/model age | Scraped | ~70% | From URLs, model names, tags |
| Terrain scores | Manufacturers + reviews | ~60% | 5 dimensions: piste, powder, park, freeride, freestyle (1-3 scale) |
| Ability range | Manufacturers + reviews | ~70% | min/max: beginner → expert |
| Flex | Multi-source | ~85% | 1-10 scale |
| Profile | Multi-source | ~85% | camber, rocker, hybrid, etc. |
| Shape | Multi-source | ~80% | twin, directional, etc. |
| Category | Multi-source | ~90% | all-mountain, freestyle, etc. |
| Availability | Retailers | ~100% | in_stock, low_stock, out_of_stock |
| Stock count | Some retailers | ~30% | Number of sizes available |
| Number of retailers | Derived | 100% | How many stores carry it |

### Data we don't have but could derive

| Signal | How to get it | Effort |
|--------|--------------|--------|
| **Terrain versatility** | Count terrain dimensions scoring ≥2 | Zero — derive from existing terrain scores |
| **Ability breadth** | Distance between abilityLevelMin and abilityLevelMax | Zero — derive from existing data |
| **Market competition** | Count of listings across retailers for same board | Zero — count from listings table |
| **Price-vs-peers** | Board's price relative to same-category average | Low — aggregate query |
| **Brand value tier** | Static mapping of brands by typical price/quality positioning | Low — one-time curated data |
| **Review consensus** | Whether multiple sources agree on specs (already tracked in spec resolution) | Zero — already in `spec_sources` |

## Recommendation: redesign around three pillars

### Pillar 1: Deal quality (40% weight)

How good is the discount relative to the board's normal price?

```
Input: discountPercent, condition, year
```

- **Discount %** is the primary signal (same tiers as now, but always participates — 0% discount = low score, not excluded)
- **Condition bonus**: Closeout/blemished boards that are functionally identical to new but cheaper get a small boost (they're a better deal than their discount % suggests, since the "original price" is often already reduced)
- **Age bonus**: Older model years at the same price are better deals (last year's tech is 95% as good at 70% the price)

No discount → score = 0.1 (not excluded). This alone fixes the original bug.

### Pillar 2: Quality-per-dollar (35% weight)

How much board are you getting for the money, **relative to what the rider actually needs?** This replaces the broken "premium tier" factor.

```
Input: salePrice, terrainScores, abilityRange, flex, profile, specSourceCount, riderProfile
```

"Quality" means different things at different ability levels. The sub-signals should be weighted differently depending on the rider's profile:

#### Riding profiles define what "quality" means

See **task 49** for the full profile definitions. Five riding profiles, each with different spec-fit criteria:

| Profile | What "quality" means for this rider |
|---------|-------------------------------------|
| **Beginner** | Forgiving specs (soft flex, rocker), not overbuilt, cheap relative to beginner peers |
| **Intermediate all-mountain** | Versatile terrain coverage, room to grow (intermediate→advanced ability range), below category median price |
| **Advanced freestyle** | Park-appropriate specs (medium flex, true twin), category fit, competitive price for park boards |
| **Advanced freeride** | Powder/steep-appropriate specs (stiff, directional), freeride/powder category, competitive price for freeride boards |
| **Advanced all-mountain** | Performance all-rounder specs (medium-stiff, directional twin, camber), competitive price for performance boards |

Only profiles that the user has configured need to be evaluated. If the user only has a beginner and an intermediate profile, the three advanced profiles' spec-fit criteria are never computed.

#### Design implication: value score must be computed at query time

The current value score is a static property computed once per board during the pipeline. If quality-per-dollar depends on the rider's profile, the value score becomes **per-board-per-query** — computed when the user's filters (ability level, terrain preferences) are known.

This means:
- **Deal quality** (pillar 1) and **availability** (pillar 3) can still be pre-computed at pipeline time — they don't depend on the rider.
- **Quality-per-dollar** (pillar 2) must be computed at query time, using the rider's ability level and terrain preferences as inputs.
- The pre-computed pillars can be stored on the board; pillar 2 is applied as a modifier at query time.
- If no rider profile is provided (no filters set), fall back to a generic "all-around" quality score (weight terrain versatility + broad ability range, similar to the intermediate profile).

**Spec-fit scoring** — how well a board matches what the rider needs — is the key signal here. This is essentially the same concept as the existing `beginnerScore` but generalized to all ability levels. Rather than having a separate `beginnerScore` and `valueScore`, the value score should incorporate spec-fit as a component.

### Pillar 3: Availability signal (25% weight)

Is this board actually obtainable, and from how many sources?

```
Input: availability, stockCount, retailerCount
```

- **Multi-retailer availability**: Boards carried by 3+ retailers are easier to comparison-shop and more likely to have competitive pricing. A board only at one retailer at full price is poor value.
- **Stock health**: Low stock or limited sizes reduces practical value (you might not find your size).
- **In-stock bonus**: Actually available boards are more valuable than out-of-stock listings (which are noise).

This pillar addresses a real user need: there's no value in a "great deal" you can't actually buy.

### Example scenarios under new algorithm

**Beginner rider, groomer-focused:**

| Board | Deal (40%) | Quality/$ (35%) | Availability (25%) | Total |
|-------|-----------|-----------------|-------------------|-------|
| $300 soft rocker, 30% off, 2 retailers | 0.75 | 0.90 (perfect beginner board, below median) | 0.65 | 0.78 |
| $800 stiff camber, 0% off, 1 retailer | 0.10 | 0.10 (wrong specs, overbuilt) | 0.30 | 0.15 |
| $250 soft hybrid, 0% off, 3 retailers | 0.10 | 0.85 (right specs, cheapest in class) | 0.85 | 0.54 |

**Advanced rider, powder-focused:**

| Board | Deal (40%) | Quality/$ (35%) | Availability (25%) | Total |
|-------|-----------|-----------------|-------------------|-------|
| $600 directional stiff, 40% off, 2 retailers | 0.90 | 0.80 (great powder board, good price) | 0.65 | 0.80 |
| $300 soft twin park, 50% off, 3 retailers | 0.95 | 0.15 (wrong terrain/specs) | 0.85 | 0.64 |

### What about a brand value tier mapping?

A static brand-tier mapping (e.g. "Burton/Jones = premium", "Rossignol = mid-tier", "no-name = budget") is **not recommended** as a direct input because:

- It's subjective and hard to maintain
- It correlates strongly with MSRP, which we already have
- It penalizes good budget brands unfairly

However, brand identity is already implicitly captured by MSRP and category-peer comparison. A $350 Burton is already flagged as "below category median" by pillar 2. No separate brand tier needed.

## Implementation notes

- **Pillars 1 + 3** (deal quality, availability) are profile-independent → pre-compute at pipeline time and store on the board.
- **Pillar 2** (quality-per-dollar) depends on the rider → compute at query time from the user's filters (ability level, terrain preference).
- When no filters are set, use a generic intermediate profile (versatility-weighted) as the default.
- Price-vs-category-peers requires a single aggregate query (`AVG(sale_price_usd) GROUP BY category`) computed once per run.
- The existing `beginnerScore` is a special case of pillar 2's spec-fit scoring. Consider replacing it with the generalized version rather than maintaining two parallel scoring systems.
- Write tests with specific board + rider profile scenarios (the examples above) to lock in expected behavior.
- All inputs already exist in the database — no new scraping required.
