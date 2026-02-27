# Task 49: User profiles with pre-filled search queries and profile-aware scoring

## Concept

Users define rider profiles (themselves, family members, friends). Each profile captures the rider's physical attributes and ability level. The UI pre-fills search filters based on who you're searching for, and the value score (task 48) is computed relative to that rider's needs.

## Rider profiles

A profile contains:

```ts
interface RiderProfile {
  name: string;              // "Me", "Sarah", etc.
  heightCm: number;          // Used for board length recommendation
  weightKg: number;          // Used for board length + flex recommendation
  genderFilter: "unisex" | "womens" | "unisex+womens" | "kids";  // Which boards to show (see below)
  ridingProfile: RidingProfile;  // One of the 5 profiles below
}
```

### Gender filter semantics

Boards in the database are tagged as `unisex` (the default/mens), `womens`, or `kids`. The gender filter controls which boards appear in results:

| Filter value | Shows | Typical use |
|-------------|-------|-------------|
| `"unisex"` | Unisex boards only | Men (default) |
| `"womens"` | Womens boards only | Women who specifically want womens boards |
| `"unisex+womens"` | Unisex + womens | Women open to either; the common recommendation |
| `"kids"` | Kids boards only | Children |

Notes:
- "Mens" boards don't exist as a category — they're unisex. The industry labels them "mens" but they're the default sizing.
- Women riding unisex boards is standard and recommended. `"unisex+womens"` is the right default for women.
- `"womens"` as a filter is for women who specifically prefer the narrower waist width and softer flex of womens-specific boards.
- Men riding womens boards is physically fine but uncommon (sizing/flex is designed for lighter riders). The UI doesn't prevent it, but it's not a default recommendation.
- Kids boards are a separate category entirely — different sizing, different flex, different price range. Never mixed with adult results.

### The 5 riding profiles

| Profile | Ability | Terrain focus | Ideal board specs | Who this is |
|---------|---------|--------------|-------------------|-------------|
| **Beginner** | beginner | Groomers only | Soft flex (1-4), rocker/hybrid rocker, true twin or directional twin | First-timer or first-season rider learning turns |
| **Intermediate all-mountain** | intermediate | Groomers + exploring off-piste | Medium flex (4-6), hybrid camber, directional twin, all-mountain category | Comfortable on blues/blacks, wants to try everything |
| **Advanced freestyle** | advanced | Park + pipe + jibs | Medium flex (4-6), true twin, hybrid camber/rocker, park/freestyle category | Hitting features, spinning, riding switch |
| **Advanced freeride** | advanced–expert | Powder + backcountry + steeps | Stiff flex (7-10), directional, camber or hybrid camber, freeride/powder category | Chasing storms, hiking sidecountry, charging |
| **Advanced all-mountain** | advanced–expert | Everything, performance-focused | Medium-stiff flex (5-8), directional twin, camber/hybrid camber, all-mountain category | Strong rider who wants one quiver-killer board |

These 5 cover the realistic spectrum without over-segmenting. A few notes:

- **No "expert park"** — at expert level, park riders are very specific about board choice and don't need a recommendation engine. The advanced freestyle profile covers 90% of park riders.
- **No "powder-only"** — the freeride profile covers powder. True splitboard/backcountry touring is a different product category we don't scrape.
- **Intermediate doesn't split by terrain** — intermediates are still generalizing. Their best value is a versatile board, not a niche one.

## How profiles change the UI

### Profile switcher

Top of the search page: a row of profile chips/tabs. Click one to activate that profile's pre-filled filters.

```
[ 🏂 Me (beginner) ]  [ 🏂 Sarah (intermediate) ]  [ + Add profile ]
```

### Pre-filled filters per profile

When a profile is selected, the search filters auto-populate:

| Filter | Beginner (me) | Intermediate (Sarah) |
|--------|--------------|---------------------|
| Gender | Unisex | Unisex + womens |
| Ability level | Beginner | Intermediate |
| Board length | 155-160cm (from height/weight) | 145-150cm (from height/weight) |
| Flex range | 1-4 | 4-6 |
| Category | All-mountain | All-mountain |
| Sort by | Value (profile-aware) | Value (profile-aware) |

The user can still manually adjust any filter after pre-fill. The profile just sets sensible defaults.

### Board length from height/weight

Standard sizing heuristic:

```
Base length = height_cm - 15cm  (chin height)
Adjust for weight:
  - Light for height (BMI < 20): subtract 3-5cm
  - Heavy for height (BMI > 27): add 3-5cm
Adjust for ability:
  - Beginner: subtract 3-5cm (shorter = easier to turn)
  - Advanced freeride: add 3-5cm (longer = more float/stability)
Range: base ± 3cm
```

This gives a length filter range, not a single value. The user sees e.g. "155-160cm" and can widen/narrow it.

## How profiles change the value score (task 48, pillar 2)

The quality-per-dollar pillar evaluates **spec fit** — how well a board's specs match what the rider needs. Each riding profile defines ideal spec ranges:

```ts
interface SpecFitCriteria {
  flexRange: [number, number];       // ideal flex range
  preferredProfiles: BoardProfile[]; // camber, rocker, hybrid, etc.
  preferredShapes: BoardShape[];     // twin, directional, etc.
  preferredCategories: BoardCategory[];
  terrainWeights: TerrainScores;     // which terrain dimensions matter
  abilityMatch: [string, string];    // min/max ability level to match
}
```

**Spec fit score** = how many of the board's specs fall within the profile's ideal ranges. A board that matches on flex + profile + shape + category + ability scores 1.0. One that misses on everything scores 0.1.

Only profiles that exist in the system need their spec-fit criteria computed. If you only have a beginner and an intermediate profile, the three advanced profiles' criteria are never evaluated.

## Storage

Profiles are stored in `localStorage` (client-side only). No server-side storage needed — this is a personal tool, not a multi-user app. Schema:

```ts
interface StoredProfiles {
  profiles: RiderProfile[];
  activeProfileIndex: number;
}
```

## Relationship to task 48

Task 48 redesigns the value score into three pillars:
- Pillar 1 (deal quality) — profile-independent, pre-computed
- Pillar 2 (quality-per-dollar / spec fit) — **profile-dependent, uses this task's riding profiles**
- Pillar 3 (availability) — profile-independent, pre-computed

This task provides the rider profile data that pillar 2 needs. Task 48 should be updated to reference this task for the profile definitions.

## Implementation order

1. Define the `RiderProfile` and `SpecFitCriteria` types
2. Add localStorage persistence for profiles
3. Build profile switcher UI component
4. Wire profile selection → filter pre-fill
5. Implement board length heuristic from height/weight
6. Implement spec-fit scoring per profile (feeds into task 48's pillar 2)
