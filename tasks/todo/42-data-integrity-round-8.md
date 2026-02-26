# Task 42: Data integrity fixes round 8: profile normalization, kids dupes, model casing, compound profiles

Pipeline snapshot: 504 boards, 3274 listings, 34 brands.

## Issues

### 1. Profile not normalized (255 of 504 boards)

Over half the boards store raw retailer profile strings (`"Hybrid Camber"`, `"Camber with Rocker"`, `"Rocker / Reverse Camber"`) instead of the canonical enum values (`hybrid_camber`, `camber`, `rocker`, `hybrid_rocker`, `flat`). The `normalizeProfile()` function in `src/lib/normalization.ts` exists but isn't being applied during the resolve/upsert step for boards whose profile comes from retailer spec sources.

Normalized: 237 boards. Un-normalized: 255 boards. Missing: 12 boards.

Examples of un-normalized values that should map to existing enums:
- `"Hybrid Camber"` → `hybrid_camber` (59 boards)
- `"Camber"` → `camber` (92 boards)
- `"Full Rocker"` → `rocker` (11 boards)
- `"Hybrid Rocker"` → `hybrid_rocker` (10 boards)
- `"Flat"` → `flat` (5 boards)
- `"Camber/Rocker"` → `hybrid_camber` (8 boards)
- `"Camber with Rocker"` → `hybrid_camber` (5 boards)
- `"Rocker with Camber"` → `hybrid_camber` (4 boards)

### 2. Jones kids board duplicates

**Happy Mountain**: Two entries for the same board:
- `jones|happy mountain|kids` (1 listing, `/kids-happy-mountain-package-2026`)
- `jones|kid's happy mountain|kids` (1 listing, `/kid-happy-mountain-snowboard-2026`)

The `"Kid's"` prefix with apostrophe isn't being stripped by `stripGenderPrefix()` in shared normalization, which only handles `"Kids'"` (trailing apostrophe).

**Youth Prodigy**: REI uses "Youth Prodigy" while other retailers use "Prodigy":
- `jones|youth prodigy|kids` (1 listing from REI)
- `jones|prodigy|kids` (20 listings)

The `"Youth"` prefix isn't being stripped from model names for kids boards.

### 3. Model display name casing inconsistencies

Several boards have all-lowercase or mixed ALL-CAPS display names because the first source scraped determines the display name, and some sources use non-standard casing:

| Key | Display model | Expected |
|---|---|---|
| `lib tech\|son of birdman c2` | `son of birdman C2` | `Son of Birdman C2` |
| `capita\|spring break slush slashers` | `spring break SLUSH SLASHERS` | `Spring Break Slush Slashers` |
| `capita\|spring break powder glider` | `spring break POWDER GLIDER` | `Spring Break Powder Glider` |
| `burton\|3d fish directional` | `3d fish directional` | `3D Fish Directional` |
| `yes.\|hell yes` | `hell yes` | `Hell Yes` |

CAPiTA's Shopify JSON returns model names in inconsistent casing. The display name should be title-cased or use the manufacturer's canonical casing.

### 4. Compound/dual profile values (21 boards)

Backcountry combines multiple attribute values with commas, producing profiles like:
- `"Hybrid Rocker, Hybrid Camber"` (12 boards — mostly Never Summer)
- `"Flat, Hybrid Flat"` (1 board)
- `"Flat, Hybrid Flat, Hybrid Rocker"` (1 board)
- `"Camber, Hybrid Rocker"` (1 board)
- `"System Camber, Fender 3°"` (1 board — Arbor)

These should be resolved to a single canonical profile value. For dual values, the first (dominant) profile is typically the correct one.

### 5. Flex data very sparse (310 of 504 boards missing)

61% of boards have no flex value. Primary causes:
- Evo's specs are client-rendered (empty in server HTML cached by the scraper)
- Not all retailers provide flex data consistently
- Manufacturer infographic analysis only works for Mervin brands

This is a known limitation but worth noting. Potential improvement: extract flex from The Good Ride reviews or add LLM enrichment for missing flex values.

## Files

- `src/lib/normalization.ts` — `normalizeProfile()`, `detectGender()`
- `src/lib/strategies/shared.ts` — `stripGenderPrefix()`, `stripGenderSuffix()`
- `src/lib/scrapers/coalesce.ts` — board upsert logic where profile is stored
- `src/lib/pipeline.ts` — resolve step
- `src/lib/retailers/backcountry.ts` — compound attribute combining

## Related

- Task 41: Backcountry generic profile → spurious Mervin contour variants (C2 vs C2X/C2E)
- Task 39: Previous data integrity rounds
