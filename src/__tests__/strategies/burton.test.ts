import { describe, it, expect } from "vitest";
import { BurtonStrategy } from "../../lib/strategies/burton";
import type { BoardSignal } from "../../lib/strategies/types";

function signal(overrides: Partial<BoardSignal> = {}): BoardSignal {
  return {
    rawModel: "Custom",
    brand: "Burton",
    manufacturer: "burton",
    source: "retailer:tactics",
    sourceUrl: "https://tactics.com/custom",
    ...overrides,
  };
}

const strategy = new BurtonStrategy();

describe("BurtonStrategy", () => {
  describe("profile variant extraction", () => {
    it("extracts Camber profile variant", () => {
      const result = strategy.identify(signal({ rawModel: "Custom Camber" }));
      expect(result.model).toBe("Custom");
      expect(result.profileVariant).toBe("camber");
    });

    it("extracts Flying V profile variant", () => {
      const result = strategy.identify(signal({ rawModel: "Custom Flying V" }));
      expect(result.model).toBe("Custom");
      expect(result.profileVariant).toBe("flying v");
    });

    it("extracts Flat Top profile variant", () => {
      const result = strategy.identify(signal({ rawModel: "Hideaway Flat Top" }));
      expect(result.model).toBe("Hideaway");
      expect(result.profileVariant).toBe("flat top");
    });

    it("extracts PurePop Camber profile variant", () => {
      const result = strategy.identify(signal({ rawModel: "Instigator PurePop Camber" }));
      expect(result.model).toBe("Instigator");
      expect(result.profileVariant).toBe("purepop camber");
    });

    it("returns null profileVariant for no-profile model", () => {
      const result = strategy.identify(signal({ rawModel: "Custom" }));
      expect(result.model).toBe("Custom");
      expect(result.profileVariant).toBeNull();
    });
  });

  describe("model normalization", () => {
    it("strips Snowboard suffix and year", () => {
      const result = strategy.identify(signal({
        rawModel: "Custom Snowboard 2026",
      }));
      expect(result.model).toBe("Custom");
    });

    it("strips brand prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Burton Custom Camber",
      }));
      expect(result.model).toBe("Custom");
      expect(result.profileVariant).toBe("camber");
    });

    it("strips combo info", () => {
      const result = strategy.identify(signal({
        rawModel: "Instigator Camber Snowboard + Malavita Re:Flex Binding",
      }));
      expect(result.model).toBe("Instigator");
      expect(result.profileVariant).toBe("camber");
    });

    it("applies Burton-specific aliases", () => {
      const result = strategy.identify(signal({
        rawModel: "Fish 3D Directional Flat Top Snowboard 2026",
      }));
      expect(result.model).toBe("3d fish directional");
      expect(result.profileVariant).toBe("flat top");
    });
  });
});
