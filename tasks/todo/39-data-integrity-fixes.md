# Task 39: Fix board data integrity issues

## Problem

Analysis of the `boards` table (544 boards) revealed multiple categories of data integrity issues caused by inconsistent board key normalization in the scraping pipeline.

## Issues

### 1. Zero-width characters creating phantom duplicates (3 boards)

Invisible Unicode characters (U+200B zero-width space) in board keys create exact duplicates with split data:

- `bataleon|evil twin|unisex` + `bataleon|evil twin​|unisex` (with hidden U+200B)
- `bataleon|goliath|unisex` + `bataleon|goliath​|unisex`
- `bataleon|push up|womens` + `bataleon|push up​|womens`

**Fix:** Strip zero-width characters during board key normalization.

### 2. Brand name parsing errors (6 boards)

Multi-word brand names split incorrectly at the first space:

- `never|summer valhalla|unisex` → should be `never summer|valhalla|unisex`
- `united|shapes cadet|unisex` → `united shapes|cadet|unisex` (5 boards: cadet, deep reach, experiment, horizon, transmission)

**Fix:** Ensure the brand normalization lookup handles "Never Summer" and "United Shapes" before the brand/model split.

### 3. True duplicate boards — same product, different keys (20+ pairs)

Same board appearing under two different normalized names. Some have conflicting spec values.

**Punctuation/formatting differences:**
- `salomon|hps - goop` vs `salomon|hps goop` (conflicting profiles: `hybrid_rocker` vs `Camber with Rocker`)
- `capita|super d.o.a.` vs `capita|super doa` (conflicting profiles: `hybrid_camber` vs `hybrid_rocker`)
- `gnu|gloss c` vs `gnu|gloss-c` (conflicting profiles: `camber` vs `hybrid_camber`)

**Article/prefix differences:**
- `lib tech|son of a birdman` vs `lib tech|son of birdman`
- `burton|the throwback` vs `burton|throwback`
- `capita|black of death` vs `capita|the black of death`

**"kids" prefix duplication:**
- `burton|custom smalls` vs `burton|kids custom smalls`
- `burton|grom` vs `burton|kids grom`
- `capita|kids micro mini` vs `capita|micro mini`
- `capita|kids scott stevens mini` vs `capita|scott stevens mini`

**Abbreviation differences:**
- `capita|mega mercury` vs `capita|mega merc`
- `capita|sb *` vs `capita|spring break *` (5 pairs: powder racers, powder twin, resort twin, slush slashers, stairmaster)
- `public|outreach` vs `public|snowboards outreach` (+ research)

**Version/variant that may or may not be the same board:**
- `jones|dreamweaver` vs `jones|dream weaver 2.0`

### 4. Orphan boards with no listings (3 boards)

- `burton|custom|unisex`
- `burton|feelgood|womens`
- `burton|process|unisex`

These exist in `boards` but have zero rows in `listings`. Likely remnants of a previous pipeline run or naming change.

## Approach

The root cause is in the board key normalization logic. Fixes should go there so issues don't recur on re-scrape.

1. **Find the normalization code** — likely in `src/lib/pipeline.ts` or a shared utility that builds `board_key` from scraped data.
2. **Add zero-width character stripping** — strip `\u200b`, `\u200c`, `\u200d`, `\ufeff`, `\u00ad` from all board key components.
3. **Fix multi-word brand lookup** — ensure "Never Summer", "United Shapes", and any other multi-word brands are recognized before the brand/model split.
4. **Add duplicate normalization rules** — canonicalize known aliases:
   - Strip leading "the " from model names
   - Normalize "hps - goop" → "hps goop" (strip hyphens surrounded by spaces)
   - Normalize "d.o.a." → "doa" (strip periods)
   - Normalize "gloss-c" → "gloss c" (hyphens to spaces in model names)
   - Normalize "sb " → "spring break " for Capita
   - Strip leading "kids " when gender is already "kids"
   - Normalize "snowboards " prefix for Public brand
   - Canonicalize "mega merc" → "mega mercury" (or vice versa)
5. **Clean up orphan boards** — delete boards with no listings, or investigate why they lost their listings.
6. **Write a validation script** that can be run after pipeline runs to catch new duplicates.

## Out of scope

- Spec conflicts across sources (1,851 conflicts) — this is a separate resolution/judgment issue, not a normalization bug.
- Missing `ability_level` field (empty for all 544 boards) — not populated by any source yet.
- Missing flex for 349 boards — most are from retailers that don't provide structured flex.
