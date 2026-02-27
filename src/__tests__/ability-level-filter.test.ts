import { describe, it, expect, vi } from "vitest";
import { filterBoardsWithListings } from "../lib/constraints";
import type { BoardWithListings, Listing } from "../lib/types";

vi.mock("../lib/db", () => ({
  genderFromKey: vi.fn((key: string) => {
    const last = key.split("|").pop()!;
    if (last === "womens" || last === "kids") return last;
    return "unisex";
  }),
}));

function makeBoard(
  overrides: Partial<BoardWithListings> & {
    abilityLevelMin?: string | null;
    abilityLevelMax?: string | null;
  } = {}
): BoardWithListings {
  const listing: Listing = {
    id: "l1",
    boardKey: overrides.boardKey ?? "brand|model|unisex",
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

  return {
    boardKey: "brand|model|unisex",
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
    listings: [listing],
    bestPrice: 400,
    dealScore: 0.5,
    fitScore: 0.5,
    versatilityScore: 0.5,
    finalScore: 0.5,
    ...overrides,
  };
}

describe("ability level filter", () => {
  it("passes all boards when no filter is set", () => {
    const boards = [
      makeBoard({ boardKey: "a|beginner-board|unisex", abilityLevelMin: "beginner", abilityLevelMax: "beginner" }),
      makeBoard({ boardKey: "a|expert-board|unisex", abilityLevelMin: "advanced", abilityLevelMax: "expert" }),
    ];
    const result = filterBoardsWithListings(boards, {});
    expect(result).toHaveLength(2);
  });

  it("filters to beginner-inclusive boards", () => {
    const boards = [
      makeBoard({ boardKey: "a|beg|unisex", abilityLevelMin: "beginner", abilityLevelMax: "intermediate" }),
      makeBoard({ boardKey: "a|int|unisex", abilityLevelMin: "intermediate", abilityLevelMax: "advanced" }),
      makeBoard({ boardKey: "a|adv|unisex", abilityLevelMin: "advanced", abilityLevelMax: "expert" }),
    ];
    const result = filterBoardsWithListings(boards, { abilityLevel: "beginner" });
    expect(result).toHaveLength(1);
    expect(result[0].boardKey).toBe("a|beg|unisex");
  });

  it("filters to intermediate-inclusive boards", () => {
    const boards = [
      makeBoard({ boardKey: "a|beg|unisex", abilityLevelMin: "beginner", abilityLevelMax: "beginner" }),
      makeBoard({ boardKey: "a|beg-int|unisex", abilityLevelMin: "beginner", abilityLevelMax: "intermediate" }),
      makeBoard({ boardKey: "a|int-adv|unisex", abilityLevelMin: "intermediate", abilityLevelMax: "advanced" }),
      makeBoard({ boardKey: "a|adv|unisex", abilityLevelMin: "advanced", abilityLevelMax: "expert" }),
    ];
    const result = filterBoardsWithListings(boards, { abilityLevel: "intermediate" });
    expect(result).toHaveLength(2);
    expect(result.map(b => b.boardKey).sort()).toEqual([
      "a|beg-int|unisex",
      "a|int-adv|unisex",
    ]);
  });

  it("advanced filter includes both advanced and expert boards", () => {
    const boards = [
      makeBoard({ boardKey: "a|beg|unisex", abilityLevelMin: "beginner", abilityLevelMax: "beginner" }),
      makeBoard({ boardKey: "a|int-adv|unisex", abilityLevelMin: "intermediate", abilityLevelMax: "advanced" }),
      makeBoard({ boardKey: "a|adv-exp|unisex", abilityLevelMin: "advanced", abilityLevelMax: "expert" }),
      makeBoard({ boardKey: "a|expert|unisex", abilityLevelMin: "expert", abilityLevelMax: "expert" }),
    ];
    const result = filterBoardsWithListings(boards, { abilityLevel: "advanced" });
    expect(result).toHaveLength(3);
    expect(result.map(b => b.boardKey).sort()).toEqual([
      "a|adv-exp|unisex",
      "a|expert|unisex",
      "a|int-adv|unisex",
    ]);
  });

  it("boards with no ability data pass through all filters", () => {
    const boards = [
      makeBoard({ boardKey: "a|unknown|unisex", abilityLevelMin: null, abilityLevelMax: null }),
    ];
    const result = filterBoardsWithListings(boards, { abilityLevel: "beginner" });
    expect(result).toHaveLength(1);
  });

  it("board with single ability level (min=max) matches correctly", () => {
    const boards = [
      makeBoard({ boardKey: "a|beg|unisex", abilityLevelMin: "beginner", abilityLevelMax: "beginner" }),
    ];
    expect(filterBoardsWithListings(boards, { abilityLevel: "beginner" })).toHaveLength(1);
    expect(filterBoardsWithListings(boards, { abilityLevel: "intermediate" })).toHaveLength(0);
    expect(filterBoardsWithListings(boards, { abilityLevel: "advanced" })).toHaveLength(0);
  });
});
