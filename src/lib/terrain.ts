import { BoardCategory } from "./types";

export interface TerrainScores {
  piste: number | null;
  powder: number | null;
  park: number | null;
  freeride: number | null;
  freestyle: number | null;
}

const TERRAIN_KEYS = ["piste", "powder", "park", "freeride", "freestyle"] as const;

/**
 * Map CAPiTA hexagon scores (1-5 scale) to terrain scores (1-3 scale).
 * CAPiTA axes: jibbing, skill level, powder, groomers, versatility, jumps
 */
export function capitaToTerrain(hexagon: Record<string, number>): TerrainScores {
  const map15to13 = (v: number): number => {
    if (v <= 2) return 1;
    if (v === 3) return 2;
    return 3; // 4-5
  };

  const groomers = hexagon["groomers"] ?? null;
  const powder = hexagon["powder"] ?? null;
  const jibbing = hexagon["jibbing"] ?? null;
  const jumps = hexagon["jumps"] ?? null;
  const versatility = hexagon["versatility"] ?? null;

  // freeride: infer from powder + versatility average
  let freeride: number | null = null;
  if (powder !== null && versatility !== null) {
    freeride = map15to13(Math.round((powder + versatility) / 2));
  } else if (powder !== null) {
    freeride = map15to13(powder);
  }

  return {
    piste: groomers !== null ? map15to13(groomers) : null,
    powder: powder !== null ? map15to13(powder) : null,
    park: jibbing !== null ? map15to13(jibbing) : null,
    freeride,
    freestyle: jumps !== null ? map15to13(jumps) : null,
  };
}

/**
 * Map Jones terrain ratings ("label: val/max", 1-10 scale) to terrain scores (1-3 scale).
 * Jones labels: on-piste, all-mountain, powder, park, freeride, backcountry, freestyle
 */
export function jonesToTerrain(ratings: Record<string, string>): TerrainScores {
  const parse = (key: string): number | null => {
    const val = ratings[key];
    if (!val) return null;
    const m = val.match(/(\d+)\/(\d+)/);
    if (!m) return null;
    return parseInt(m[1]);
  };

  const map110to13 = (v: number): number => {
    if (v <= 3) return 1;
    if (v <= 7) return 2;
    return 3; // 8-10
  };

  // Take the max of related labels
  const pisteRaw = Math.max(parse("on-piste") ?? 0, parse("all-mountain") ?? 0, parse("on-piste / all-mountain") ?? 0) || null;
  const powderRaw = parse("powder") ?? parse("freeride / powder") ?? null;
  const parkRaw = parse("park") ?? parse("freestyle / park") ?? null;
  const freerideRaw = Math.max(parse("freeride") ?? 0, parse("backcountry") ?? 0, parse("freeride / powder") ?? 0) || null;
  const freestyleRaw = parse("freestyle") ?? parse("freestyle / park") ?? null;

  return {
    piste: pisteRaw !== null ? map110to13(pisteRaw) : null,
    powder: powderRaw !== null ? map110to13(powderRaw) : null,
    park: parkRaw !== null ? map110to13(parkRaw) : null,
    freeride: freerideRaw !== null ? map110to13(freerideRaw) : null,
    freestyle: freestyleRaw !== null ? map110to13(freestyleRaw) : null,
  };
}

/**
 * Derive terrain scores from a single category keyword.
 * Used for sources that only provide a category (e.g. retailers, Burton, LibTech).
 */
export function categoryToTerrain(category: BoardCategory | string): TerrainScores {
  switch (category) {
    case BoardCategory.ALL_MOUNTAIN:
    case "all_mountain":
    case "all-mountain":
      return { piste: 3, powder: 2, park: 2, freeride: 2, freestyle: 2 };
    case BoardCategory.FREESTYLE:
    case "freestyle":
      return { piste: 2, powder: 1, park: 2, freeride: 1, freestyle: 3 };
    case BoardCategory.PARK:
    case "park":
      return { piste: 1, powder: 1, park: 3, freeride: 1, freestyle: 2 };
    case BoardCategory.FREERIDE:
    case "freeride":
      return { piste: 2, powder: 3, park: 1, freeride: 3, freestyle: 1 };
    case BoardCategory.POWDER:
    case "powder":
      return { piste: 1, powder: 3, park: 1, freeride: 2, freestyle: 1 };
    default:
      return { piste: null, powder: null, park: null, freeride: null, freestyle: null };
  }
}

/**
 * Derive a single category from terrain scores for backward compatibility.
 * Returns the category matching the highest-scoring dimension.
 */
export function terrainToCategory(scores: TerrainScores): BoardCategory | null {
  const { piste, powder, park, freeride, freestyle } = scores;

  // If all null, can't derive
  if (piste === null && powder === null && park === null && freeride === null && freestyle === null) {
    return null;
  }

  // Find max dimension
  const dims: [string, number | null][] = [
    ["piste", piste],
    ["powder", powder],
    ["park", park],
    ["freeride", freeride],
    ["freestyle", freestyle],
  ];

  let bestDim = "";
  let bestVal = -1;
  for (const [name, val] of dims) {
    if (val !== null && val > bestVal) {
      bestVal = val;
      bestDim = name;
    }
  }

  switch (bestDim) {
    case "piste": return BoardCategory.ALL_MOUNTAIN;
    case "powder": return BoardCategory.POWDER;
    case "park": return BoardCategory.PARK;
    case "freeride": return BoardCategory.FREERIDE;
    case "freestyle": return BoardCategory.FREESTYLE;
    default: return null;
  }
}

export { TERRAIN_KEYS };
