import {
  SearchConstraints,
  BoardWithListings,
  Region,
} from "./types";

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
    excludeKids?: boolean;
    excludeWomens?: boolean;
  }
): BoardWithListings[] {
  return boards.map((board) => {
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
      // Gender filter
      if (filters.gender && board.gender !== filters.gender && board.gender !== "unisex") {
        return false;
      }

      // Exclude kids boards
      if (filters.excludeKids) {
        if (board.gender === "kids") return false;
        const lower = `${board.model} ${board.description || ""}`.toLowerCase();
        if (
          lower.includes("kids") ||
          lower.includes("youth") ||
          lower.includes("junior") ||
          lower.includes("grom") ||
          lower.includes("children")
        ) {
          return false;
        }
      }

      // Exclude women's boards
      if (filters.excludeWomens) {
        if (board.gender === "womens") return false;
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
    });
}
