import { BoardProfile, BoardShape, BoardCategory } from "./types";

// ===== Profile Normalization Maps =====
// Maps brand-specific profile terminology to our standard enum

export const PROFILE_MAP: Record<string, BoardProfile> = {
  // Standard terms
  camber: BoardProfile.CAMBER,
  "traditional camber": BoardProfile.CAMBER,
  "full camber": BoardProfile.CAMBER,

  rocker: BoardProfile.ROCKER,
  "full rocker": BoardProfile.ROCKER,
  "pure rocker": BoardProfile.ROCKER,
  banana: BoardProfile.ROCKER,
  "catch-free": BoardProfile.ROCKER,

  flat: BoardProfile.FLAT,
  "flat top": BoardProfile.FLAT,
  "zero camber": BoardProfile.FLAT,

  // Hybrid camber-dominant
  "hybrid camber": BoardProfile.HYBRID_CAMBER,
  "camrock": BoardProfile.HYBRID_CAMBER,
  "cam-rock": BoardProfile.HYBRID_CAMBER,
  "directional camber": BoardProfile.HYBRID_CAMBER,
  "camber/rocker": BoardProfile.HYBRID_CAMBER,
  "camber with rocker": BoardProfile.HYBRID_CAMBER,
  "mostly camber": BoardProfile.HYBRID_CAMBER,
  "s-camber": BoardProfile.HYBRID_CAMBER,

  // Hybrid rocker-dominant
  "hybrid rocker": BoardProfile.HYBRID_ROCKER,
  "rocker/camber": BoardProfile.HYBRID_ROCKER,
  "rocker/camber/rocker": BoardProfile.HYBRID_ROCKER,
  "rocker with camber": BoardProfile.HYBRID_ROCKER,
  "mostly rocker": BoardProfile.HYBRID_ROCKER,
  "gullwing": BoardProfile.HYBRID_ROCKER,

  // Flat hybrid variants (Tactics uses these)
  "directional flat with rocker": BoardProfile.HYBRID_ROCKER,
  "flat with rocker": BoardProfile.HYBRID_ROCKER,
  "flat with camber": BoardProfile.HYBRID_CAMBER,
  "flat to rocker": BoardProfile.HYBRID_ROCKER,

  // Burton specific
  "flying v": BoardProfile.HYBRID_ROCKER,
  "pure pop camber": BoardProfile.CAMBER,
  "bend": BoardProfile.ROCKER,
  "directional flat top": BoardProfile.FLAT,
  "flat top (frostbite edges)": BoardProfile.FLAT,

  // Lib Tech specific
  "c2": BoardProfile.HYBRID_CAMBER,
  "c2x": BoardProfile.HYBRID_CAMBER,
  "c2e": BoardProfile.HYBRID_CAMBER,
  "c3": BoardProfile.CAMBER,
  "btx": BoardProfile.HYBRID_ROCKER,
  "b.c.": BoardProfile.HYBRID_ROCKER,

  // GNU specific
  "c2 btx": BoardProfile.HYBRID_CAMBER,
  "c3 btx": BoardProfile.CAMBER,

  // Jones specific
  "camrock 2.0": BoardProfile.HYBRID_CAMBER,
  "directional rocker": BoardProfile.HYBRID_ROCKER,

  // Ride specific
  "performance rocker": BoardProfile.HYBRID_ROCKER,
  "quad rocker": BoardProfile.HYBRID_ROCKER,
  "hybrid all mountain rocker": BoardProfile.HYBRID_ROCKER,

  // Capita specific
  "resort v1": BoardProfile.HYBRID_CAMBER,
  "alpine v1": BoardProfile.HYBRID_CAMBER,
  "park v1": BoardProfile.HYBRID_ROCKER,

  // Arbor specific
  "system camber": BoardProfile.CAMBER,
  "system rocker": BoardProfile.ROCKER,
  "parabolic rocker": BoardProfile.HYBRID_ROCKER,
  "uprise fender": BoardProfile.HYBRID_CAMBER,

  // K2 specific
  "directional baseline": BoardProfile.FLAT,
  "catch free baseline": BoardProfile.FLAT,
  "jib baseline": BoardProfile.FLAT,
  "catch free rocker baseline": BoardProfile.ROCKER,

  // Rossignol specific
  "amptek": BoardProfile.HYBRID_CAMBER,
  "amptek auto-turn rocker": BoardProfile.HYBRID_ROCKER,
};

// ===== Shape Normalization Maps =====

export const SHAPE_MAP: Record<string, BoardShape> = {
  "true twin": BoardShape.TRUE_TWIN,
  twin: BoardShape.TRUE_TWIN,
  "perfectly twin": BoardShape.TRUE_TWIN,
  symmetrical: BoardShape.TRUE_TWIN,

  "directional twin": BoardShape.DIRECTIONAL_TWIN,
  "directional-twin": BoardShape.DIRECTIONAL_TWIN,
  "tapered twin": BoardShape.DIRECTIONAL_TWIN,
  "slight directional twin": BoardShape.DIRECTIONAL_TWIN,

  directional: BoardShape.DIRECTIONAL,
  "fully directional": BoardShape.DIRECTIONAL,

  tapered: BoardShape.TAPERED,
  "tapered directional": BoardShape.TAPERED,
  "directional tapered": BoardShape.TAPERED,
};

// ===== Category Normalization Maps =====

export const CATEGORY_MAP: Record<string, BoardCategory> = {
  "all-mountain": BoardCategory.ALL_MOUNTAIN,
  "all mountain": BoardCategory.ALL_MOUNTAIN,
  "allmountain": BoardCategory.ALL_MOUNTAIN,
  "mountain": BoardCategory.ALL_MOUNTAIN,

  freestyle: BoardCategory.FREESTYLE,
  "free style": BoardCategory.FREESTYLE,

  freeride: BoardCategory.FREERIDE,
  "free ride": BoardCategory.FREERIDE,
  "backcountry": BoardCategory.FREERIDE,

  powder: BoardCategory.POWDER,
  "deep powder": BoardCategory.POWDER,

  park: BoardCategory.PARK,
  "park & pipe": BoardCategory.PARK,
  "park/pipe": BoardCategory.PARK,
  "park / freestyle": BoardCategory.PARK,
  jib: BoardCategory.PARK,
  "park/jib": BoardCategory.PARK,
};

// Keywords that suggest specific categories
export const CATEGORY_KEYWORDS: Record<BoardCategory, string[]> = {
  [BoardCategory.ALL_MOUNTAIN]: [
    "all-mountain", "all mountain", "versatile", "do-it-all", "everyday",
    "quiver of one", "one board quiver",
  ],
  [BoardCategory.FREESTYLE]: [
    "freestyle", "playful", "butter", "jibbing", "tricks",
  ],
  [BoardCategory.FREERIDE]: [
    "freeride", "backcountry", "big mountain", "aggressive",
    "charging", "steep",
  ],
  [BoardCategory.POWDER]: [
    "powder", "deep snow", "float", "surfing",
  ],
  [BoardCategory.PARK]: [
    "park", "pipe", "jib", "rails", "boxes", "halfpipe", "terrain park",
  ],
};
