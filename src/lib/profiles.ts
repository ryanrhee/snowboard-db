import type { RiderProfile } from "./types";

const RIDING_PROFILE_TO_ABILITY: Record<string, string> = {
  beginner: "beginner",
  intermediate_am_freestyle: "intermediate",
  intermediate_am_freeride: "intermediate",
  advanced_freestyle: "advanced",
  advanced_freeride: "advanced",
  advanced_am: "advanced",
};

export function profileToFilterDefaults(profile: RiderProfile): {
  gender: string;
  abilityLevel: string;
} {
  return {
    gender: profile.genderFilter,
    abilityLevel: RIDING_PROFILE_TO_ABILITY[profile.ridingProfile] ?? "beginner",
  };
}

// ===== Spec Fit Criteria =====

export interface SpecFitCriteria {
  flexRange: [number, number];
  preferredProfiles: string[];
  preferredShapes: string[];
  preferredCategories: string[];
  abilityRange: [string, string];
}

const INTERMEDIATE_AM_FIT: SpecFitCriteria = {
  flexRange: [4, 7],
  preferredProfiles: ["hybrid_camber", "camber"],
  preferredShapes: ["directional_twin", "true_twin"],
  preferredCategories: ["all_mountain"],
  abilityRange: ["intermediate", "advanced"],
};

const SPEC_FIT_MAP: Record<string, SpecFitCriteria> = {
  beginner: {
    flexRange: [1, 4],
    preferredProfiles: ["rocker", "hybrid_rocker", "flat"],
    preferredShapes: ["true_twin", "directional_twin"],
    preferredCategories: ["all_mountain", "freestyle"],
    abilityRange: ["beginner", "intermediate"],
  },
  intermediate_am_freestyle: INTERMEDIATE_AM_FIT,
  intermediate_am_freeride: INTERMEDIATE_AM_FIT,
  advanced_freestyle: {
    flexRange: [4, 6],
    preferredProfiles: ["hybrid_camber", "hybrid_rocker"],
    preferredShapes: ["true_twin"],
    preferredCategories: ["freestyle", "park"],
    abilityRange: ["advanced", "expert"],
  },
  advanced_freeride: {
    flexRange: [7, 10],
    preferredProfiles: ["camber", "hybrid_camber"],
    preferredShapes: ["directional", "tapered"],
    preferredCategories: ["freeride", "powder"],
    abilityRange: ["advanced", "expert"],
  },
  advanced_am: {
    flexRange: [5, 8],
    preferredProfiles: ["camber", "hybrid_camber"],
    preferredShapes: ["directional_twin"],
    preferredCategories: ["all_mountain"],
    abilityRange: ["advanced", "expert"],
  },
};

export const ALL_RIDING_PROFILES = Object.keys(SPEC_FIT_MAP);

export function getSpecFitCriteria(ridingProfile: string): SpecFitCriteria {
  return SPEC_FIT_MAP[ridingProfile] ?? SPEC_FIT_MAP.beginner;
}
