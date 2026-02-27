import { describe, it, expect } from "vitest";
import { BurtonStrategy } from "../../lib/strategies/burton";
import type { BoardSignal } from "../../lib/strategies/types";

function signal(overrides: Partial<BoardSignal> = {}): BoardSignal {
  return {
    rawModel: "Custom",
    brand: "Burton",
    source: "retailer:tactics",
    sourceUrl: "https://tactics.com/custom",
    ...overrides,
  };
}

const strategy = new BurtonStrategy();

describe("BurtonStrategy", () => {
  describe("profile suffixes retained in model name", () => {
    it("retains Camber suffix", () => {
      const result = strategy.identify(signal({ rawModel: "Custom Camber" }));
      expect(result.model).toBe("Custom Camber");
    });

    it("retains Flying V suffix", () => {
      const result = strategy.identify(signal({ rawModel: "Custom Flying V" }));
      expect(result.model).toBe("Custom Flying V");
    });

    it("retains Flat Top suffix", () => {
      const result = strategy.identify(signal({ rawModel: "Hideaway Flat Top" }));
      expect(result.model).toBe("Hideaway Flat Top");
    });

    it("retains PurePop Camber suffix", () => {
      const result = strategy.identify(signal({ rawModel: "Instigator PurePop Camber" }));
      expect(result.model).toBe("Instigator PurePop Camber");
    });

    it("handles model with no profile suffix", () => {
      const result = strategy.identify(signal({ rawModel: "Custom" }));
      expect(result.model).toBe("Custom");
    });
  });

  describe("model normalization", () => {
    it("strips Snowboard suffix and year", () => {
      const result = strategy.identify(signal({
        rawModel: "Custom Snowboard 2026",
      }));
      expect(result.model).toBe("Custom");
    });

    it("strips brand prefix but retains profile suffix", () => {
      const result = strategy.identify(signal({
        rawModel: "Burton Custom Camber",
      }));
      expect(result.model).toBe("Custom Camber");
    });

    it("strips combo info but retains profile suffix", () => {
      const result = strategy.identify(signal({
        rawModel: "Instigator Camber Snowboard + Malavita Re:Flex Binding",
      }));
      expect(result.model).toBe("Instigator Camber");
    });

    it("applies Burton-specific prefix aliases with profile suffix retained", () => {
      const result = strategy.identify(signal({
        rawModel: "Fish 3D Directional Flat Top Snowboard 2026",
      }));
      // "Fish 3D Directional " prefix matches → "3d fish directional " + "Flat Top"
      expect(result.model).toBe("3d fish directional Flat Top");
    });
  });
});
