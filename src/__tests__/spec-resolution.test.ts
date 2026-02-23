import { describe, it, expect } from "vitest";
import { getSourcePriority, findConsensus, valuesMatch } from "../lib/spec-resolution";
import { SpecSourceEntry } from "../lib/db";

// =============================================================================
// getSourcePriority
// =============================================================================

describe("getSourcePriority", () => {
  it("returns 4 for manufacturer", () => {
    expect(getSourcePriority("manufacturer")).toBe(4);
  });

  it("returns 3 for review-site", () => {
    expect(getSourcePriority("review-site")).toBe(3);
  });

  it("returns 3 for judgment", () => {
    expect(getSourcePriority("judgment")).toBe(3);
  });

  it("returns 2 for retailer:evo", () => {
    expect(getSourcePriority("retailer:evo")).toBe(2);
  });

  it("returns 2 for retailer:rei", () => {
    expect(getSourcePriority("retailer:rei")).toBe(2);
  });

  it("returns 1 for llm", () => {
    expect(getSourcePriority("llm")).toBe(1);
  });

  it("returns 0 for unknown source", () => {
    expect(getSourcePriority("unknown-source")).toBe(0);
  });
});

// =============================================================================
// valuesMatch
// =============================================================================

describe("valuesMatch", () => {
  it("returns true for identical non-flex strings", () => {
    expect(valuesMatch("camber", "camber", "profile")).toBe(true);
  });

  it("returns false for different non-flex strings", () => {
    expect(valuesMatch("camber", "rocker", "profile")).toBe(false);
  });

  it("returns true for flex values that round to the same integer", () => {
    expect(valuesMatch("4.5", "5", "flex")).toBe(true);
  });

  it("returns false for flex values that round to different integers", () => {
    expect(valuesMatch("3", "7", "flex")).toBe(false);
  });
});

// =============================================================================
// findConsensus
// =============================================================================

describe("findConsensus", () => {
  it("returns consensus when two non-manufacturer sources agree", () => {
    const entries: SpecSourceEntry[] = [
      { source: "retailer:evo", value: "camber", sourceUrl: "https://evo.com/board" },
      { source: "retailer:rei", value: "camber", sourceUrl: "https://rei.com/board" },
    ];
    const result = findConsensus(entries, "profile");
    expect(result).toEqual({
      value: "camber",
      sources: ["retailer:evo", "retailer:rei"],
    });
  });

  it("returns null when fewer than 2 non-manufacturer/llm/judgment sources exist", () => {
    const entries: SpecSourceEntry[] = [
      { source: "retailer:evo", value: "camber", sourceUrl: "https://evo.com/board" },
    ];
    expect(findConsensus(entries, "profile")).toBeNull();
  });

  it("returns null when all sources disagree", () => {
    const entries: SpecSourceEntry[] = [
      { source: "retailer:evo", value: "camber", sourceUrl: "https://evo.com/board" },
      { source: "retailer:rei", value: "rocker", sourceUrl: "https://rei.com/board" },
      { source: "retailer:tactics", value: "flat", sourceUrl: "https://tactics.com/board" },
    ];
    expect(findConsensus(entries, "profile")).toBeNull();
  });

  it("excludes manufacturer, llm, and judgment sources from candidates", () => {
    const entries: SpecSourceEntry[] = [
      { source: "manufacturer", value: "camber", sourceUrl: "https://brand.com/board" },
      { source: "llm", value: "camber", sourceUrl: null },
      { source: "judgment", value: "camber", sourceUrl: null },
      { source: "retailer:evo", value: "rocker", sourceUrl: "https://evo.com/board" },
    ];
    expect(findConsensus(entries, "profile")).toBeNull();
  });

  it("rounds flex values so 4.5 and 5 reach consensus", () => {
    const entries: SpecSourceEntry[] = [
      { source: "retailer:evo", value: "4.5", sourceUrl: "https://evo.com/board" },
      { source: "retailer:rei", value: "5", sourceUrl: "https://rei.com/board" },
    ];
    const result = findConsensus(entries, "flex");
    expect(result).toEqual({
      value: "5",
      sources: ["retailer:evo", "retailer:rei"],
    });
  });

  it("returns null for empty entries", () => {
    expect(findConsensus([], "profile")).toBeNull();
  });

  it("returns the agreeing pair when 3 sources exist but only 2 agree", () => {
    const entries: SpecSourceEntry[] = [
      { source: "retailer:evo", value: "camber", sourceUrl: "https://evo.com/board" },
      { source: "retailer:rei", value: "rocker", sourceUrl: "https://rei.com/board" },
      { source: "retailer:tactics", value: "camber", sourceUrl: "https://tactics.com/board" },
    ];
    const result = findConsensus(entries, "profile");
    expect(result).toEqual({
      value: "camber",
      sources: ["retailer:evo", "retailer:tactics"],
    });
  });
});
