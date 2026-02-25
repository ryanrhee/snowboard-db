import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseDetailHtml } from "../lib/manufacturers/lib-tech";

const DETAIL_HTML = readFileSync(
  resolve(__dirname, "fixtures/lib-tech-detail.html"),
  "utf-8"
);

const result = parseDetailHtml(
  DETAIL_HTML,
  "https://www.lib-tech.com/snowboards/skate-banana",
  "Skate Banana",
  null
);

describe("parseDetailHtml — Skate Banana fixture", () => {
  it("brand is Lib Tech", () => {
    expect(result.brand).toBe("Lib Tech");
  });

  it("model is Skate Banana", () => {
    expect(result.model).toBe("Skate Banana");
  });

  it("extracts model from the h1.page-title element", () => {
    expect(result.model).not.toBe("Lib Tech Skate Banana");
    expect(result.model).toBe("Skate Banana");
  });

  it("flex is null (extracted from infographic pixel analysis, not scraper)", () => {
    expect(result.flex).toBeNull();
  });

  it("profile is Original Banana (from contour image alt text)", () => {
    expect(result.profile).toBe("Original Banana");
  });

  it("shape is true twin (from description first line TWIN)", () => {
    expect(result.shape).toBe("true twin");
  });

  it("category is freestyle/all-mountain (from description first line)", () => {
    expect(result.category).toBe("freestyle/all-mountain");
  });

  it("sourceUrl is the URL passed in", () => {
    expect(result.sourceUrl).toBe(
      "https://www.lib-tech.com/snowboards/skate-banana"
    );
  });

  it("extras contains size (cm) from the spec table", () => {
    expect(result.extras["size (cm)"]).toBeDefined();
    expect(result.extras["size (cm)"]).toBe("150");
  });

  it("extras contains waist width from the spec table", () => {
    expect(result.extras["waistwidth (cm)"]).toBe("25");
  });

  it("extras contains contact length from the spec table", () => {
    expect(result.extras["contactlength (cm)"]).toBe("112");
  });

  it("extras does not contain ability level (extracted from infographic pixel analysis)", () => {
    expect(result.extras["ability level"]).toBeUndefined();
  });

  it("extras contains flex column keyed by its full header text", () => {
    expect(result.extras["flex10 = firm"]).toBe("5");
  });

  it("msrpUsd is null because no JSON-LD price and fallback is null", () => {
    expect(result.msrpUsd).toBeNull();
  });

  it("year is null (Lib Tech pages do not expose model year in structured data)", () => {
    expect(result.year).toBeNull();
  });
});
