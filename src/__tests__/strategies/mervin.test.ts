import { describe, it, expect } from "vitest";
import { MervinStrategy } from "../../lib/strategies/mervin";
import type { BoardSignal } from "../../lib/strategies/types";

function signal(overrides: Partial<BoardSignal> = {}): BoardSignal {
  return {
    rawModel: "Skunk Ape",
    brand: "Lib Tech",
    source: "retailer:evo",
    sourceUrl: "https://evo.com/skunk-ape",
    ...overrides,
  };
}

const strategy = new MervinStrategy();

describe("MervinStrategy", () => {
  describe("contour code stripping from rawModel", () => {
    it("strips C2 contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Skunk Ape C2" }));
      expect(result.model).toBe("Skunk Ape");
    });

    it("strips C2X contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Skunk Ape C2X" }));
      expect(result.model).toBe("Skunk Ape");
    });

    it("strips C3 contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Legitimizer C3" }));
      expect(result.model).toBe("Legitimizer");
    });

    it("retains Camber suffix as model name variant", () => {
      const result = strategy.identify(signal({ rawModel: "Skunk Ape Camber" }));
      expect(result.model).toBe("Skunk Ape Camber");
    });

    it("strips BTX contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Skate Banana BTX" }));
      expect(result.model).toBe("Skate Banana");
    });

    it("strips C2E contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Money C2E" }));
      expect(result.model).toBe("Money");
    });

    it("strips C3 BTX contour code", () => {
      const result = strategy.identify(signal({ rawModel: "Legitimizer C3 BTX" }));
      expect(result.model).toBe("Legitimizer");
    });
  });

  describe("GNU-specific transforms", () => {
    it("retains C prefix in GNU models (C Money stays C Money)", () => {
      const result = strategy.identify(signal({
        rawModel: "C Money C3",
        brand: "GNU",
      }));
      expect(result.model).toBe("C Money");
    });

    it("retains C suffix in GNU models (Gloss C stays Gloss C)", () => {
      const result = strategy.identify(signal({
        rawModel: "Gloss C",
        brand: "GNU",
      }));
      expect(result.model).toBe("Gloss C");
    });

    it("strips Asym prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Asym Ladies Choice C2X",
        brand: "GNU",
      }));
      expect(result.model).toBe("Ladies Choice");
    });

    it("strips rider names for GNU", () => {
      const result = strategy.identify(signal({
        rawModel: "Forest Bailey Head Space C3",
        brand: "GNU",
      }));
      expect(result.model).toBe("Head Space");
    });

    it("handles full GNU retailer model string", () => {
      const result = strategy.identify(signal({
        rawModel: "GNU Asym Ladies Choice C2X Snowboard - Women's 2025",
        brand: "GNU",
      }));
      expect(result.model).toBe("Ladies Choice");
    });
  });

  describe("Lib Tech-specific transforms", () => {
    it("strips Tech brand leak prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Tech Legitimizer C3 Snowboard 2025",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("Legitimizer");
    });

    it("normalizes T.Rice and strips rider name", () => {
      const result = strategy.identify(signal({
        rawModel: "T.Rice Pro C2",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("Pro");
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

  describe("non-trailing contour codes are preserved", () => {
    it("preserves C2 when not at end of model", () => {
      const result = strategy.identify(signal({
        rawModel: "Cold Brew C2 LTD",
        brand: "Lib Tech",
      }));
      expect(result.model).toBe("Cold Brew C2 LTD");
    });
  });
});
