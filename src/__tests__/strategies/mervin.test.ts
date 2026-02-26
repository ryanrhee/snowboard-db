import { describe, it, expect } from "vitest";
import { MervinStrategy } from "../../lib/strategies/mervin";
import type { BoardSignal } from "../../lib/strategies/types";

function signal(overrides: Partial<BoardSignal> = {}): BoardSignal {
  return {
    rawModel: "Skunk Ape",
    brand: "Lib Tech",
    manufacturer: "mervin",
    source: "retailer:evo",
    sourceUrl: "https://evo.com/skunk-ape",
    ...overrides,
  };
}

const strategy = new MervinStrategy();

describe("MervinStrategy", () => {
  describe("contour code extraction from rawModel", () => {
    it("extracts C2 contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Skunk Ape C2" }));
      expect(result.model).toBe("Skunk Ape");
      expect(result.profileVariant).toBe("c2");
    });

    it("extracts C2X contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Skunk Ape C2X" }));
      expect(result.model).toBe("Skunk Ape");
      expect(result.profileVariant).toBe("c2x");
    });

    it("extracts C3 contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Legitimizer C3" }));
      expect(result.model).toBe("Legitimizer");
      expect(result.profileVariant).toBe("c3");
    });

    it("maps Camber suffix to c3 for Mervin", () => {
      const result = strategy.identify(signal({ rawModel: "Skunk Ape Camber" }));
      expect(result.model).toBe("Skunk Ape");
      expect(result.profileVariant).toBe("c3");
    });

    it("extracts BTX contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Skate Banana BTX" }));
      expect(result.model).toBe("Skate Banana");
      expect(result.profileVariant).toBe("btx");
    });
  });

  describe("contour code derivation from profile spec", () => {
    it("derives c2x from profile when no code in model", () => {
      const result = strategy.identify(signal({
        rawModel: "Ladies Choice",
        brand: "GNU",
        profile: "C2X",
      }));
      expect(result.model).toBe("Ladies Choice");
      expect(result.profileVariant).toBe("c2x");
    });

    it("derives c3 from camber profile", () => {
      const result = strategy.identify(signal({
        rawModel: "Skunk Ape",
        profile: "Camber",
      }));
      expect(result.model).toBe("Skunk Ape");
      expect(result.profileVariant).toBe("c3");
    });

    it("derives c2 from hybrid camber profile", () => {
      const result = strategy.identify(signal({
        rawModel: "Skunk Ape",
        profile: "Hybrid Camber",
      }));
      expect(result.model).toBe("Skunk Ape");
      expect(result.profileVariant).toBe("c2");
    });

    it("derives btx from hybrid rocker profile", () => {
      const result = strategy.identify(signal({
        rawModel: "Skate Banana",
        profile: "Hybrid Rocker",
      }));
      expect(result.model).toBe("Skate Banana");
      expect(result.profileVariant).toBe("btx");
    });
  });

  describe("GNU-specific transforms", () => {
    it("strips C prefix from GNU models", () => {
      const result = strategy.identify(signal({
        rawModel: "C Money C3",
        brand: "GNU",
      }));
      expect(result.model).toBe("Money");
      expect(result.profileVariant).toBe("c3");
    });

    it("strips C suffix from GNU models", () => {
      const result = strategy.identify(signal({
        rawModel: "Gloss C",
        brand: "GNU",
      }));
      // Gloss-C → Gloss C (hyphen replaced) → C stripped → Gloss
      expect(result.model).toBe("Gloss");
    });

    it("strips Asym prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Asym Ladies Choice C2X",
        brand: "GNU",
      }));
      expect(result.model).toBe("Ladies Choice");
      expect(result.profileVariant).toBe("c2x");
    });

    it("strips rider names for GNU", () => {
      const result = strategy.identify(signal({
        rawModel: "Forest Bailey Head Space C3",
        brand: "GNU",
      }));
      expect(result.model).toBe("Head Space");
      expect(result.profileVariant).toBe("c3");
    });

    it("handles full GNU retailer model string", () => {
      const result = strategy.identify(signal({
        rawModel: "GNU Asym Ladies Choice C2X Snowboard - Women's 2025",
        brand: "GNU",
      }));
      expect(result.model).toBe("Ladies Choice");
      expect(result.profileVariant).toBe("c2x");
    });
  });

  describe("Lib Tech-specific transforms", () => {
    it("strips Tech brand leak prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Tech Legitimizer C3 Snowboard 2025",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("Legitimizer");
      expect(result.profileVariant).toBe("c3");
    });

    it("normalizes T.Rice and strips rider name", () => {
      const result = strategy.identify(signal({
        rawModel: "T.Rice Pro C2",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("Pro");
      expect(result.profileVariant).toBe("c2");
    });

    it("strips Travis Rice rider name", () => {
      const result = strategy.identify(signal({
        rawModel: "Travis Rice Orca",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("Orca");
    });
  });

  describe("model aliases", () => {
    it("aliases Son Of A Birdman → son of birdman", () => {
      const result = strategy.identify(signal({
        rawModel: "Son Of A Birdman",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("son of birdman");
    });
  });

  describe("no profileVariant when no code and no profile spec", () => {
    it("returns null profileVariant for plain model", () => {
      const result = strategy.identify(signal({
        rawModel: "Cold Brew C2 LTD",
        brand: "Lib Tech",
      }));
      // "C2 LTD" — C2 is not at end (LTD follows), so no contour extraction
      expect(result.model).toBe("Cold Brew C2 LTD");
      expect(result.profileVariant).toBeNull();
    });
  });
});
