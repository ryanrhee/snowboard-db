import { describe, it, expect } from "vitest";
import { parseSlug, diceCoefficient } from "../lib/review-sites/the-good-ride";

describe("parseSlug", () => {
  // Known multi-word brands
  it('parses "lib-tech-skate-banana"', () => {
    expect(parseSlug("lib-tech-skate-banana")).toEqual({
      brand: "Lib Tech",
      model: "skate banana",
    });
  });

  it('parses "never-summer-proto-synthesis"', () => {
    expect(parseSlug("never-summer-proto-synthesis")).toEqual({
      brand: "Never Summer",
      model: "proto synthesis",
    });
  });

  it('parses "dinosaurs-will-die-wizard-stick"', () => {
    expect(parseSlug("dinosaurs-will-die-wizard-stick")).toEqual({
      brand: "Dinosaurs Will Die",
      model: "wizard stick",
    });
  });

  it('parses "gnu-snowboards-money"', () => {
    expect(parseSlug("gnu-snowboards-money")).toEqual({
      brand: "GNU",
      model: "money",
    });
  });

  it('parses "jones-snowboards-mountain-twin"', () => {
    expect(parseSlug("jones-snowboards-mountain-twin")).toEqual({
      brand: "Jones",
      model: "mountain twin",
    });
  });

  it('parses "yes-snowboards-basic"', () => {
    expect(parseSlug("yes-snowboards-basic")).toEqual({
      brand: "Yes.",
      model: "basic",
    });
  });

  it('parses "k2-snowboarding-excavator"', () => {
    expect(parseSlug("k2-snowboarding-excavator")).toEqual({
      brand: "K2",
      model: "excavator",
    });
  });

  it('parses "united-shapes-orbit"', () => {
    expect(parseSlug("united-shapes-orbit")).toEqual({
      brand: "United Shapes",
      model: "orbit",
    });
  });

  it('parses "spring-break-slush-slasher"', () => {
    expect(parseSlug("spring-break-slush-slasher")).toEqual({
      brand: "Spring Break",
      model: "slush slasher",
    });
  });

  // Single-word brand fallback (not in KNOWN_SLUG_BRANDS)
  it('falls back for unknown brand "burton-custom"', () => {
    expect(parseSlug("burton-custom")).toEqual({
      brand: "burton",
      model: "custom",
    });
  });

  it('falls back for unknown brand "capita-doa"', () => {
    expect(parseSlug("capita-doa")).toEqual({
      brand: "capita",
      model: "doa",
    });
  });

  // Brand-only slugs (no model) → null
  it('returns null for brand-only slug "lib-tech"', () => {
    expect(parseSlug("lib-tech")).toBeNull();
  });

  it('returns null for brand-only slug "never-summer"', () => {
    expect(parseSlug("never-summer")).toBeNull();
  });

  // Single segment → null
  it('returns null for single segment "burton"', () => {
    expect(parseSlug("burton")).toBeNull();
  });
});

describe("diceCoefficient", () => {
  it("returns 1.0 for identical strings", () => {
    expect(diceCoefficient("custom", "custom")).toBe(1.0);
  });

  it("returns 1.0 for both empty strings", () => {
    expect(diceCoefficient("", "")).toBe(1.0);
  });

  it("returns 0 when one string is empty and the other is not", () => {
    expect(diceCoefficient("", "hello")).toBe(0);
    expect(diceCoefficient("hello", "")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(diceCoefficient("Custom", "custom")).toBe(1.0);
  });

  it("strips non-alphanumeric characters", () => {
    expect(diceCoefficient("T.Rice", "TRice")).toBe(1.0);
  });

  it("is symmetric: dice(a,b) === dice(b,a)", () => {
    const a = "snowboard";
    const b = "skateboard";
    expect(diceCoefficient(a, b)).toBe(diceCoefficient(b, a));
  });

  it("returns a value between 0 and 1 for partial similarity", () => {
    const score = diceCoefficient("custom", "custom x");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(diceCoefficient("aaa", "zzz")).toBe(0);
  });

  it("returns 1.0 for single-char strings (both have empty bigram sets)", () => {
    expect(diceCoefficient("a", "b")).toBe(1.0);
  });

  it("handles short partial match", () => {
    const score = diceCoefficient("ab", "abc");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});
