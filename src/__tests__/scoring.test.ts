import { describe, it, expect } from "vitest";
import { calcDealScore, calcCoreFitScore, calcVersatilityScore, calcFinalScore } from "../lib/scoring";
import { getSpecFitCriteria } from "../lib/profiles";
import type { Board, Listing } from "../lib/types";

function makeBoard(overrides: Partial<Board> = {}): Board {
  return {
    boardKey: "test|board",
    brand: "Test",
    model: "Board",
    gender: "unisex",
    year: null,
    flex: null,
    profile: null,
    shape: null,
    category: null,
    terrainScores: { piste: null, powder: null, park: null, freeride: null, freestyle: null },
    abilityLevelMin: null,
    abilityLevelMax: null,
    msrpUsd: null,
    manufacturerUrl: null,
    description: null,
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    ...overrides,
  };
}

function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "listing-1",
    boardKey: "test|board",
    runId: "run-1",
    retailer: "test",
    region: "US",
    url: "https://test.com",
    imageUrl: null,
    lengthCm: 155,
    widthMm: 250,
    currency: "USD",
    originalPrice: null,
    salePrice: 400,
    originalPriceUsd: null,
    salePriceUsd: 400,
    discountPercent: null,
    availability: "in_stock",
    scrapedAt: "2024-01-01",
    condition: "new",
    gender: "unisex",
    stockCount: null,
    comboContents: null,
    ...overrides,
  };
}

// ===== Deal Score =====

describe("calcDealScore", () => {
  it("returns 0.1 for 0% discount (the bug fix)", () => {
    const board = makeBoard({ msrpUsd: 500 });
    const listing = makeListing({ salePriceUsd: 500, discountPercent: 0 });
    expect(calcDealScore(board, 500, listing)).toBe(0.1);
  });

  it("returns ~0.75 for 30% discount", () => {
    const board = makeBoard({ msrpUsd: 500 });
    const listing = makeListing({ salePriceUsd: 350, discountPercent: 30 });
    expect(calcDealScore(board, 350, listing)).toBe(0.75);
  });

  it("returns 1.0 for 50%+ discount (capped)", () => {
    const board = makeBoard({ msrpUsd: 500 });
    const listing = makeListing({ salePriceUsd: 200, discountPercent: 60 });
    expect(calcDealScore(board, 200, listing)).toBe(1.0);
  });

  it("adds +0.1 bonus for blemished condition", () => {
    const board = makeBoard({ msrpUsd: 500 });
    const listing = makeListing({ salePriceUsd: 350, discountPercent: 30, condition: "blemished" });
    expect(calcDealScore(board, 350, listing)).toBe(0.85);
  });

  it("returns 0.1 when no MSRP and no discount data", () => {
    const board = makeBoard({ msrpUsd: null });
    const listing = makeListing({ salePriceUsd: 400, discountPercent: null });
    expect(calcDealScore(board, 400, listing)).toBe(0.1);
  });

  it("derives discount from MSRP when discountPercent is null", () => {
    const board = makeBoard({ msrpUsd: 500 });
    const listing = makeListing({ salePriceUsd: 350, discountPercent: null });
    // (500-350)/500 = 30% → 0.75
    expect(calcDealScore(board, 350, listing)).toBe(0.75);
  });
});

// ===== Core Fit Score =====

describe("calcCoreFitScore", () => {
  it("scores high for beginner-ideal board: soft rocker twin", () => {
    const board = makeBoard({
      flex: 3,
      profile: "rocker",
      shape: "true_twin",
      category: "all_mountain",
      abilityLevelMin: "beginner",
      abilityLevelMax: "intermediate",
    });
    const criteria = getSpecFitCriteria("beginner");
    expect(calcCoreFitScore(board, criteria)).toBe(1.0);
  });

  it("scores low for beginner criteria + stiff camber directional", () => {
    const board = makeBoard({
      flex: 8,
      profile: "camber",
      shape: "directional",
      category: "freeride",
      abilityLevelMin: "advanced",
      abilityLevelMax: "expert",
    });
    const criteria = getSpecFitCriteria("beginner");
    expect(calcCoreFitScore(board, criteria)).toBe(0.0);
  });

  it("scores neutral (~0.5) for board with all null specs", () => {
    const board = makeBoard();
    const criteria = getSpecFitCriteria("beginner");
    expect(calcCoreFitScore(board, criteria)).toBe(0.5);
  });
});

// ===== Versatility Score =====

describe("calcVersatilityScore", () => {
  describe("beginner profile", () => {
    it("scores high for board with wide ability range (beginner-to-advanced)", () => {
      const board = makeBoard({
        abilityLevelMin: "beginner",
        abilityLevelMax: "advanced",
      });
      expect(calcVersatilityScore(board, "beginner")).toBe(1.0);
    });

    it("scores low for beginner-only board", () => {
      const board = makeBoard({
        abilityLevelMin: "beginner",
        abilityLevelMax: "beginner",
      });
      expect(calcVersatilityScore(board, "beginner")).toBe(0.4);
    });
  });

  describe("intermediate_am_freeride profile", () => {
    it("scores high for board with piste + primary terrain + extras", () => {
      const board = makeBoard({
        terrainScores: { piste: 3, powder: 2, park: 2, freeride: null, freestyle: null },
      });
      // piste≥2 ✓, powder≥2 (primary) ✓, park≥2 (extra) → 0.5 + 0.2 = 0.7
      expect(calcVersatilityScore(board, "intermediate_am_freeride")).toBe(0.7);
    });

    it("scores low for piste-only board (no primary terrain)", () => {
      const board = makeBoard({
        terrainScores: { piste: 3, powder: 0, park: 0, freeride: 0, freestyle: 0 },
      });
      // piste≥2 ✓, but no freeride/powder ≥2 → 0.3
      expect(calcVersatilityScore(board, "intermediate_am_freeride")).toBe(0.3);
    });
  });

  describe("advanced_am profile", () => {
    it("returns 0 (versatility is redundant with fit, weight is 0)", () => {
      const board = makeBoard({
        terrainScores: { piste: 3, powder: 2, park: 2, freeride: 3, freestyle: 1 },
      });
      expect(calcVersatilityScore(board, "advanced_am")).toBe(0);
    });
  });
});

// ===== Integration =====

describe("calcFinalScore integration", () => {
  it("full-price stiff camber board scores low for beginner", () => {
    const board = makeBoard({
      flex: 8,
      profile: "camber",
      shape: "directional",
      category: "freeride",
      abilityLevelMin: "advanced",
      abilityLevelMax: "expert",
      msrpUsd: 800,
    });
    const listing = makeListing({ salePriceUsd: 800, discountPercent: 0 });
    const criteria = getSpecFitCriteria("beginner");

    const deal = calcDealScore(board, 800, listing);
    const fit = calcCoreFitScore(board, criteria);
    const versatility = calcVersatilityScore(board, "beginner");
    const final = calcFinalScore(deal, fit, versatility, "beginner");

    // deal=0.1, fit=0.0, versatility=0.7
    // beginner weights: 0.50*0.1 + 0.40*0.0 + 0.10*0.7 = 0.05+0+0.07 = 0.12
    expect(final).toBeLessThan(0.15);
  });

  it("discounted soft rocker scores high for beginner", () => {
    const board = makeBoard({
      flex: 3,
      profile: "rocker",
      shape: "true_twin",
      category: "all_mountain",
      abilityLevelMin: "beginner",
      abilityLevelMax: "advanced",
      msrpUsd: 430,
    });
    const listing = makeListing({ salePriceUsd: 300, discountPercent: 30 });
    const criteria = getSpecFitCriteria("beginner");

    const deal = calcDealScore(board, 300, listing);
    const fit = calcCoreFitScore(board, criteria);
    const versatility = calcVersatilityScore(board, "beginner");
    const final = calcFinalScore(deal, fit, versatility, "beginner");

    // deal=0.75, fit=1.0, versatility=1.0
    // beginner weights: 0.50*0.75 + 0.40*1.0 + 0.10*1.0 = 0.375+0.4+0.1 = 0.875
    expect(final).toBeGreaterThan(0.8);
  });
});
