# Task 27: Replace single category with multi-dimensional terrain scores

## Problem

`category` is currently a single enum value (all_mountain, freestyle, freeride, powder, park). Most boards span multiple terrain types — an "all-mountain freestyle" board is strong on groomers and in the park but weak in powder. The single-category model loses this nuance.

Several scrapers already extract multi-dimensional terrain data that gets collapsed to one value:
- **CAPiTA**: 6-axis hexagon scores (jibbing, powder, groomers, jumps, versatility, skill) on a 1–5 scale
- **Jones**: 7 terrain ratings (on-piste, all-mountain, freeride, powder, freestyle, park, backcountry) on a 1–10 scale
- **Burton**: single terrain label
- **Lib Tech / GNU / others**: category inferred from keywords

This data is stored in `extras` but unused — only the single highest-scoring category survives normalization.

## Goal

Replace the single `category` field with a set of terrain dimension scores (1–3 scale: 1 = weak, 2 = decent, 3 = strong).

## Proposed dimensions

Based on what manufacturer data sources provide and standard snowboard terrain categories:

| Dimension | Description | Maps from |
|-----------|-------------|-----------|
| **piste** | Groomed runs, carving | CAPiTA groomers, Jones on-piste/all-mountain |
| **powder** | Deep snow, float | CAPiTA powder, Jones powder |
| **park** | Park & pipe, jibbing | CAPiTA jibbing, Jones park/freestyle |
| **freeride** | Off-piste, backcountry, steep | Jones freeride/backcountry |
| **freestyle** | Jumps, tricks, playfulness | CAPiTA jumps, Jones freestyle |

## Approach

1. **Define terrain score type**: `TerrainScores = { piste: 1|2|3, powder: 1|2|3, park: 1|2|3, freeride: 1|2|3, freestyle: 1|2|3 }`.
2. **Map existing multi-dimensional data**: Convert CAPiTA (1–5) and Jones (1–10) scales to 1–3. Store in `spec_sources` as individual fields (e.g. `field: "terrain_piste"`, `value: "3"`).
3. **Map single-category sources**: When only a single category is known (Burton, review sites, keyword-derived), set that dimension to 3 and others to a reasonable default (1 or 2 depending on the category — e.g. "all_mountain" → piste: 3, powder: 2, park: 2, freeride: 2, freestyle: 2).
4. **Update spec_sources**: Add `terrain_piste`, `terrain_powder`, `terrain_park`, `terrain_freeride`, `terrain_freestyle` as spec_sources fields.
5. **Update the UI**: Replace the single category badge with a compact multi-axis display (e.g. small bar chart, radar chart, or inline score like "P3 W2 K1 F2 S2").
6. **Update scoring**: `calcBeginnerScoreForBoard` currently boosts/penalizes based on category. Update to use terrain scores instead (e.g. high park score → more beginner-friendly, high freeride → less).

## Considerations

- The 1–3 scale is deliberately coarse — finer granularity implies false precision when most sources only provide a keyword or rough rating.
- "All-mountain" as a category goes away — it's expressed as balanced scores across dimensions (e.g. 2/2/2/2/2 or 3/2/2/2/2).
- This interacts with Task 24 (collapsing specs into spec_sources) — terrain scores would be additional spec_sources fields.
- Multi-source resolution applies: if CAPiTA says powder: 3 and a review site says powder: 2, manufacturer wins by priority.
