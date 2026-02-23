import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseBodyHtml } from "../lib/manufacturers/capita";

const PRODUCTS_JSON = JSON.parse(
  readFileSync(resolve(__dirname, "fixtures/capita-products.json"), "utf-8")
);

// =============================================================================
// parseBodyHtml against real CAPiTA Shopify fixture data
// =============================================================================

describe("parseBodyHtml with real CAPiTA product data", () => {
  it("fixture contains products", () => {
    expect(PRODUCTS_JSON.products.length).toBeGreaterThan(0);
  });

  it("all products have expected structure (title, handle, body_html)", () => {
    for (const product of PRODUCTS_JSON.products) {
      expect(product).toHaveProperty("title");
      expect(product).toHaveProperty("handle");
      expect(product).toHaveProperty("body_html");
      expect(typeof product.title).toBe("string");
      expect(typeof product.handle).toBe("string");
    }
  });

  it("all products have variants array with price fields", () => {
    for (const product of PRODUCTS_JSON.products) {
      expect(product).toHaveProperty("variants");
      expect(Array.isArray(product.variants)).toBe(true);
      for (const variant of product.variants) {
        expect(variant).toHaveProperty("title");
        expect(variant).toHaveProperty("price");
      }
    }
  });

  it("parses a product with keyword-rich body_html (Mega Merc)", () => {
    const product = PRODUCTS_JSON.products.find(
      (p: { handle: string }) => p.handle === "mega-merc-2026"
    );
    expect(product).toBeDefined();

    const result = parseBodyHtml(product.body_html);
    expect(result).toBeDefined();

    // Mega Merc body_html contains recognizable category/profile keywords
    const hasAnySpec =
      result.flex !== null ||
      result.profile !== null ||
      result.shape !== null ||
      result.category !== null ||
      result.abilityLevel !== null ||
      Object.keys(result.extras).length > 0;
    expect(hasAnySpec).toBe(true);
  });

  it("parses the first 5 products without throwing errors", () => {
    const first5 = PRODUCTS_JSON.products.slice(0, 5);
    expect(first5.length).toBeGreaterThan(0);

    for (const product of first5) {
      const bodyHtml = product.body_html || "";
      expect(() => parseBodyHtml(bodyHtml)).not.toThrow();
      const result = parseBodyHtml(bodyHtml);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("flex");
      expect(result).toHaveProperty("profile");
      expect(result).toHaveProperty("shape");
      expect(result).toHaveProperty("category");
      expect(result).toHaveProperty("abilityLevel");
      expect(result).toHaveProperty("extras");
    }
  });

  it("at least one product among the first 5 has a non-null category", () => {
    const first5 = PRODUCTS_JSON.products.slice(0, 5);
    const categories = first5.map((p: { body_html: string }) =>
      parseBodyHtml(p.body_html || "").category
    );
    const hasCategory = categories.some((c: string | null) => c !== null);
    expect(hasCategory).toBe(true);
  });

  it("Mega Merc parses category as all-mountain", () => {
    const product = PRODUCTS_JSON.products.find(
      (p: { handle: string }) => p.handle === "mega-merc-2026"
    );
    expect(product).toBeDefined();

    const result = parseBodyHtml(product.body_html);
    expect(result.category).toBe("all-mountain");
  });

  it("returns all nulls with empty extras for empty body_html", () => {
    const result = parseBodyHtml("");
    expect(result).toEqual({
      flex: null,
      profile: null,
      shape: null,
      category: null,
      abilityLevel: null,
      extras: {},
    });
  });

  it("every product parseBodyHtml result has correct return shape", () => {
    for (const product of PRODUCTS_JSON.products) {
      const result = parseBodyHtml(product.body_html || "");
      expect(result).toMatchObject({
        flex: expect.toBeOneOf([expect.any(String), null]),
        profile: expect.toBeOneOf([expect.any(String), null]),
        shape: expect.toBeOneOf([expect.any(String), null]),
        category: expect.toBeOneOf([expect.any(String), null]),
        abilityLevel: expect.toBeOneOf([expect.any(String), null]),
        extras: expect.any(Object),
      });
    }
  });

  it("products with substantial body_html yield meaningful parsed output", () => {
    // Find products whose body_html has real content (>100 chars)
    const substantialProducts = PRODUCTS_JSON.products.filter(
      (p: { body_html: string }) =>
        p.body_html && p.body_html.length > 100
    );
    expect(substantialProducts.length).toBeGreaterThan(0);

    let atLeastOneMeaningful = false;
    for (const product of substantialProducts) {
      const result = parseBodyHtml(product.body_html);
      const hasSomething =
        result.flex !== null ||
        result.profile !== null ||
        result.shape !== null ||
        result.category !== null ||
        result.abilityLevel !== null ||
        Object.keys(result.extras).length > 0;
      if (hasSomething) atLeastOneMeaningful = true;
    }
    expect(atLeastOneMeaningful).toBe(true);
  });

  it("extras values are all strings", () => {
    for (const product of PRODUCTS_JSON.products) {
      const result = parseBodyHtml(product.body_html || "");
      for (const [key, value] of Object.entries(result.extras)) {
        expect(typeof key).toBe("string");
        expect(typeof value).toBe("string");
      }
    }
  });

  it("no product parsing produces extras keys longer than 30 chars", () => {
    for (const product of PRODUCTS_JSON.products) {
      const result = parseBodyHtml(product.body_html || "");
      for (const key of Object.keys(result.extras)) {
        expect(key.length).toBeLessThan(30);
      }
    }
  });
});
