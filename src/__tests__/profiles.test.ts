import { describe, it, expect, vi } from "vitest";
import { profileToFilterDefaults } from "../lib/profiles";
import { filterBoardsWithListings } from "../lib/constraints";
import type { RiderProfile } from "../lib/types";
import type { BoardWithListings, Listing } from "../lib/types";

vi.mock("../lib/db", () => ({
  genderFromKey: vi.fn((key: string) => {
    const last = key.split("|").pop()!;
    if (last === "womens" || last === "kids") return last;
    return "unisex";
  }),
}));

function makeProfile(overrides: Partial<RiderProfile> = {}): RiderProfile {
  return {
    id: 1,
    name: "Test",
    genderFilter: "unisex",
    ridingProfile: "beginner",
    ...overrides,
  };
}

describe("profileToFilterDefaults", () => {
  it("maps beginner riding profile to beginner ability level", () => {
    const result = profileToFilterDefaults(makeProfile({ ridingProfile: "beginner" }));
    expect(result.abilityLevel).toBe("beginner");
  });

  it("maps intermediate_am to intermediate ability level", () => {
    const result = profileToFilterDefaults(makeProfile({ ridingProfile: "intermediate_am" }));
    expect(result.abilityLevel).toBe("intermediate");
  });

  it("maps advanced_freestyle to advanced ability level", () => {
    const result = profileToFilterDefaults(makeProfile({ ridingProfile: "advanced_freestyle" }));
    expect(result.abilityLevel).toBe("advanced");
  });

  it("maps advanced_freeride to advanced ability level", () => {
    const result = profileToFilterDefaults(makeProfile({ ridingProfile: "advanced_freeride" }));
    expect(result.abilityLevel).toBe("advanced");
  });

  it("maps advanced_am to advanced ability level", () => {
    const result = profileToFilterDefaults(makeProfile({ ridingProfile: "advanced_am" }));
    expect(result.abilityLevel).toBe("advanced");
  });

  it("passes through gender filter directly", () => {
    const result = profileToFilterDefaults(makeProfile({ genderFilter: "womens" }));
    expect(result.gender).toBe("womens");
  });

  it("passes through unisex+womens gender filter", () => {
    const result = profileToFilterDefaults(makeProfile({ genderFilter: "unisex+womens" }));
    expect(result.gender).toBe("unisex+womens");
  });
});

function makeListing(boardKey: string): Listing {
  return {
    id: "l1",
    boardKey,
    runId: "run-1",
    retailer: "tactics",
    region: "US",
    url: "https://example.com",
    imageUrl: null,
    lengthCm: 155,
    widthMm: null,
    currency: "USD",
    originalPrice: null,
    salePrice: 400,
    originalPriceUsd: null,
    salePriceUsd: 400,
    discountPercent: null,
    availability: "in_stock",
    scrapedAt: "2025-01-01T00:00:00Z",
    condition: "new",
    gender: "unisex",
    stockCount: null,
    comboContents: null,
  };
}

function makeBoard(
  boardKey: string,
  overrides: Partial<BoardWithListings> = {}
): BoardWithListings {
  return {
    boardKey,
    brand: "Brand",
    model: "Model",
    gender: "unisex",
    year: 2025,
    flex: 5,
    profile: "camber",
    shape: "true_twin",
    category: "all_mountain",
    terrainScores: { piste: null, powder: null, park: null, freeride: null, freestyle: null },
    abilityLevelMin: null,
    abilityLevelMax: null,
    msrpUsd: 500,
    manufacturerUrl: null,
    description: null,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    listings: [makeListing(boardKey)],
    bestPrice: 400,
    valueScore: 0.5,
    finalScore: 0.5,
    ...overrides,
  };
}

describe("unisex+womens gender filter in constraints", () => {
  it("shows both unisex and womens boards", () => {
    const boards = [
      makeBoard("brand|model-a|unisex"),
      makeBoard("brand|model-b|womens"),
      makeBoard("brand|model-c|kids"),
    ];
    const result = filterBoardsWithListings(boards, { gender: "unisex+womens" });
    expect(result).toHaveLength(2);
    expect(result.map(b => b.boardKey).sort()).toEqual([
      "brand|model-a|unisex",
      "brand|model-b|womens",
    ]);
  });

  it("excludes kids boards", () => {
    const boards = [
      makeBoard("brand|model-c|kids"),
    ];
    const result = filterBoardsWithListings(boards, { gender: "unisex+womens" });
    expect(result).toHaveLength(0);
  });
});
