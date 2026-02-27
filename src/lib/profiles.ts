import type { RiderProfile } from "./types";

const RIDING_PROFILE_TO_ABILITY: Record<string, string> = {
  beginner: "beginner",
  intermediate_am: "intermediate",
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
