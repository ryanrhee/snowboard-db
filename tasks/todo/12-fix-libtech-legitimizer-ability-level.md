# Task 12: Fix Lib Tech ability level extraction via infographic pixel analysis

## Problem

The Lib Tech manufacturer scraper infers rider ability level from infographic images
(terrain-riderlevel-flex PNGs/JPGs). The current `inferRiderLevelFromInfographic()`
function uses a hardcoded slug→level mapping that was built by visual inspection.
Many of the mappings are wrong.

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

## What to do next

### Step 1: Map gradient coverage to ability levels using spectrum semantics

The rider level bar is a spectrum with three labeled anchor points:
- **0%** = Day 1 (beginner)
- **50%** = Intermediate
- **100%** = Advanced

The `colorStartPct` and `colorEndPct` define the "covered" region of this spectrum.
Ability level should be determined by **which anchor points fall within the covered
region**, not by center of mass or other heuristics.

For example, consider Apex Orca (riderLevel start=21%, end=100%) vs Cold Brew
(start=22%, end=81%). Both cover similar amounts of the left side — both reach
past the 0% anchor into beginner territory. But Cold Brew's coverage stops at 81%
(doesn't reach 100% / Advanced), while Apex Orca extends all the way to 100%.
The current classification calls Cold Brew "beginner-intermediate" and Apex Orca
"intermediate-advanced", but Apex Orca actually covers MORE of the beginner range
than Cold Brew does. The distinction should be based on which endpoints are covered,
not on center of mass.

#### Open questions to resolve before implementing

1. **Where is "beginner" on the spectrum?** The leftmost label is "Day 1" at 0%.
   Is "Day 1" the same as "beginner"? Or is beginner more like 10% or 25%?
   Need to decide what position on the spectrum maps to the "beginner" concept
   used in the ability level taxonomy.

2. **What counts as "covered"?** The gradient's colored region has a start and end.
   If the colored region reaches 30% of the way to an anchor point, is that anchor
   covered? What about 50%? 70%? Need a principled threshold for when an anchor
   point is considered "included" in the board's range. Options:
   - The anchor point itself must fall within `[colorStartPct, colorEndPct]`
   - The colored region must come within N% of the anchor point
   - Use the gradient ramp zone (the transition from gray to color) as a "partial
     coverage" indicator

3. **Does the gradient ramp zone carry semantic meaning?** The flat colored region
   is clearly "covered". But what about the ramp-up and ramp-down zones where
   the color fades to gray? Is a board partially suitable for those ability levels,
   or is the ramp just cosmetic?

These decisions should be informed by looking at the actual data alongside the
infographics and the known ability levels from other sources (The Good Ride, etc.)
to find the interpretation that best matches ground truth.

#### Warning: do NOT use spec_sources manufacturer data as ground truth

The `spec_sources` entries with `source = 'manufacturer'` for Lib Tech ability levels
are the **output** of the `inferRiderLevelFromInfographic()` slug mapping — the very
function this task is replacing. Zero Lib Tech product pages contain ability level
keywords in their description text ("beginner", "intermediate", "advanced"), so the
infographic slug mapping is the sole manufacturer source for every board.

Using these values as ground truth to validate the gradient analysis is circular
reasoning: it would "prove" the gradient can't distinguish ability levels, when
really it just proves the existing slug mapping is inconsistent with the gradient data.

**Independent ground truth sources:**
- `source = 'review-site'` (The Good Ride) — independently assessed ability ranges
- Retailer data (evo, etc.) — when available in spec_sources
- Visual inspection of the infographic images themselves

### Step 2: Replace `inferRiderLevelFromInfographic`

Replace the hardcoded slug→level mapping with the pixel analysis function
(run at scrape time on the actual image), using the spectrum-based ability level
mapping from Step 1.
