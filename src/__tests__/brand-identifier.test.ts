import { describe, it, expect } from "vitest";
import { BrandIdentifier } from "../lib/strategies/brand-identifier";

// =============================================================================
// cleaned — strip unicode + snowboard suffixes
// =============================================================================

describe("BrandIdentifier.cleaned", () => {
  it("strips zero-width unicode chars", () => {
    expect(new BrandIdentifier("Burton\u200b").cleaned).toBe("Burton");
    expect(new BrandIdentifier("\ufeffBurton").cleaned).toBe("Burton");
    expect(new BrandIdentifier("united\u200c shapes").cleaned).toBe("united shapes");
  });

  it('strips " Snowboards" suffix', () => {
    expect(new BrandIdentifier("Burton Snowboards").cleaned).toBe("Burton");
  });

  it('strips " Snowboard" (singular) suffix', () => {
    expect(new BrandIdentifier("Burton Snowboard").cleaned).toBe("Burton");
  });

  it('strips " Snowboard Co." suffix', () => {
    expect(new BrandIdentifier("Ride Snowboard Co.").cleaned).toBe("Ride");
    expect(new BrandIdentifier("Ride Snowboard Co").cleaned).toBe("Ride");
  });

  it('strips "Snowboarding" suffix', () => {
    expect(new BrandIdentifier("CAPiTA Snowboarding").cleaned).toBe("CAPiTA");
  });

  it("returns empty string for empty input", () => {
    expect(new BrandIdentifier("").cleaned).toBe("");
  });
});

// =============================================================================
// canonical — alias resolution
// =============================================================================

describe("BrandIdentifier.canonical", () => {
  it.each([
    ["yes", "Yes."],
    ["Yes.", "Yes."],
    ["YES", "Yes."],
    ["gnu", "GNU"],
    ["Gnu", "GNU"],
    ["GNU", "GNU"],
    ["lib", "Lib Tech"],
    ["libtech", "Lib Tech"],
    ["lib tech", "Lib Tech"],
    ["lib technologies", "Lib Tech"],
    ["Lib Technologies", "Lib Tech"],
    ["capita", "CAPiTA"],
    ["capita snowboarding", "CAPiTA"],
    ["CAPITA", "CAPiTA"],
    ["dwd", "Dinosaurs Will Die"],
    ["dinosaurs", "Dinosaurs Will Die"],
    ["dinosaurs will die", "Dinosaurs Will Die"],
    ["sims", "Sims"],
    ["never summer", "Never Summer"],
    ["united shapes", "United Shapes"],
  ])("new BrandIdentifier(%j).canonical → %s", (raw, expected) => {
    expect(new BrandIdentifier(raw).canonical).toBe(expected);
  });

  it("passes through unknown brands unchanged", () => {
    expect(new BrandIdentifier("Burton").canonical).toBe("Burton");
    expect(new BrandIdentifier("Jones").canonical).toBe("Jones");
    expect(new BrandIdentifier("RIDE").canonical).toBe("RIDE");
  });

  it("combines cleaning and alias resolution", () => {
    expect(new BrandIdentifier("Lib Tech Snowboards").canonical).toBe("Lib Tech");
    expect(new BrandIdentifier("capita snowboarding").canonical).toBe("CAPiTA");
    expect(new BrandIdentifier("Yes. Snowboards").canonical).toBe("Yes.");
    expect(new BrandIdentifier("DWD Snowboards").canonical).toBe("Dinosaurs Will Die");
  });

  it("handles zero-width chars before alias resolution", () => {
    expect(new BrandIdentifier("never\u200b summer").canonical).toBe("Never Summer");
    expect(new BrandIdentifier("lib\u200d tech").canonical).toBe("Lib Tech");
    expect(new BrandIdentifier("\ufeffcapita").canonical).toBe("CAPiTA");
  });
});

// =============================================================================
// Immutability — raw is preserved, values are cached
// =============================================================================

describe("BrandIdentifier immutability", () => {
  it("preserves raw input", () => {
    const id = new BrandIdentifier("Lib Tech Snowboards");
    expect(id.raw).toBe("Lib Tech Snowboards");
  });

  it("caches computed values (same reference on repeated access)", () => {
    const id = new BrandIdentifier("gnu");
    const first = id.canonical;
    const second = id.canonical;
    expect(first).toBe("GNU");
    expect(first).toBe(second);
  });
});

// =============================================================================
// manufacturer — strategy dispatch key
// =============================================================================

describe("BrandIdentifier.manufacturer", () => {
  it.each([
    ["Burton", "burton"],
    ["burton", "burton"],
    ["Burton Snowboards", "burton"],
    ["GNU", "mervin"],
    ["gnu", "mervin"],
    ["Lib Tech", "mervin"],
    ["lib tech", "mervin"],
    ["Lib Technologies", "mervin"],
  ])("new BrandIdentifier(%j).manufacturer → %s", (raw, expected) => {
    expect(new BrandIdentifier(raw).manufacturer).toBe(expected);
  });

  it('returns "default" for brands without a specific manufacturer', () => {
    expect(new BrandIdentifier("CAPiTA").manufacturer).toBe("default");
    expect(new BrandIdentifier("Jones").manufacturer).toBe("default");
    expect(new BrandIdentifier("Ride").manufacturer).toBe("default");
    expect(new BrandIdentifier("Never Summer").manufacturer).toBe("default");
    expect(new BrandIdentifier("Nitro").manufacturer).toBe("default");
    expect(new BrandIdentifier("Yes.").manufacturer).toBe("default");
  });
});

// =============================================================================
// from — static factory with unknown candidate coalescing
// =============================================================================

describe("BrandIdentifier.from", () => {
  it("returns BrandIdentifier from first non-empty string", () => {
    const id = BrandIdentifier.from(undefined, null, "Burton");
    expect(id).not.toBeUndefined();
    expect(id!.canonical).toBe("Burton");
  });

  it("skips non-string values", () => {
    const id = BrandIdentifier.from({ name: "Burton" }, 42, "Jones");
    expect(id!.canonical).toBe("Jones");
  });

  it("skips empty and whitespace-only strings", () => {
    const id = BrandIdentifier.from("", "  ", "Ride");
    expect(id!.canonical).toBe("Ride");
  });

  it("returns undefined when no usable candidate exists", () => {
    expect(BrandIdentifier.from(undefined, null, "", 42)).toBeUndefined();
  });

  it("returns undefined with no arguments", () => {
    expect(BrandIdentifier.from()).toBeUndefined();
  });

  it("resolves aliases like the constructor", () => {
    const id = BrandIdentifier.from(null, "lib tech");
    expect(id!.canonical).toBe("Lib Tech");
    expect(id!.manufacturer).toBe("mervin");
  });
});
