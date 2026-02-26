import { describe, it, expect } from "vitest";
import {
  skillLevelToAbility,
  cleanModelName,
  parseCategoriesText,
  deriveGender,
} from "../lib/manufacturers/capita";
import { specKey } from "../lib/db";

// =============================================================================
// skillLevelToAbility
// =============================================================================

describe("skillLevelToAbility", () => {
  it("level 1 returns beginner", () => {
    expect(skillLevelToAbility(1)).toBe("beginner");
  });

  it("level 2 returns beginner-intermediate", () => {
    expect(skillLevelToAbility(2)).toBe("beginner-intermediate");
  });

  it("level 3 returns intermediate", () => {
    expect(skillLevelToAbility(3)).toBe("intermediate");
  });

  it("level 4 returns intermediate-advanced", () => {
    expect(skillLevelToAbility(4)).toBe("intermediate-advanced");
  });

  it("level 5 returns advanced-expert", () => {
    expect(skillLevelToAbility(5)).toBe("advanced-expert");
  });

  it("level 0 (out of range) defaults to intermediate", () => {
    expect(skillLevelToAbility(0)).toBe("intermediate");
  });

  it("level 99 (out of range) defaults to intermediate", () => {
    expect(skillLevelToAbility(99)).toBe("intermediate");
  });
});

// =============================================================================
// cleanModelName
// =============================================================================

describe("cleanModelName", () => {
  it('strips "CAPiTA " prefix', () => {
    expect(cleanModelName("CAPiTA Mercury")).toBe("Mercury");
  });

  it('strips "Capita " prefix', () => {
    expect(cleanModelName("Capita Mercury")).toBe("Mercury");
  });

  it('strips " Snowboard" suffix', () => {
    expect(cleanModelName("Mercury Snowboard")).toBe("Mercury");
  });

  it("strips both prefix and suffix", () => {
    expect(cleanModelName("CAPiTA Mercury Snowboard")).toBe("Mercury");
  });

  it("passes through a name with no prefix or suffix", () => {
    expect(cleanModelName("Mercury")).toBe("Mercury");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanModelName("  Mercury  ")).toBe("Mercury");
  });
});

// =============================================================================
// parseCategoriesText
// =============================================================================

describe("parseCategoriesText", () => {
  it("parses profile, shape, and category from unisex board", () => {
    const result = parseCategoriesText("Resort / True Twin / Hybrid Camber");
    expect(result.profile).toBe("Hybrid Camber");
    expect(result.shape).toBe("True Twin");
    expect(result.category).toBe("Resort");
    expect(result.gender).toBeNull();
  });

  it("detects womens gender from Women's label", () => {
    const result = parseCategoriesText("Women's / Resort / True Twin / Hybrid Camber");
    expect(result.gender).toBe("womens");
    expect(result.profile).toBe("Hybrid Camber");
    expect(result.shape).toBe("True Twin");
    expect(result.category).toBe("Resort");
  });

  it("detects womens gender from Women\u2019s label (smart apostrophe)", () => {
    const result = parseCategoriesText("Women\u2019s / Resort / Directional Twin / Hybrid");
    expect(result.gender).toBe("womens");
    expect(result.profile).toBe("Hybrid");
    expect(result.shape).toBe("Directional Twin");
    expect(result.category).toBe("Resort");
  });

  it("detects kids gender from Youth label", () => {
    const result = parseCategoriesText("Youth / Park / True Twin / Hybrid Camber");
    expect(result.gender).toBe("kids");
    expect(result.category).toBe("Park");
  });

  it("skips Split Board and Snowboard labels", () => {
    const result = parseCategoriesText("Split Board / Directional / Traditional Camber");
    expect(result.profile).toBe("Traditional Camber");
    expect(result.shape).toBe("Directional");
    expect(result.gender).toBeNull();
  });

  it("returns all nulls for empty string", () => {
    const result = parseCategoriesText("");
    expect(result.profile).toBeNull();
    expect(result.shape).toBeNull();
    expect(result.category).toBeNull();
    expect(result.gender).toBeNull();
  });

  it("handles directional twin shape", () => {
    const result = parseCategoriesText("All-Mtn / Directional Twin / Hybrid Camber");
    expect(result.shape).toBe("Directional Twin");
  });

  it("handles reverse camber profile", () => {
    const result = parseCategoriesText("Park / True Twin / Reverse Camber");
    expect(result.profile).toBe("Reverse Camber");
  });
});

// =============================================================================
// Detail page HTML → board_key (end-to-end gender flow)
// =============================================================================

describe("CAPiTA detail page → board_key gender flow", () => {
  // Simulates the scraper merge logic: detail.gender ?? deriveGender(title, tags)
  // then specKey(brand, model, gender) → board_key
  function boardKeyFromScrape(
    shopifyTitle: string,
    categoriesText: string,
    tags: string[] = []
  ): string {
    const detail = parseCategoriesText(categoriesText);
    const gender = detail.gender ?? deriveGender(shopifyTitle, tags);
    const model = cleanModelName(shopifyTitle);
    return specKey("CAPiTA", model, gender ?? undefined);
  }

  it("Paradise (women's board) gets womens board_key", () => {
    expect(boardKeyFromScrape(
      "Paradise",
      "Women's / Resort / Directional Twin / Hybrid"
    )).toBe("capita|paradise|womens");
  });

  it("Paradise with smart apostrophe gets womens board_key", () => {
    expect(boardKeyFromScrape(
      "PARADISE",
      "Women\u2019s / Resort / Directional Twin / Hybrid"
    )).toBe("capita|paradise|womens");
  });

  it("Paradise falls back to deriveGender with Women\u2019s tag", () => {
    expect(boardKeyFromScrape(
      "PARADISE",
      "",
      ["women\u2019s"]
    )).toBe("capita|paradise|womens");
  });

  it("Birds Of A Feather (women's board) gets womens board_key", () => {
    expect(boardKeyFromScrape(
      "Birds Of A Feather",
      "Women's / Resort / True Twin / Hybrid Camber"
    )).toBe("capita|birds of a feather|womens");
  });

  it("Equalizer (women's board) gets womens board_key", () => {
    expect(boardKeyFromScrape(
      "The Equalizer By Jess Kimura",
      "Women's / All-Mtn + Freeride / Directional / Hybrid Camber"
    )).toBe("capita|equalizer|womens");
  });

  it("Space Metal Fantasy (women's board) gets womens board_key", () => {
    expect(boardKeyFromScrape(
      "Space Metal Fantasy",
      "Women's / Park / True Twin / Reverse Camber"
    )).toBe("capita|space metal fantasy|womens");
  });

  it("DOA (unisex board) gets unisex board_key", () => {
    expect(boardKeyFromScrape(
      "DOA",
      "Resort / True Twin / Hybrid Camber"
    )).toBe("capita|doa|unisex");
  });

  it("Navigator WMN gets womens from title even without categories", () => {
    expect(boardKeyFromScrape(
      "Navigator WMN",
      ""
    )).toBe("capita|navigator wmn|womens");
  });

  it("Children Of The Gnar (youth board) gets kids board_key", () => {
    expect(boardKeyFromScrape(
      "Children Of The Gnar",
      "Youth / Park / True Twin / Hybrid Camber"
    )).toBe("capita|children of the gnar|kids");
  });
});
