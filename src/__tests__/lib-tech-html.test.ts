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
    // The h1 in the fixture has "Skate Banana" — cleanModelName leaves it as-is
    // because there's no "Lib Tech" prefix or "Snowboard" suffix in the h1 text.
    expect(result.model).not.toBe("Lib Tech Skate Banana");
    expect(result.model).toBe("Skate Banana");
  });

  it("flex is 5 (from the spec table first data row)", () => {
    expect(result.flex).toBe("5");
  });

  it("profile is BTX (Banana Tech detected in description)", () => {
    expect(result.profile).toBe("BTX");
  });

  it("shape is null (description does not contain true twin / directional)", () => {
    // The Skate Banana is marketed as a twin, but the product description
    // text in the fixture does not contain "true twin", "perfectly twin",
    // "directional twin", or "directional", so shape remains null.
    expect(result.shape).toBeNull();
  });

  it("category is freestyle (description contains jib / freestyle keywords)", () => {
    // The description mentions "jibs" and "FREESTYLE PLAYGROUND".
    // The code checks all-mountain first, but neither "all-mountain" nor
    // "all mountain" appear in the description, so freestyle matches.
    expect(result.category).toBe("freestyle");
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
    // <th>Waist<br/>Width (cm)</th> parses as "waistwidth (cm)" because
    // cheerio .text() does not insert spaces for <br/> elements.
    expect(result.extras["waistwidth (cm)"]).toBe("25");
  });

  it("extras contains contact length from the spec table", () => {
    // <th>Contact<br/>Length (cm)</th> parses as "contactlength (cm)"
    expect(result.extras["contactlength (cm)"]).toBe("112");
  });

  it("extras contains ability level beginner-advanced from infographic", () => {
    expect(result.extras["ability level"]).toBe("beginner-advanced");
  });

  it("extras contains flex column keyed by its full header text", () => {
    // <th>Flex<br/><span>10 = Firm</span></th> parses as "flex10 = firm"
    expect(result.extras["flex10 = firm"]).toBe("5");
  });

  it("msrpUsd is null because no JSON-LD price and fallback is null", () => {
    expect(result.msrpUsd).toBeNull();
  });

  it("year is null (Lib Tech pages do not expose model year in structured data)", () => {
    expect(result.year).toBeNull();
  });
});
