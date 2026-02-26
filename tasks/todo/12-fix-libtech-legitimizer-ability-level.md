# Task 12: Extract Lib Tech and GNU specs from infographic pixel analysis

## Problem

Lib Tech and GNU both use infographic images that encode terrain, rider level/ability, and flex as colored gradient bars. The current approach uses a hardcoded slug→level mapping (`inferRiderLevelFromInfographic()`) that is incomplete and often wrong. The gradient fitting infrastructure is already built and working (see below), but only targets rider level for Lib Tech.

This task covers extracting **all three properties** (terrain, rider level, flex) from infographics for **both Lib Tech and GNU**.

## What we've done

### 1. Built an audit page (`/lt-infographics`)

- **API route** (`src/app/api/lt-infographics/route.ts`): Extracts infographic URLs
  from cached HTML, fetches each image, runs pixel analysis, returns JSON.
- **Page** (`src/app/lt-infographics/page.tsx`): Shows original infographic
  side-by-side with a CSS `linear-gradient` reconstruction, plus the fitted parameters.

### 2. Built a gradient fitting function (`src/lib/manufacturers/lib-tech-infographic.ts`)

Discovered that every Lib Tech infographic bar is a **linear blend** between a neutral
gray `(148,149,152)` and a single theme color. The blend factor `t(x)` is trapezoidal:
gray → ramp up → flat at full color → ramp down → gray.

### 3. Improved gradient fitting accuracy

Reduced fit errors from 0.8–5.5 to 0.5–3.3 per channel across all 23 boards via four changes:

#### a. Linear-light color space blending
The infographic gradients are authored in linear-light color space (standard for
Photoshop/Illustrator), not sRGB. Switched the blend factor computation and error
calculation to decode sRGB→linear before projecting. This fixed the biggest outlier
(Skate Banana terrain: 5.2 → 0.9) by eliminating the non-linear gamma distortion
that caused systematic errors of 10-20 per channel in transition zones.

#### b. Two-pass theme color refinement
Instead of using the canonical color or raw roughColor for fitting:
1. Pass 1: Rough detect color (top 10% saturation), find flat region (t > 0.95)
2. Pass 2: Average the actual flat-region pixel colors for a precise per-board
   theme color, then recompute blend factors and error

This fixed Skunk Ape terrain (4.9 → 1.1) and T.Rice Pro terrain (3.5 → 1.2)
where the actual orange differed from canonical by just 2-3 sRGB units — but the
sRGB→linear transform amplified this near dark channels (blue ≈ 27-29).

#### c. Per-pixel black/white filtering
Each of 5 sampled rows is filtered per-pixel before averaging: black text pixels
(avg < 50) and white background (avg > 240) are excluded. White border columns
naturally produce no sample and are skipped entirely, eliminating the need for
separate edge trimming. Percentages are computed relative to the detected bar bounds.

#### d. Multi-row averaging
Samples 5 rows around each bar Y position (offsets -4, -2, 0, +2, +4) and averages
their RGB values to smooth JPEG compression artifacts.

### 4. Current fit error results

| Range | Count | Boards |
|-------|-------|--------|
| 0.5–1.0 | 19 bars | Best fits (Skate Banana terrain 0.9, Lib Rig terrain 0.8, etc.) |
| 1.0–2.0 | 38 bars | Most bars (orange/blue families) |
| 2.0–2.5 | 7 bars | Moderate (Dynamo terrain, dPr terrain, etc.) |
| 2.5–3.3 | 5 bars | Highest remaining (Dynamo/Ejack Knife red riderLevel/flex) |

Worst remaining bar: Dynamo flex at 3.3 (irreducible transition-zone error in red gradients).

### 5. Key findings from the data

The rider level bar (Day 1 → Intermediate → Advanced) shows these clusters:

| colorStart | colorEnd | Boards |
|------------|----------|--------|
| 0%         | 77%      | Skate Banana |
| 21–24%     | 81–100%  | Apex Orca, Cold Brew, Skunk Ape, Terrain Wrecker, Golden Orca |
| 29–30%     | 81–82%   | Escalator |
| 32–33%     | 100%     | Dynamo, Ejack Knife, Jamie Lynn, Doughboy, dPr, Legitimizer, Lib Rig, LibZilla, Rad Ripper, Rocket, Off Ramp, Skunk Ape Camber |
| 36–39%     | 99–100%  | Rasman, T.Rice Orca, T.Rice Pro, Orca Techno Split |

All blue boards (peak sat ~0.56) have **identical** rider level gradients (colorStart≈32%, colorEnd=100%).

### 6. External ground truth research (2026-02-24)

Gathered ability level ratings from The Good Ride, evo, Whitelines, SnowboardHow,
Old Guys Rip Too, Blauer Board Shop, and others. Compared against gradient clusters.

#### Important note on colorStartPct

`colorStartPct` is the LEFT edge of the **flat (t > 0.95) region**, not where color
first appears. The gradient ramp starts even earlier. For example, Apex Orca at
`colorStartPct=21%` means color is at 95%+ intensity by 21%; the ramp from gray
likely starts around 5-10%.

#### Review-site consensus vs gradient clusters

| Board | Start% | End% | The Good Ride | Other Sources | Old Slug |
|-------|--------|------|---------------|---------------|----------|
| **Cluster 1** |
| Skate Banana | 0 | 77 | Beginner-Expert | evo: Beginner-Intermediate | beginner-advanced |
| **Cluster 2** |
| Apex Orca | 21 | 100 | Beginner-Expert | | intermediate-advanced |
| Cold Brew | 22 | 81 | Beginner/Intermediate | | beginner-intermediate |
| Terrain Wrecker | 22 | 100 | Beginner-Expert | | beginner-advanced |
| Golden Orca | 24 | 100 | Beginner-Expert | | intermediate-advanced |
| Skunk Ape | 24 | 100 | Beginner-Expert | | beginner-intermediate |
| **Cluster 3** |
| Escalator | 29 | 81 | (touring board, implied int-adv) | | beginner-intermediate |
| **Cluster 4** |
| Legitimizer | 32 | 100 | Beginner-Expert | | beginner-intermediate |
| Jamie Lynn | 32 | 100 | Advanced-Expert | | beginner-advanced |
| Dynamo | 32 | 100 | Advanced-Expert | | intermediate-advanced |
| EJack Knife | 32 | 100 | Advanced-Expert | | intermediate-advanced |
| Doughboy | 32 | 100 | Expert | Blauer: Adv-Expert | beginner-intermediate |
| Rad Ripper | 32 | 100 | | OGRT: Int-Adv | beginner-intermediate |
| Mayhem Rocket | 32 | 100 | Advanced-Expert | | beginner-intermediate |
| Lib Rig | 32 | 100 | Intermediate-Expert | | beginner-intermediate |
| **Cluster 5** |
| T.Rice Pro | 36 | 100 | Advanced-Expert | SnowboardHow: Adv-Expert | beginner-advanced |
| T.Rice Orca | 36 | 100 | Intermediate-Expert | | intermediate-advanced |
| Rasman | 36 | 100 | | Whitelines: Int-Adv | beginner-advanced |
| Orca Techno Split | 36 | 100 | | (implied int-adv) | intermediate-advanced |

#### Key observations

1. **Natural gap at 24-29%.** Cluster 2 (start ≤ 24%) and Cluster 3 (start ≥ 29%)
   have a clear gap. Any threshold in this range separates beginner-covering from
   non-beginner boards.

2. **All boards have end ≥ 77%.** The end position doesn't meaningfully discriminate
   — every board reaches well past intermediate (50%) toward advanced.

3. **Cluster 4 (start 32-33%) is inherently ambiguous.** Same gradient position
   contains Legitimizer (Beginner-Expert per TGR) and Jamie Lynn/Dynamo/Doughboy
   (Advanced-Expert per TGR). The gradient cannot distinguish these. Spec resolution
   with review-site data handles the disagreement.

4. **The Good Ride uses very broad ranges.** They rate many boards "Beginner-Expert."
   Other sources (SnowboardHow, Whitelines, OGRT) give narrower, more discriminating
   ratings that often skew higher than TGR.

5. **evo uses more conservative ratings.** Skate Banana is "Beginner-Intermediate"
   on evo (not beginner-advanced). Need to check more evo detail pages to understand
   their scale. Initial impression: evo may rate everything with start ≥ 20% as
   intermediate.

#### Warning: do NOT use spec_sources manufacturer data as ground truth

The `spec_sources` entries with `source = 'manufacturer'` for Lib Tech ability levels
are the **output** of the `inferRiderLevelFromInfographic()` slug mapping — the very
function this task is replacing. Using these as ground truth is circular reasoning.

#### Finalized thresholds (validated 2026-02-26)

**T1 = 10%, T2 = 85%** — unified for both ability level and terrain bars.

Cross-referenced infographic bar positions against evo, backcountry, and TGR
ability level ratings for all Lib Tech and GNU boards. Key findings:

- **Ability level:** Natural data gap at 1-16% (only 0% is beginner, next is 17%).
  evo/backcountry consistently rate boards with start ≥ 17% as intermediate+.
  T1=10% cleanly separates. For end, boards at ≤84% don't reach the Advanced
  label per manufacturer intent; T2=85% matches where retailers start saying
  "advanced" or "expert."

- **Terrain:** Boards with terrain start 0-9% are freestyle/park-leaning per evo.
  Boards at 14%+ are All-Mountain. T1=10% captures this. For end, boards at
  ≤84% are "All-Mountain" per evo; 85%+ triggers Freeride/Powder labels.

##### Ability level mapping (range)

- `startPct ≤ 10%` → min = beginner
- `10% < startPct < 85%` → min = intermediate
- `startPct ≥ 85%` → min = advanced
- `endPct ≤ 10%` → max = beginner
- `10% < endPct < 85%` → max = intermediate
- `endPct ≥ 85%` → max = advanced

##### Terrain mapping (3-point scores via 3-zone model)

Three zones: A (0–10% = Park), B (10–85% = All Mtn), C (85–100% = Backcountry).
A bar spanning startPct→endPct scores each terrain dimension based on which
zones it enters:

- park/freestyle: **3** if bar enters Zone A, **2** if only B, **1** if only C
- piste: **3** if bar enters Zone B, **2** if adjacent, **1** if bar is narrow and far
- powder/freeride: **3** if bar enters Zone C, **2** if only B, **1** if only A

##### Flex mapping (validated 2026-02-26)

Flex is a point value, not a range. The infographic flex bar spans startPct→endPct
on a Soft (0%) → Medium (50%) → Stiff (100%) scale.

**Use bar midpoint → 1-10 scale:** `flexRating = Math.round(midpoint / 10)` where
`midpoint = (startPct + endPct) / 2`.

Cross-referenced midpoints against TGR, evo, backcountry, and tactics flex ratings
for all 46 Lib Tech and GNU boards with infographic data:

| Midpoint range | Retailer consensus | Example boards |
|----------------|-------------------|----------------|
| < 50 | Medium Soft / Medium | Fiction (39), Skate Banana (44), Facts (44) |
| 50–62 | Medium | Cold Brew (58), T.Rice Pro (58), Money (51) |
| 63–68 | Medium Stiff / Stiff | LibZilla (63), Jamie Lynn (64), Sweetfish (66) |
| 73+ | Firm / Stiff | 4x4 (73), Banked Country (73), Wagyu (75) |

**Bar width is not useful.** Width varies from 8 (LibZilla) to 69 (C Money,
Antigravity) but does not correlate with any external flex metric. Hypotheses
tested and rejected: flex-across-sizes (widths would be uniform), nose-to-tail
variation (no correlation with board type), versatility (weak at best).

**Note:** The mid=57-60 cluster contains 15+ Lib Tech boards that retailers rate
anywhere from "Medium/Soft" (Legitimizer) to "Medium Stiff" (Skunk Ape Camber).
The infographic lacks resolution to differentiate within this range. Spec
resolution with retailer/review data handles the disambiguation.

**Note:** backcountry.com says "Medium, Stiff" for nearly every Lib Tech board
regardless of actual flex. Treat as template noise during spec resolution.

## What to do next

### Step 1: Validate thresholds against retailer detail page data ✅

Cross-referenced all Lib Tech and GNU infographic bar positions against evo,
backcountry, and TGR ability level and terrain data. Finalized T1=10%, T2=85%.

### Step 2: Finalize thresholds ✅

See "Finalized thresholds" section above.

### Step 3: Extract all 3 bar properties, not just rider level

The infographic contains 3 bars: terrain, rider level, and flex. Currently only
rider level is analyzed. Extend `analyzeInfographic()` to return all 3 bars and
map each to the corresponding spec field:
- **Rider level bar** → ability level range (beginner/intermediate/advanced via T1=10%, T2=85%)
- **Terrain bar** → terrain scores (3-zone model → 5-dimension TerrainScores, 1-3 scale)
- **Flex bar** → flex rating (midpoint / 10, rounded to 1-10 scale)

### Step 4: Add GNU infographic support ✅

GNU uses a different infographic format from Lib Tech — lens/almond-shaped gradient
shapes positioned above black scale borders, rather than gray-to-color gradient bars.

**Done (2026-02-25):**
- Created `src/lib/manufacturers/gnu-infographic.ts` with border-detection algorithm:
  - Finds horizontal scale borders (rows where >90% of pixels are black)
  - Clusters borders with proportional gap threshold (10% of image height)
  - Searches upward from each border's top edge to find the gradient shape
  - Measures left/right extent of colored pixels with density filtering (>15% of scale width)
  - Returns `startPct`/`endPct` for each of 3 bars (terrain, rider level, flex)
- Created audit page (`/gnu-infographics`) and API route (`/api/gnu-infographics`)
- Handles both 1x (~1000px) and 2x (~2370px) resolution images
- Tested on all 20 GNU boards — all return plausible, differentiated values
- Key validation: Money terrain 5-71% (expected ~0-75%), Antigravity terrain 22-88% (expected ~17-91%)

### Step 5: Implement the mapping and replace slug function (partially done)

**Done (2026-02-25):**
- Removed `inferRiderLevelFromInfographic()` from both `lib-tech.ts` and `gnu.ts`
- Removed slug-based ability level inference, description-text ability level extraction,
  and flex extraction from spec tables in both scrapers (flex/terrain/ability are now
  infographic-only properties)
- Removed all `inferRiderLevelFromInfographic` tests
- Updated infographic audit pages to drop the slug-mapped level column
- Added manufacturer + retailer links under board names on both audit pages

**Remaining:**
- Add ability level mapping function using T1=10%, T2=85% thresholds
- Add terrain mapping function (3-zone → TerrainScores)
- Add flex mapping function: `Math.round(((startPct + endPct) / 2) / 10)` → 1-10
- Wire infographic analysis into the scraper pipeline so boards get
  terrain/ability/flex from pixel analysis during `scrapeSpecs()`
