import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { extractDetailAttrs, parseCatalogHtml } from "../lib/manufacturers/burton";

const DETAIL_HTML = readFileSync(resolve(__dirname, "fixtures/burton-detail.html"), "utf-8");
const CATALOG_HTML = readFileSync(resolve(__dirname, "fixtures/burton-catalog.html"), "utf-8");

describe("extractDetailAttrs with real detail page HTML", () => {
  const attrs = extractDetailAttrs(DETAIL_HTML);

  it("returns a non-empty object", () => {
    expect(Object.keys(attrs).length).toBeGreaterThan(0);
  });

  it("contains Board Terrain with an array value", () => {
    expect(attrs["Board Terrain"]).toBeDefined();
    expect(Array.isArray(attrs["Board Terrain"])).toBe(true);
  });

  it("Board Terrain includes All Mountain", () => {
    expect(attrs["Board Terrain"]).toContain("All Mountain");
  });

  it("contains Board Bend", () => {
    expect(attrs["Board Bend"]).toBeDefined();
  });

  it("Board Bend includes Camber", () => {
    expect(attrs["Board Bend"]).toContain("Camber");
  });

  it("contains Board Shape", () => {
    expect(attrs["Board Shape"]).toBeDefined();
  });

  it("Board Shape includes All Mountain Directional", () => {
    expect(attrs["Board Shape"]).toContain("All Mountain Directional");
  });

  it("contains Board Skill Level", () => {
    expect(attrs["Board Skill Level"]).toBeDefined();
  });

  it("Board Skill Level includes Expert", () => {
    expect(attrs["Board Skill Level"]).toContain("Expert");
  });

  it("contains Waist Width (numeric spec)", () => {
    expect(attrs["Waist Width"]).toBeDefined();
  });

  it("contains Effective Edge", () => {
    expect(attrs["Effective Edge"]).toBeDefined();
  });

  it("contains Rider Weight Range", () => {
    expect(attrs["Rider Weight Range"]).toBeDefined();
  });
});

describe("parseCatalogHtml with real catalog page HTML", () => {
  const boards = parseCatalogHtml(CATALOG_HTML);

  it("returns a non-empty array", () => {
    expect(boards.length).toBeGreaterThan(0);
  });

  it("contains more than 5 boards", () => {
    expect(boards.length).toBeGreaterThan(5);
  });

  it("each board has a non-empty name", () => {
    for (const board of boards) {
      expect(board.name).toBeTruthy();
      expect(board.name.length).toBeGreaterThan(0);
    }
  });

  it("each board has a sourceUrl starting with https://www.burton.com or /", () => {
    for (const board of boards) {
      const valid =
        board.sourceUrl.startsWith("https://www.burton.com") ||
        board.sourceUrl.startsWith("/");
      expect(valid).toBe(true);
    }
  });

  it("at least one board has a non-null msrp", () => {
    const hasPrice = boards.some((b) => b.msrp !== null && typeof b.msrp === "number");
    expect(hasPrice).toBe(true);
  });

  it("at least one board name includes Custom", () => {
    const hasCustom = boards.some((b) => b.name.includes("Custom"));
    expect(hasCustom).toBe(true);
  });

  it("board descriptions are non-empty strings", () => {
    for (const board of boards) {
      expect(typeof board.description).toBe("string");
      expect(board.description.trim().length).toBeGreaterThan(0);
    }
  });
});
