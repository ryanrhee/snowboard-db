import { describe, it, expect } from "vitest";
import { BoardIdentifier } from "../lib/board-identifier";
import { ListingCondition, GenderTarget } from "../lib/types";

describe("BoardIdentifier", () => {
  describe("field independence", () => {
    it("derives condition, gender, model, and year independently from raw inputs", () => {
      const id = new BoardIdentifier({
        rawModel: "Women's Custom Snowboard (Blem) 2025",
        rawBrand: "Burton",
      });

      expect(id.condition).toBe(ListingCondition.BLEMISHED);
      expect(id.gender).toBe(GenderTarget.WOMENS);
      expect(id.model).toBe("Custom");
      expect(id.year).toBe(2025);
    });

    it("produces same results regardless of access order", () => {
      const a = new BoardIdentifier({
        rawModel: "Women's Custom Snowboard (Blem) 2025",
        rawBrand: "Burton",
      });
      const b = new BoardIdentifier({
        rawModel: "Women's Custom Snowboard (Blem) 2025",
        rawBrand: "Burton",
      });

      // Access in opposite order
      const aModel = a.model;
      const aCondition = a.condition;
      const aGender = a.gender;
      const aYear = a.year;

      const bYear = b.year;
      const bGender = b.gender;
      const bCondition = b.condition;
      const bModel = b.model;

      expect(aModel).toBe(bModel);
      expect(aCondition).toBe(bCondition);
      expect(aGender).toBe(bGender);
      expect(aYear).toBe(bYear);
    });
  });

  describe("URL condition detection", () => {
    it("-closeout URL → CLOSEOUT", () => {
      const id = new BoardIdentifier({
        rawModel: "Psychocandy Snowboard 2025",
        rawBrand: "Ride",
        url: "https://tactics.com/ride/psychocandy-snowboard-closeout",
      });
      expect(id.condition).toBe(ListingCondition.CLOSEOUT);
    });

    it("-blem URL → BLEMISHED", () => {
      const id = new BoardIdentifier({
        rawModel: "T. Rice Apex Orca Snowboard 2026",
        rawBrand: "Lib Tech",
        url: "https://evo.com/snowboards/lib-tech-t-rice-apex-orca-blem",
      });
      expect(id.condition).toBe(ListingCondition.BLEMISHED);
    });

    it("/outlet/ URL → CLOSEOUT", () => {
      const id = new BoardIdentifier({
        rawModel: "Some Board",
        rawBrand: "Burton",
        url: "https://example.com/outlet/boards/some-board",
      });
      expect(id.condition).toBe(ListingCondition.CLOSEOUT);
    });
  });

  describe("scraper hint overrides", () => {
    it("conditionHint overrides model string detection", () => {
      const id = new BoardIdentifier({
        rawModel: "Custom Snowboard (Blem) 2025",
        rawBrand: "Burton",
        conditionHint: "closeout",
      });
      // Model says Blem, but hint says closeout — hint wins
      expect(id.condition).toBe(ListingCondition.CLOSEOUT);
    });

    it("genderHint overrides model string detection", () => {
      const id = new BoardIdentifier({
        rawModel: "Women's Custom Snowboard 2025",
        rawBrand: "Burton",
        genderHint: "Men's",
      });
      expect(id.gender).toBe(GenderTarget.UNISEX);
    });

    it("yearHint overrides model year inference", () => {
      const id = new BoardIdentifier({
        rawModel: "Custom Snowboard 2025",
        rawBrand: "Burton",
        yearHint: 2024,
      });
      expect(id.year).toBe(2024);
    });
  });

  describe("brand normalization", () => {
    it("normalizes brand through normalizeBrand", () => {
      const id = new BoardIdentifier({
        rawModel: "Skate Banana",
        rawBrand: "lib tech",
      });
      expect(id.brand).toBe("Lib Tech");
    });

    it("strips brand prefix from model", () => {
      const id = new BoardIdentifier({
        rawModel: "Burton Custom Snowboard 2026",
        rawBrand: "Burton",
      });
      expect(id.model).toBe("Custom");
    });
  });

  describe("null year", () => {
    it("returns null when no year in model and no hint", () => {
      const id = new BoardIdentifier({
        rawModel: "Custom",
        rawBrand: "Burton",
      });
      expect(id.year).toBeNull();
    });
  });
});
