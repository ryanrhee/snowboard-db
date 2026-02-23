import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseReviewHtml } from "../lib/review-sites/the-good-ride";

const REVIEW_HTML = readFileSync(
  resolve(__dirname, "fixtures/the-good-ride-review.html"),
  "utf-8",
);

const TEST_URL =
  "https://www.thegoodride.com/snowboard-reviews/burton-custom-snowboard-review/";

describe("parseReviewHtml (Burton Custom fixture)", () => {
  const result = parseReviewHtml(REVIEW_HTML, TEST_URL);

  it("returns non-null for a valid review page", () => {
    expect(result).not.toBeNull();
  });

  it('parses shape as "Twinish"', () => {
    expect(result!.shape).toBe("Twinish");
  });

  it('parses profile as "Traditional Camber"', () => {
    expect(result!.profile).toBe("Traditional Camber");
  });

  it('parses category as "All Mountain" from riding style', () => {
    expect(result!.category).toBe("All Mountain");
  });

  it('parses abilityLevel as "Intermediate - Expert" from riding level', () => {
    expect(result!.abilityLevel).toBe("Intermediate - Expert");
  });

  it("parses msrpUsd as 659", () => {
    expect(result!.msrpUsd).toBe(659);
  });

  it('parses flex as "8" from first rating-bar image /img/80.png', () => {
    expect(result!.flex).toBe("8");
  });

  it("sets sourceUrl to the URL passed in", () => {
    expect(result!.sourceUrl).toBe(TEST_URL);
  });

  it('extras contains "riding style" with value "All Mountain"', () => {
    expect(result!.extras["riding style"]).toBe("All Mountain");
  });

  it('extras contains "shape" with value "Twinish"', () => {
    expect(result!.extras["shape"]).toBe("Twinish");
  });

  it('extras contains "camber profile" with value "Traditional Camber"', () => {
    expect(result!.extras["camber profile"]).toBe("Traditional Camber");
  });

  it('extras contains "riding level" with value "Intermediate - Expert"', () => {
    expect(result!.extras["riding level"]).toBe("Intermediate - Expert");
  });

  it('extras contains "manufactured in" with value "China"', () => {
    expect(result!.extras["manufactured in"]).toBe("China");
  });

  it('extras contains "stance" key', () => {
    expect(result!.extras).toHaveProperty("stance");
  });

  it("extras contains a boot size key", () => {
    expect(result!.extras["fits boot size (us)"]).toBe("8-10, 10-12, > 12");
  });
});
