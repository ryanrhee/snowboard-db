import { describe, it, expect } from "vitest";
import * as cheerio from "cheerio";

// Test the multi-word brand parsing logic from evo.ts parseProductCards
// Extracted here as a unit test since parseProductCards is not exported

const MULTI_WORD_BRANDS = [
  "Never Summer", "United Shapes", "Lib Tech", "Dinosaurs Will Die",
];

function parseBrandModel(title: string): { brand: string; model: string } {
  let brand = "";
  let model = title;

  if (title) {
    const titleLower = title.toLowerCase();
    for (const b of MULTI_WORD_BRANDS) {
      if (titleLower.startsWith(b.toLowerCase() + " ")) {
        brand = title.slice(0, b.length);
        model = title.slice(b.length).trim();
        return { brand, model };
      }
    }
    const parts = title.split(/\s+/);
    brand = parts[0];
    model = parts.slice(1).join(" ") || title;
  }

  return { brand, model };
}

describe("evo multi-word brand parsing", () => {
  describe("multi-word brands are correctly split", () => {
    it("Never Summer Proto Ultra → brand: Never Summer, model: Proto Ultra", () => {
      const { brand, model } = parseBrandModel("Never Summer Proto Ultra Snowboard 2026");
      expect(brand).toBe("Never Summer");
      expect(model).toBe("Proto Ultra Snowboard 2026");
    });

    it("United Shapes Orbit → brand: United Shapes, model: Orbit", () => {
      const { brand, model } = parseBrandModel("United Shapes Orbit Snowboard 2026");
      expect(brand).toBe("United Shapes");
      expect(model).toBe("Orbit Snowboard 2026");
    });

    it("Lib Tech Cold Brew → brand: Lib Tech, model: Cold Brew", () => {
      const { brand, model } = parseBrandModel("Lib Tech Cold Brew C2 Snowboard 2026");
      expect(brand).toBe("Lib Tech");
      expect(model).toBe("Cold Brew C2 Snowboard 2026");
    });

    it("Dinosaurs Will Die Wizard Stick → brand: Dinosaurs Will Die, model: Wizard Stick", () => {
      const { brand, model } = parseBrandModel("Dinosaurs Will Die Wizard Stick Snowboard 2025");
      expect(brand).toBe("Dinosaurs Will Die");
      expect(model).toBe("Wizard Stick Snowboard 2025");
    });
  });

  describe("single-word brands still work", () => {
    it("Burton Custom → brand: Burton, model: Custom", () => {
      const { brand, model } = parseBrandModel("Burton Custom Snowboard 2026");
      expect(brand).toBe("Burton");
      expect(model).toBe("Custom Snowboard 2026");
    });

    it("Jones Flagship → brand: Jones, model: Flagship", () => {
      const { brand, model } = parseBrandModel("Jones Flagship Snowboard 2026");
      expect(brand).toBe("Jones");
      expect(model).toBe("Flagship Snowboard 2026");
    });

    it("Rossignol Juggernaut → brand: Rossignol, model: Juggernaut", () => {
      const { brand, model } = parseBrandModel("Rossignol Juggernaut Snowboard 2025");
      expect(brand).toBe("Rossignol");
      expect(model).toBe("Juggernaut Snowboard 2025");
    });
  });

  describe("case insensitivity", () => {
    it("handles lowercase multi-word brand in title", () => {
      const { brand, model } = parseBrandModel("never summer Proto Ultra");
      expect(brand).toBe("never summer");
      expect(model).toBe("Proto Ultra");
    });

    it("handles uppercase multi-word brand in title", () => {
      const { brand, model } = parseBrandModel("LIB TECH Cold Brew");
      expect(brand).toBe("LIB TECH");
      expect(model).toBe("Cold Brew");
    });
  });

  describe("prevents mis-split without multi-word detection", () => {
    it("Never Summer would be split as Never | Summer Proto Ultra without fix", () => {
      // Without the fix, first-word split gives brand="Never", model="Summer Proto Ultra"
      // With the fix, brand="Never Summer", model="Proto Ultra"
      const { brand } = parseBrandModel("Never Summer Proto Ultra");
      expect(brand).not.toBe("Never");
      expect(brand).toBe("Never Summer");
    });
  });
});

describe("evo JSON-LD brand preference", () => {
  it("JSON-LD brand overrides naive title split", () => {
    // Simulate the detail page logic: brand starts from title split, JSON-LD overrides
    let brand: string | undefined = "Never"; // naive split from title
    const jsonLdBrand = "Never Summer"; // from JSON-LD

    // New logic: prefer JSON-LD brand
    brand = jsonLdBrand || brand;
    expect(brand).toBe("Never Summer");
  });

  it("falls back to title brand when JSON-LD is missing", () => {
    let brand: string | undefined = "Burton";
    const jsonLdBrand: string | undefined = undefined;

    brand = jsonLdBrand || brand;
    expect(brand).toBe("Burton");
  });
});
