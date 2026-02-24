import { describe, it, expect } from "vitest";
import { adaptRetailerOutput, adaptManufacturerOutput } from "../lib/scrapers/adapters";
import { Currency, Region } from "../lib/types";
import type { RawBoard } from "../lib/types";
import type { ManufacturerSpec } from "../lib/manufacturers/types";

function makeRawBoard(overrides: Partial<RawBoard> = {}): RawBoard {
  return {
    retailer: "tactics",
    region: Region.US,
    url: "https://tactics.com/board/155",
    brand: "Burton",
    model: "Custom",
    salePrice: 349,
    currency: Currency.USD,
    scrapedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeManufacturerSpec(
  overrides: Partial<ManufacturerSpec> = {}
): ManufacturerSpec {
  return {
    brand: "Burton",
    model: "Custom",
    year: 2025,
    flex: "5/10",
    profile: "camber",
    shape: "twin",
    category: "all-mountain",
    msrpUsd: 599,
    sourceUrl: "https://burton.com/custom",
    extras: {},
    ...overrides,
  };
}

describe("adaptRetailerOutput", () => {
  it("groups multiple sizes of the same board into one ScrapedBoard with multiple listings", () => {
    const rawBoards: RawBoard[] = [
      makeRawBoard({ url: "https://tactics.com/board/155", lengthCm: 155 }),
      makeRawBoard({ url: "https://tactics.com/board/158", lengthCm: 158 }),
      makeRawBoard({ url: "https://tactics.com/board/161", lengthCm: 161 }),
    ];

    const result = adaptRetailerOutput(rawBoards, "tactics");

    expect(result).toHaveLength(1);
    expect(result[0].brand).toBe("Burton");
    expect(result[0].model).toBe("Custom");
    expect(result[0].source).toBe("retailer:tactics");
    expect(result[0].listings).toHaveLength(3);
    expect(result[0].listings[0].lengthCm).toBe(155);
    expect(result[0].listings[1].lengthCm).toBe(158);
    expect(result[0].listings[2].lengthCm).toBe(161);
  });

  it("keeps different board models as separate ScrapedBoards", () => {
    const rawBoards: RawBoard[] = [
      makeRawBoard({ model: "Custom", url: "https://tactics.com/custom" }),
      makeRawBoard({ model: "Process", url: "https://tactics.com/process" }),
    ];

    const result = adaptRetailerOutput(rawBoards, "tactics");

    expect(result).toHaveLength(2);
    const models = result.map((r) => r.model).sort();
    expect(models).toEqual(["Custom", "Process"]);
  });

  it("merges specs from later boards when the first lacked them", () => {
    const rawBoards: RawBoard[] = [
      makeRawBoard({ url: "https://tactics.com/board/155", flex: undefined }),
      makeRawBoard({ url: "https://tactics.com/board/158", flex: "5/10" }),
    ];

    const result = adaptRetailerOutput(rawBoards, "tactics");

    expect(result).toHaveLength(1);
    expect(result[0].flex).toBe("5/10");
  });

  it("returns empty array for empty input", () => {
    expect(adaptRetailerOutput([], "tactics")).toEqual([]);
  });

  it("passes through listing-level fields correctly", () => {
    const raw = makeRawBoard({
      imageUrl: "https://tactics.com/img.jpg",
      lengthCm: 155,
      widthMm: 250,
      originalPrice: 499,
      salePrice: 349,
      availability: "In Stock",
      condition: "new",
      stockCount: 3,
      gender: "womens",
    });

    const result = adaptRetailerOutput([raw], "tactics");

    const listing = result[0].listings[0];
    expect(listing.imageUrl).toBe("https://tactics.com/img.jpg");
    expect(listing.lengthCm).toBe(155);
    expect(listing.widthMm).toBe(250);
    expect(listing.originalPrice).toBe(499);
    expect(listing.salePrice).toBe(349);
    expect(listing.availability).toBe("In Stock");
    expect(listing.condition).toBe("new");
    expect(listing.stockCount).toBe(3);
    expect(listing.gender).toBe("womens");
  });
});

describe("adaptManufacturerOutput", () => {
  it("maps ManufacturerSpec to ScrapedBoard with empty listings", () => {
    const specs = [makeManufacturerSpec()];

    const result = adaptManufacturerOutput(specs, "Burton");

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("manufacturer:burton");
    expect(result[0].brand).toBe("Burton");
    expect(result[0].model).toBe("Custom");
    expect(result[0].flex).toBe("5/10");
    expect(result[0].profile).toBe("camber");
    expect(result[0].shape).toBe("twin");
    expect(result[0].category).toBe("all-mountain");
    expect(result[0].msrpUsd).toBe(599);
    expect(result[0].listings).toEqual([]);
  });

  it("handles null spec fields", () => {
    const spec = makeManufacturerSpec({
      flex: null,
      profile: null,
      shape: null,
      category: null,
      msrpUsd: null,
      year: null,
    });

    const result = adaptManufacturerOutput([spec], "Burton");

    expect(result[0].flex).toBeUndefined();
    expect(result[0].profile).toBeUndefined();
    expect(result[0].shape).toBeUndefined();
    expect(result[0].category).toBeUndefined();
    expect(result[0].msrpUsd).toBeUndefined();
    expect(result[0].year).toBeUndefined();
  });

  it("preserves extras", () => {
    const spec = makeManufacturerSpec({
      extras: { "ability level": "intermediate-advanced" },
    });

    const result = adaptManufacturerOutput([spec], "Burton");

    expect(result[0].extras).toEqual({
      "ability level": "intermediate-advanced",
    });
  });

  it("maps multiple specs", () => {
    const specs = [
      makeManufacturerSpec({ model: "Custom" }),
      makeManufacturerSpec({ model: "Process" }),
    ];

    const result = adaptManufacturerOutput(specs, "Burton");

    expect(result).toHaveLength(2);
    expect(result[0].model).toBe("Custom");
    expect(result[1].model).toBe("Process");
  });
});
