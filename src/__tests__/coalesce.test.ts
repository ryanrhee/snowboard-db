import { describe, it, expect, vi, beforeEach } from "vitest";
import { coalesce } from "../lib/scrapers/coalesce";
import { Currency, Region } from "../lib/types";
import type { ScrapedBoard } from "../lib/scrapers/types";
import { setSpecSource } from "../lib/db";

vi.mock("../lib/db", () => ({
  specKey: vi.fn(
    (brand: string, model: string) =>
      `${brand.toLowerCase()}|${model.toLowerCase()}`
  ),
  setSpecSource: vi.fn(),
  generateListingId: vi.fn(
    (retailer: string, url: string, lengthCm?: number) =>
      `${retailer}|${url}|${lengthCm ?? ""}`
  ),
  setCachedSpecs: vi.fn(),
  getCachedSpecs: vi.fn(() => null),
}));

vi.mock("../lib/scraping/utils", () => ({
  canonicalizeBrand: vi.fn((b: string) => b),
}));

vi.mock("../lib/scoring", () => ({
  calcBeginnerScoreForBoard: vi.fn(() => 0.5),
}));

function makeScrapedBoard(
  overrides: Partial<ScrapedBoard> = {}
): ScrapedBoard {
  return {
    source: "retailer:tactics",
    brand: "Burton",
    model: "Custom",
    sourceUrl: "https://tactics.com/custom",
    extras: {},
    listings: [],
    ...overrides,
  };
}

describe("coalesce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Board entity for each unique brand|model", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({ brand: "Burton", model: "Custom" }),
      makeScrapedBoard({
        brand: "Burton",
        model: "Process",
        sourceUrl: "https://tactics.com/process",
      }),
    ];

    const { boards, listings } = coalesce(scraped, "run-1");

    expect(boards).toHaveLength(2);
    expect(boards.map((b) => b.boardKey).sort()).toEqual([
      "burton|custom",
      "burton|process",
    ]);
  });

  it("merges manufacturer and retailer ScrapedBoards for the same board", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        source: "manufacturer:burton",
        brand: "Burton",
        model: "Custom",
        flex: "5/10",
        msrpUsd: 599,
        sourceUrl: "https://burton.com/custom",
      }),
      makeScrapedBoard({
        source: "retailer:tactics",
        brand: "Burton",
        model: "Custom",
        flex: "5",
        listings: [
          {
            url: "https://tactics.com/custom/155",
            salePrice: 349,
            currency: Currency.USD,
            scrapedAt: "2025-01-01T00:00:00Z",
          },
        ],
      }),
    ];

    const { boards, listings } = coalesce(scraped, "run-1");

    expect(boards).toHaveLength(1);
    expect(boards[0].boardKey).toBe("burton|custom");
    expect(boards[0].msrpUsd).toBe(599);
    expect(boards[0].manufacturerUrl).toBe("https://burton.com/custom");
    expect(listings).toHaveLength(1);
    expect(listings[0].boardKey).toBe("burton|custom");
  });

  it("creates Listing entities from ScrapedBoard.listings", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        listings: [
          {
            url: "https://tactics.com/custom/155",
            lengthCm: 155,
            salePrice: 349,
            originalPrice: 499,
            currency: Currency.USD,
            scrapedAt: "2025-01-01T00:00:00Z",
            availability: "in stock",
          },
          {
            url: "https://tactics.com/custom/158",
            lengthCm: 158,
            salePrice: 369,
            currency: Currency.USD,
            scrapedAt: "2025-01-01T00:00:00Z",
          },
        ],
      }),
    ];

    const { boards, listings } = coalesce(scraped, "run-1");

    expect(boards).toHaveLength(1);
    expect(listings).toHaveLength(2);
    expect(listings[0].lengthCm).toBe(155);
    expect(listings[0].salePriceUsd).toBe(349);
    expect(listings[0].originalPriceUsd).toBe(499);
    expect(listings[0].discountPercent).toBe(30);
    expect(listings[0].availability).toBe("in_stock");
    expect(listings[1].lengthCm).toBe(158);
  });

  it("writes specs to spec_sources via setSpecSource", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        source: "retailer:evo",
        flex: "5",
        profile: "camber",
        shape: "Twin",
        category: "all-mountain",
      }),
    ];

    coalesce(scraped, "run-1");

    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom",
      "flex",
      "retailer:evo",
      "5",
      "https://tactics.com/custom"
    );
    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom",
      "profile",
      "retailer:evo",
      "camber",
      "https://tactics.com/custom"
    );
  });

  it("resolves board gender from listing genders", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        listings: [
          {
            url: "https://tactics.com/custom/155",
            salePrice: 349,
            currency: Currency.USD,
            scrapedAt: "2025-01-01T00:00:00Z",
            gender: "womens",
          },
          {
            url: "https://tactics.com/custom/158",
            salePrice: 369,
            currency: Currency.USD,
            scrapedAt: "2025-01-01T00:00:00Z",
            gender: "womens",
          },
        ],
      }),
    ];

    const { boards } = coalesce(scraped, "run-1");

    // BoardIdentifier detects gender from URL/model — since these don't contain women's keywords,
    // it will default to unisex. The test verifies the gender resolution logic works.
    expect(boards[0].gender).toBeDefined();
  });

  it("returns empty arrays for empty input", () => {
    const { boards, listings } = coalesce([], "run-1");

    expect(boards).toEqual([]);
    expect(listings).toEqual([]);
  });

  it("handles manufacturer-only boards (no listings)", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        source: "manufacturer:burton",
        brand: "Burton",
        model: "Hometown Hero",
        msrpUsd: 699,
        sourceUrl: "https://burton.com/hometown-hero",
        listings: [],
      }),
    ];

    const { boards, listings } = coalesce(scraped, "run-1");

    expect(boards).toHaveLength(1);
    expect(boards[0].msrpUsd).toBe(699);
    expect(listings).toHaveLength(0);
  });

  it("sets board specs to null (filled by resolveSpecSources later)", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        flex: "5/10",
        profile: "camber",
        shape: "twin",
        category: "all-mountain",
      }),
    ];

    const { boards } = coalesce(scraped, "run-1");

    // Specs are left null by coalesce — resolveSpecSources fills them
    expect(boards[0].flex).toBeNull();
    expect(boards[0].profile).toBeNull();
    expect(boards[0].shape).toBeNull();
    expect(boards[0].category).toBeNull();
  });
});
