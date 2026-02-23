import {
  SearchConstraints,
  CanonicalBoard,
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

export function applyConstraints(
  boards: CanonicalBoard[],
  constraints: SearchConstraints
): CanonicalBoard[] {
  return boards.filter((board) => {
    // Length filter — null length does NOT disqualify
    if (board.lengthCm !== null) {
      if (
        constraints.minLengthCm &&
        board.lengthCm < constraints.minLengthCm
      ) {
        return false;
      }
      if (
        constraints.maxLengthCm &&
        board.lengthCm > constraints.maxLengthCm
      ) {
        return false;
      }
    }

    // Price filter
    if (
      constraints.maxPriceUsd &&
      board.salePriceUsd > constraints.maxPriceUsd
    ) {
      return false;
    }
    if (
      constraints.minPriceUsd &&
      board.salePriceUsd < constraints.minPriceUsd
    ) {
      return false;
    }

    // Exclude kids boards
    if (constraints.excludeKids) {
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
      // Kids boards are usually under 140cm
      if (board.lengthCm !== null && board.lengthCm < 130) {
        return false;
      }
    }

    // Exclude women's boards
    if (constraints.excludeWomens) {
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

    // Region filter
    if (
      constraints.regions &&
      constraints.regions.length > 0 &&
      !constraints.regions.includes(board.region)
    ) {
      return false;
    }

    // Retailer filter
    if (
      constraints.retailers &&
      constraints.retailers.length > 0 &&
      !constraints.retailers.includes(board.retailer)
    ) {
      return false;
    }

    return true;
  });
}

export function filterBoardsWithListings(
  boards: BoardWithListings[],
  filters: {
    region?: string;
    maxPrice?: number;
    minLength?: number;
    maxLength?: number;
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
    if (filters.minLength) {
      filteredListings = filteredListings.filter(l => l.lengthCm === null || l.lengthCm >= filters.minLength!);
    }
    if (filters.maxLength) {
      filteredListings = filteredListings.filter(l => l.lengthCm === null || l.lengthCm <= filters.maxLength!);
    }

    if (filteredListings.length === 0) return null;

    const bestPrice = Math.min(...filteredListings.map(l => l.salePriceUsd));
    return { ...board, listings: filteredListings, bestPrice };
  }).filter((b): b is BoardWithListings => b !== null);
}
