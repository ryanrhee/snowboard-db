import { describe, it, expect, vi, beforeEach } from "vitest";
import { coalesce } from "../lib/scrapers/coalesce";
import { Currency, Region } from "../lib/types";
import type { ScrapedBoard } from "../lib/scrapers/types";
import { setSpecSource } from "../lib/db";
import { BrandIdentifier } from "../lib/strategies/brand-identifier";

vi.mock("../lib/db", () => ({
  specKey: vi.fn(
    (brand: string, model: string, gender?: string, _manufacturer?: string) => {
      // Strategy already strips profile suffixes, so specKey just lowercases
      const base = `${brand.toLowerCase()}|${model.toLowerCase()}`;
      const g = gender?.toLowerCase();
      if (g === "womens") return `${base}|womens`;
      if (g === "kids" || g === "youth") return `${base}|kids`;
      return `${base}|unisex`;
    }
  ),
  genderFromKey: vi.fn((boardKey: string) => {
    const last = boardKey.split("|").pop()!;
    if (last === "womens" || last === "kids") return last;
    return "unisex";
  }),
  setSpecSource: vi.fn(),
  generateListingId: vi.fn(
    (retailer: string, url: string, lengthCm?: number) =>
      `${retailer}|${url}|${lengthCm ?? ""}`
  ),
  setCachedSpecs: vi.fn(),
  getCachedSpecs: vi.fn(() => null),
}));

vi.mock("../lib/strategies/brand-identifier", () => {
  class MockBrandIdentifier {
    raw: string;
    constructor(raw: string) { this.raw = raw; }
    get cleaned() { return this.raw; }
    get canonical() { return this.raw; }
    get manufacturer() {
      const lower = this.raw.toLowerCase();
      if (lower === "burton") return "burton";
      if (lower === "gnu" || lower === "lib tech") return "mervin";
      return "default";
    }
  }
  return { BrandIdentifier: MockBrandIdentifier };
});

vi.mock("../lib/scraping/utils", () => ({
  canonicalizeBrand: vi.fn((b: string) => b),
}));

vi.mock("../lib/scoring", () => ({
  calcBeginnerScoreForBoard: vi.fn(() => 0.5),
}));

function makeScrapedBoard(
  overrides: Partial<ScrapedBoard> & { brand?: string } = {}
): ScrapedBoard {
  const { brand, ...rest } = overrides;
  return {
    source: "retailer:tactics",
    brandId: new BrandIdentifier(brand ?? "Burton"),
    model: "Custom",
    sourceUrl: "https://tactics.com/custom",
    extras: {},
    listings: [],
    ...rest,
  };
}

describe("coalesce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a Board entity for each unique brand|model|gender", () => {
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
      "burton|custom|unisex",
      "burton|process|unisex",
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
    expect(boards[0].boardKey).toBe("burton|custom|unisex");
    expect(boards[0].msrpUsd).toBe(599);
    expect(boards[0].manufacturerUrl).toBe("https://burton.com/custom");
    expect(listings).toHaveLength(1);
    expect(listings[0].boardKey).toBe("burton|custom|unisex");
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
      "burton|custom|unisex",
      "flex",
      "retailer:evo",
      "5",
      "https://tactics.com/custom"
    );
    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom|unisex",
      "profile",
      "retailer:evo",
      "camber",
      "https://tactics.com/custom"
    );
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

  it("separates womens version from unisex version of the same model", () => {
    const scraped: ScrapedBoard[] = [
      makeScrapedBoard({
        brand: "Jones",
        model: "Flagship",
        sourceUrl: "https://jones.com/flagship",
      }),
      makeScrapedBoard({
        brand: "Jones",
        model: "Flagship",
        gender: "womens",
        sourceUrl: "https://jones.com/flagship-womens",
      }),
    ];

    const { boards } = coalesce(scraped, "run-1");

    expect(boards).toHaveLength(2);
    const keys = boards.map((b) => b.boardKey).sort();
    expect(keys).toEqual(["jones|flagship|unisex", "jones|flagship|womens"]);
  });

  describe("profile variant splitting", () => {
    it("splits manufacturer boards with different profiles into separate board keys", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Camber",
          rawModel: "Custom Camber",
          profile: "camber",
          sourceUrl: "https://burton.com/custom-camber",
        }),
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Flying V",
          rawModel: "Custom Flying V",
          profile: "flying v",
          sourceUrl: "https://burton.com/custom-flying-v",
        }),
      ];

      const { boards } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(2);
      const keys = boards.map((b) => b.boardKey).sort();
      expect(keys).toEqual([
        "burton|custom camber|unisex",
        "burton|custom flying v|unisex",
      ]);
    });

    it("assigns retailer with profile suffix to correct variant", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Camber",
          rawModel: "Custom Camber",
          profile: "camber",
          sourceUrl: "https://burton.com/custom-camber",
        }),
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Flying V",
          rawModel: "Custom Flying V",
          profile: "flying v",
          sourceUrl: "https://burton.com/custom-flying-v",
        }),
        makeScrapedBoard({
          source: "retailer:tactics",
          brand: "Burton",
          model: "Custom Flying V",
          rawModel: "Custom Flying V",
          sourceUrl: "https://tactics.com/custom-flying-v",
          listings: [
            {
              url: "https://tactics.com/custom-flying-v/155",
              salePrice: 499,
              currency: Currency.USD,
              scrapedAt: "2025-01-01T00:00:00Z",
            },
          ],
        }),
      ];

      const { boards, listings } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(2);
      // The retailer listing should be under the Flying V variant
      const fvBoard = boards.find((b) => b.boardKey.includes("flying v"));
      expect(fvBoard).toBeDefined();
      const fvListings = listings.filter((l) => l.boardKey === fvBoard!.boardKey);
      expect(fvListings).toHaveLength(1);
    });

    it("assigns retailer without suffix but with profile spec to correct variant", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Camber",
          rawModel: "Custom Camber",
          profile: "camber",
          sourceUrl: "https://burton.com/custom-camber",
        }),
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Flying V",
          rawModel: "Custom Flying V",
          profile: "flying v",
          sourceUrl: "https://burton.com/custom-flying-v",
        }),
        makeScrapedBoard({
          source: "retailer:evo",
          brand: "Burton",
          model: "Custom",
          rawModel: "Custom",
          profile: "Hybrid Rocker",
          sourceUrl: "https://evo.com/custom",
          listings: [
            {
              url: "https://evo.com/custom/155",
              salePrice: 479,
              currency: Currency.USD,
              scrapedAt: "2025-01-01T00:00:00Z",
            },
          ],
        }),
      ];

      const { boards, listings } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(2);
      // Flying V normalizes to hybrid_rocker, so the retailer should match that variant
      const fvBoard = boards.find((b) => b.boardKey.includes("flying v"));
      expect(fvBoard).toBeDefined();
      const fvListings = listings.filter((l) => l.boardKey === fvBoard!.boardKey);
      expect(fvListings).toHaveLength(1);
    });

    it("assigns retailer without suffix or profile to default (camber) variant", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Camber",
          rawModel: "Custom Camber",
          profile: "camber",
          sourceUrl: "https://burton.com/custom-camber",
        }),
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Custom Flying V",
          rawModel: "Custom Flying V",
          profile: "flying v",
          sourceUrl: "https://burton.com/custom-flying-v",
        }),
        makeScrapedBoard({
          source: "retailer:tactics",
          brand: "Burton",
          model: "Custom",
          rawModel: "Burton Custom Snowboard",
          sourceUrl: "https://tactics.com/custom",
          listings: [
            {
              url: "https://tactics.com/custom/155",
              salePrice: 449,
              currency: Currency.USD,
              scrapedAt: "2025-01-01T00:00:00Z",
            },
          ],
        }),
      ];

      const { boards, listings } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(2);
      // No suffix, no profile → defaults to camber for Burton
      const camberBoard = boards.find((b) => b.boardKey.includes("camber"));
      expect(camberBoard).toBeDefined();
      const camberListings = listings.filter((l) => l.boardKey === camberBoard!.boardKey);
      expect(camberListings).toHaveLength(1);
    });

    it("uses c2 as default for Lib Tech profile variants", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:lib-tech",
          brand: "Lib Tech",
          model: "Skunk Ape C2",
          rawModel: "Skunk Ape C2",
          profile: "hybrid rocker",
          sourceUrl: "https://lib-tech.com/skunk-ape-c2",
        }),
        makeScrapedBoard({
          source: "manufacturer:lib-tech",
          brand: "Lib Tech",
          model: "Skunk Ape Camber",
          rawModel: "Skunk Ape Camber",
          profile: "camber",
          sourceUrl: "https://lib-tech.com/skunk-ape-camber",
        }),
        makeScrapedBoard({
          source: "retailer:evo",
          brand: "Lib Tech",
          model: "Skunk Ape",
          rawModel: "Skunk Ape",
          sourceUrl: "https://evo.com/skunk-ape",
          listings: [
            {
              url: "https://evo.com/skunk-ape/161",
              salePrice: 599,
              currency: Currency.USD,
              scrapedAt: "2025-01-01T00:00:00Z",
            },
          ],
        }),
      ];

      const { boards, listings } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(2);
      // No suffix, no profile → defaults to c2 for Lib Tech
      const c2Board = boards.find((b) => b.boardKey.includes("c2"));
      expect(c2Board).toBeDefined();
      const c2Listings = listings.filter((l) => l.boardKey === c2Board!.boardKey);
      expect(c2Listings).toHaveLength(1);
    });

    it("does not split when only one manufacturer source URL exists", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:burton",
          brand: "Burton",
          model: "Ripcord",
          rawModel: "Ripcord",
          profile: "flat top",
          sourceUrl: "https://burton.com/ripcord",
        }),
        makeScrapedBoard({
          source: "retailer:tactics",
          brand: "Burton",
          model: "Ripcord",
          rawModel: "Burton Ripcord Snowboard",
          sourceUrl: "https://tactics.com/ripcord",
        }),
      ];

      const { boards } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(1);
      expect(boards[0].boardKey).toBe("burton|ripcord|unisex");
    });
  });

  describe("CAPiTA gender flow through coalesce", () => {
    it("manufacturer womens board gets womens board_key and gender", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:capita",
          brand: "CAPiTA",
          model: "Paradise",
          gender: "womens",
          sourceUrl: "https://capitasnowboarding.com/products/paradise",
          msrpUsd: 399,
        }),
      ];

      const { boards } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(1);
      expect(boards[0].boardKey).toBe("capita|paradise|womens");
      expect(boards[0].gender).toBe("womens");
    });

    it("manufacturer unisex board gets unisex board_key and gender", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:capita",
          brand: "CAPiTA",
          model: "DOA",
          sourceUrl: "https://capitasnowboarding.com/products/doa",
          msrpUsd: 499,
        }),
      ];

      const { boards } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(1);
      expect(boards[0].boardKey).toBe("capita|doa|unisex");
      expect(boards[0].gender).toBe("unisex");
    });

    it("manufacturer kids board gets kids board_key and gender", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:capita",
          brand: "CAPiTA",
          model: "Children Of The Gnar",
          gender: "kids",
          sourceUrl: "https://capitasnowboarding.com/products/children-of-the-gnar",
        }),
      ];

      const { boards } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(1);
      expect(boards[0].boardKey).toBe("capita|children of the gnar|kids");
      expect(boards[0].gender).toBe("kids");
    });

    it("womens manufacturer board merges with womens retailer listing", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:capita",
          brand: "CAPiTA",
          model: "Paradise",
          gender: "womens",
          sourceUrl: "https://capitasnowboarding.com/products/paradise",
          msrpUsd: 399,
        }),
        makeScrapedBoard({
          source: "retailer:tactics",
          brand: "CAPiTA",
          model: "Paradise",
          gender: "womens",
          sourceUrl: "https://tactics.com/capita-paradise",
          listings: [
            {
              url: "https://tactics.com/capita-paradise/141",
              lengthCm: 141,
              salePrice: 399,
              currency: Currency.USD,
              scrapedAt: "2025-01-01T00:00:00Z",
            },
          ],
        }),
      ];

      const { boards, listings } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(1);
      expect(boards[0].boardKey).toBe("capita|paradise|womens");
      expect(boards[0].gender).toBe("womens");
      expect(listings).toHaveLength(1);
      expect(listings[0].boardKey).toBe("capita|paradise|womens");
    });

    it("same model with different genders creates separate boards", () => {
      const scraped: ScrapedBoard[] = [
        makeScrapedBoard({
          source: "manufacturer:capita",
          brand: "CAPiTA",
          model: "Paradise",
          gender: "womens",
          sourceUrl: "https://capitasnowboarding.com/products/paradise",
        }),
        makeScrapedBoard({
          source: "retailer:evo",
          brand: "CAPiTA",
          model: "Paradise",
          sourceUrl: "https://evo.com/capita-paradise",
        }),
      ];

      const { boards } = coalesce(scraped, "run-1");

      expect(boards).toHaveLength(2);
      const keys = boards.map((b) => b.boardKey).sort();
      expect(keys).toEqual([
        "capita|paradise|unisex",
        "capita|paradise|womens",
      ]);
    });
  });
});
