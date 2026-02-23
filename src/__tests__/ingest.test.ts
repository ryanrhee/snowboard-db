import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingestManufacturerSpecs } from "../lib/manufacturers/ingest";
import { getCachedSpecs, setCachedSpecs, setSpecSource, specKey } from "../lib/db";
import type { ManufacturerSpec } from "../lib/manufacturers/types";

vi.mock("../lib/db", () => ({
  getCachedSpecs: vi.fn(),
  setCachedSpecs: vi.fn(),
  setSpecSource: vi.fn(),
  specKey: vi.fn((brand: string, model: string) => `${brand.toLowerCase()}|${model.toLowerCase()}`),
}));

vi.mock("../lib/scraping/utils", () => ({
  canonicalizeBrand: vi.fn((b: string) => b),
}));

function makeSpec(overrides: Partial<ManufacturerSpec> = {}): ManufacturerSpec {
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

describe("ingestManufacturerSpecs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCachedSpecs as ReturnType<typeof vi.fn>).mockReturnValue(null);
  });

  it("inserts a new spec when no existing cached specs", () => {
    const result = ingestManufacturerSpecs([makeSpec()]);

    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 0 });
    expect(setCachedSpecs).toHaveBeenCalledTimes(1);
    expect(setCachedSpecs).toHaveBeenCalledWith(
      "burton|custom",
      expect.objectContaining({
        source: "manufacturer",
        sourceUrl: "https://burton.com/custom",
      }),
    );
  });

  it("skips existing manufacturer data", () => {
    (getCachedSpecs as ReturnType<typeof vi.fn>).mockReturnValue({
      flex: 5,
      profile: "camber",
      shape: "true_twin",
      category: "all_mountain",
      msrpUsd: 599,
      source: "manufacturer",
      sourceUrl: "https://burton.com/custom",
    });

    const result = ingestManufacturerSpecs([makeSpec()]);

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 1 });
    expect(setCachedSpecs).not.toHaveBeenCalled();
  });

  it("overwrites existing LLM data", () => {
    (getCachedSpecs as ReturnType<typeof vi.fn>).mockReturnValue({
      flex: 4,
      profile: "camber",
      shape: "true_twin",
      category: "all_mountain",
      msrpUsd: null,
      source: "llm",
      sourceUrl: null,
    });

    const result = ingestManufacturerSpecs([makeSpec()]);

    expect(result).toEqual({ inserted: 0, updated: 1, skipped: 0 });
    expect(setCachedSpecs).toHaveBeenCalledTimes(1);
  });

  it("stores extras via setSpecSource including abilityLevel alias", () => {
    const spec = makeSpec({
      extras: { "ability level": "intermediate" },
    });

    ingestManufacturerSpecs([spec]);

    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom",
      "ability level",
      "manufacturer",
      "intermediate",
      "https://burton.com/custom",
    );
    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom",
      "abilityLevel",
      "manufacturer",
      "intermediate",
      "https://burton.com/custom",
    );
  });

  it("stores extras even when main cache update is skipped", () => {
    (getCachedSpecs as ReturnType<typeof vi.fn>).mockReturnValue({
      flex: 5,
      profile: "camber",
      shape: "true_twin",
      category: "all_mountain",
      msrpUsd: 599,
      source: "manufacturer",
      sourceUrl: "https://burton.com/custom",
    });

    const spec = makeSpec({
      extras: { "ability level": "advanced" },
    });

    const result = ingestManufacturerSpecs([spec]);

    expect(result.skipped).toBe(1);
    expect(setCachedSpecs).not.toHaveBeenCalled();
    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom",
      "ability level",
      "manufacturer",
      "advanced",
      "https://burton.com/custom",
    );
    expect(setSpecSource).toHaveBeenCalledWith(
      "burton|custom",
      "abilityLevel",
      "manufacturer",
      "advanced",
      "https://burton.com/custom",
    );
  });

  it("returns zeroed stats for empty array", () => {
    const result = ingestManufacturerSpecs([]);

    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0 });
    expect(setCachedSpecs).not.toHaveBeenCalled();
    expect(setSpecSource).not.toHaveBeenCalled();
  });

  it("normalizes flex from string to number", () => {
    const spec = makeSpec({ flex: "5/10" });

    ingestManufacturerSpecs([spec]);

    expect(setCachedSpecs).toHaveBeenCalledWith(
      "burton|custom",
      expect.objectContaining({ flex: 5 }),
    );
  });

  it("normalizes profile using real normalizeProfile", () => {
    const spec = makeSpec({ profile: "Flying V" });

    ingestManufacturerSpecs([spec]);

    expect(setCachedSpecs).toHaveBeenCalledWith(
      "burton|custom",
      expect.objectContaining({ profile: "hybrid_rocker" }),
    );
  });

  it("handles multiple specs with mixed outcomes", () => {
    const specs = [
      makeSpec({ brand: "Burton", model: "Custom" }),
      makeSpec({ brand: "Ride", model: "Warpig" }),
      makeSpec({ brand: "Jones", model: "Flagship" }),
    ];

    // First call: no existing → insert
    // Second call: existing manufacturer → skip
    // Third call: existing llm → update
    (getCachedSpecs as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        flex: 6,
        profile: "camber",
        shape: "directional",
        category: "freeride",
        msrpUsd: 499,
        source: "manufacturer",
        sourceUrl: "https://ride.com/warpig",
      })
      .mockReturnValueOnce({
        flex: 7,
        profile: "camber",
        shape: "directional",
        category: "freeride",
        msrpUsd: 549,
        source: "llm",
        sourceUrl: null,
      });

    const result = ingestManufacturerSpecs(specs);

    expect(result).toEqual({ inserted: 1, skipped: 1, updated: 1 });
  });

  it("handles null flex and profile without calling setSpecSource for those fields", () => {
    const spec = makeSpec({
      flex: null,
      profile: null,
      shape: null,
      category: null,
    });

    ingestManufacturerSpecs([spec]);

    expect(setCachedSpecs).toHaveBeenCalledWith(
      "burton|custom",
      expect.objectContaining({
        flex: null,
        profile: null,
        shape: null,
        category: null,
      }),
    );

    // setSpecSource should NOT be called for null fields
    // (no extras either since extras is empty)
    expect(setSpecSource).not.toHaveBeenCalled();
  });
});
