import {
  SearchConstraints,
  BoardWithListings,
  Region,
} from "./types";
import { genderFromKey } from "./db";

export const DEFAULT_CONSTRAINTS: SearchConstraints = {
  minLengthCm: 155,
  maxLengthCm: 161,
  maxPriceUsd: 650,
  minPriceUsd: null,
  preferredProfiles: null,
  preferredCategories: null,
  excludeKids: true,
  excludeWomens: true,
  regions: [Region.US, Region.KR],
  retailers: null,
};

export function filterBoardsWithListings(
  boards: BoardWithListings[],
  filters: {
    region?: string;
    maxPrice?: number;
    minPrice?: number;
    minLength?: number;
    maxLength?: number;
    gender?: string;
    abilityLevel?: string;
    excludeKids?: boolean;
    excludeWomens?: boolean;
  }
): BoardWithListings[] {
  return boards.map((board) => {
    // Boards with no listings skip listing-level filters
    if (board.listings.length === 0) {
      return board;
    }

    let filteredListings = board.listings;

    if (filters.region) {
      filteredListings = filteredListings.filter(l => l.region === filters.region);
    }
    if (filters.maxPrice) {
      filteredListings = filteredListings.filter(l => l.salePriceUsd <= filters.maxPrice!);
    }
    if (filters.minPrice) {
      filteredListings = filteredListings.filter(l => l.salePriceUsd >= filters.minPrice!);
    }
    if (filters.minLength) {
      filteredListings = filteredListings.filter(l => l.lengthCm === null || l.lengthCm >= filters.minLength!);
    }
    if (filters.maxLength) {
      filteredListings = filteredListings.filter(l => l.lengthCm === null || l.lengthCm <= filters.maxLength!);
    }

    if (filteredListings.length === 0) return null;

    const bestPrice = Math.min(...filteredListings.map(l => l.salePriceUsd));
    return { ...board, listings: filteredListings, bestPrice };
  }).filter((b): b is BoardWithListings => b !== null)
    .filter((board) => {
      const boardGender = genderFromKey(board.boardKey);
      // Gender filter
      if (filters.gender) {
        if (filters.gender === "unisex+womens") {
          if (boardGender !== "unisex" && boardGender !== "womens") return false;
        } else if (boardGender !== filters.gender && boardGender !== "unisex") {
          return false;
        }
      }

      // Exclude kids boards
      if (filters.excludeKids) {
        if (boardGender === "kids") return false;
        const lower = `${board.model} ${board.description || ""}`.toLowerCase();
        if (
          lower.includes("kids") ||
          lower.includes("youth") ||
          lower.includes("junior") ||
          lower.includes("grom") ||
          lower.includes("children") ||
          lower.includes("toddler")
        ) {
          return false;
        }
      }

      // Exclude women's boards
      if (filters.excludeWomens) {
        if (boardGender === "womens") return false;
        const lower = `${board.brand} ${board.model} ${board.description || ""}`.toLowerCase();
        if (
          lower.includes("women") ||
          lower.includes("woman") ||
          lower.includes("wmns") ||
          lower.includes("wms")
        ) {
          return false;
        }
      }

      return true;
    })
    .filter((board) => {
      // Ability level filter: show boards whose range includes the selected level
      if (filters.abilityLevel) {
        return abilityRangeIncludes(
          board.abilityLevelMin,
          board.abilityLevelMax,
          filters.abilityLevel
        );
      }
      return true;
    });
}

const ABILITY_ORDER = ["beginner", "intermediate", "advanced", "expert"];

/**
 * Check if a board's ability range includes the target level.
 * "advanced" filter matches both "advanced" and "expert".
 * Boards with no ability data pass through (shown as unknown).
 */
function abilityRangeIncludes(
  min: string | null,
  max: string | null,
  target: string
): boolean {
  if (!min) return true; // no data = don't filter out

  const minIdx = ABILITY_ORDER.indexOf(min);
  const maxIdx = ABILITY_ORDER.indexOf(max ?? min);
  if (minIdx === -1) return true; // unrecognized value = don't filter out

  if (target === "advanced") {
    // "advanced" filter includes both advanced and expert
    const advIdx = ABILITY_ORDER.indexOf("advanced");
    return minIdx <= advIdx + 1 && maxIdx >= advIdx;
  }

  const targetIdx = ABILITY_ORDER.indexOf(target);
  if (targetIdx === -1) return true;
  return minIdx <= targetIdx && maxIdx >= targetIdx;
}
