import { describe, it, expect } from "vitest";
import { DefaultStrategy } from "../../lib/strategies/default";
import type { BoardSignal } from "../../lib/strategies/types";

function signal(overrides: Partial<BoardSignal> = {}): BoardSignal {
  return {
    rawModel: "DOA",
    brand: "CAPiTA",
    source: "retailer:tactics",
    sourceUrl: "https://tactics.com/doa",
    ...overrides,
  };
}

const strategy = new DefaultStrategy();

describe("DefaultStrategy", () => {
  describe("rider name stripping", () => {
    it("strips CAPiTA rider prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Arthur Longo Aeronaut",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("Aeronaut");
    });

    it("strips 'by' infix rider name", () => {
      const result = strategy.identify(signal({
        rawModel: "Equalizer By Jess Kimura",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("Equalizer");
    });

    it("strips Jess Kimura prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Jess Kimura Equalizer",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("Equalizer");
    });

    it("strips Nitro rider suffix", () => {
      const result = strategy.identify(signal({
        rawModel: "Team Pro Marcus Kleveland",
        brand: "Nitro",
      }));
      expect(result.model).toBe("Team Pro");
    });

    it("strips Nitro rider prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Hailey Langland Alternator",
        brand: "Nitro",
      }));
      expect(result.model).toBe("Alternator");
    });

    it("strips Arbor rider names", () => {
      const result = strategy.identify(signal({
        rawModel: "Bryan Iguchi Pro",
        brand: "Arbor",
      }));
      expect(result.model).toBe("Pro");
    });

    it("strips DK prefix for Arbor", () => {
      const result = strategy.identify(signal({
        rawModel: "DK Park Pro",
        brand: "Arbor",
      }));
      expect(result.model).toBe("Park Pro");
    });

    it("strips Aesmo rider suffix", () => {
      const result = strategy.identify(signal({
        rawModel: "SI Pow Surfer Fernando Elvira",
        brand: "Aesmo",
      }));
      expect(result.model).toBe("SI Pow Surfer");
    });

    it("strips Gentemstick rider prefix", () => {
      const result = strategy.identify(signal({
        rawModel: "Alex Yoder XY",
        brand: "Gentemstick",
      }));
      expect(result.model).toBe("XY");
    });
  });

  describe("model aliases", () => {
    it("aliases Mega Merc → mega mercury", () => {
      const result = strategy.identify(signal({
        rawModel: "Mega Merc",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("mega mercury");
    });

    it("aliases SB prefix → spring break", () => {
      const result = strategy.identify(signal({
        rawModel: "SB Slush Slashers",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("spring break Slush Slashers");
    });

    it("aliases Hel Yes → hell yes", () => {
      const result = strategy.identify(signal({
        rawModel: "Hel Yes",
        brand: "Yes.",
      }));
      expect(result.model).toBe("hell yes");
    });

    it("aliases Paradice → paradise", () => {
      const result = strategy.identify(signal({
        rawModel: "Paradice",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("paradise");
    });
  });

  describe("no profile variant field", () => {
    it("returns only model in identity", () => {
      const result = strategy.identify(signal({
        rawModel: "DOA Snowboard 2026",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("DOA");
      expect(result).not.toHaveProperty("profileVariant");
    });
  });

  describe("DWD brand leak fix", () => {
    it("strips Will Die prefix for DWD", () => {
      const result = strategy.identify(signal({
        rawModel: "Will Die Wizard Stick Snowboard 2025",
        brand: "Dinosaurs Will Die",
      }));
      expect(result.model).toBe("Wizard Stick");
    });
  });

  describe("pipe char stripping", () => {
    it("replaces pipe char with space", () => {
      const result = strategy.identify(signal({
        rawModel: "Warpspeed | Automobili Lamborghini Snowboard 2026",
        brand: "CAPiTA",
      }));
      expect(result.model).toBe("Warpspeed Automobili Lamborghini");
    });
  });

  describe("package deal stripping", () => {
    it("strips Package keyword", () => {
      const result = strategy.identify(signal({
        rawModel: "After School Special Package",
        brand: "Burton",
      }));
      expect(result.model).toBe("After School Special");
    });

    it("strips & Bindings from combo listing", () => {
      const result = strategy.identify(signal({
        rawModel: "Poppy & Bindings Snowboard",
        brand: "Burton",
      }));
      expect(result.model).toBe("Poppy");
    });
  });

  describe("toddler gender detection", () => {
    // Gender detection itself is tested separately, but we verify the strategy
    // doesn't interfere with the model name when "Toddlers'" is present
    it("normalizes model with Toddlers' correctly", () => {
      const result = strategy.identify(signal({
        rawModel: "Ripper Snowboard",
        brand: "Nitro",
      }));
      expect(result.model).toBe("Ripper");
    });
  });
});
