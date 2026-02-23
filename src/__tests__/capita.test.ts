import { describe, it, expect } from "vitest";
import {
  skillLevelToAbility,
  parseBodyHtml,
  cleanModelName,
} from "../lib/manufacturers/capita";

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
// parseBodyHtml
// =============================================================================

describe("parseBodyHtml", () => {
  it("extracts numeric flex with /10 denominator", () => {
    const result = parseBodyHtml("<p>Flex: 6/10</p>");
    expect(result.flex).toBe("6/10");
  });

  it("extracts text-based flex descriptor", () => {
    const result = parseBodyHtml("<p>Flex: medium</p>");
    expect(result.flex).toBe("medium");
  });

  it("extracts profile up to period delimiter", () => {
    const result = parseBodyHtml("<p>Profile: Hybrid Camber.</p>");
    expect(result.profile).toBe("hybrid camber");
  });

  it("extracts shape up to period delimiter", () => {
    const result = parseBodyHtml("<p>Shape: Directional Twin.</p>");
    expect(result.shape).toBe("directional twin");
  });

  it("detects all-mountain category", () => {
    const result = parseBodyHtml("<p>This is an all-mountain board.</p>");
    expect(result.category).toBe("all-mountain");
  });

  it("detects freestyle category", () => {
    const result = parseBodyHtml("<p>A freestyle focused board.</p>");
    expect(result.category).toBe("freestyle");
  });

  it("detects freeride category", () => {
    const result = parseBodyHtml("<p>Built for freeride adventures.</p>");
    expect(result.category).toBe("freeride");
  });

  it("detects park category", () => {
    const result = parseBodyHtml("<p>Designed for the park.</p>");
    expect(result.category).toBe("park");
  });

  it("detects powder category", () => {
    const result = parseBodyHtml("<p>Float through powder effortlessly.</p>");
    expect(result.category).toBe("powder");
  });

  it("detects beginner-intermediate ability level", () => {
    const result = parseBodyHtml(
      "<p>Great for beginner to intermediate riders.</p>"
    );
    expect(result.abilityLevel).toBe("beginner-intermediate");
  });

  it("detects intermediate-advanced ability level", () => {
    const result = parseBodyHtml(
      "<p>Suited for intermediate to advanced riders.</p>"
    );
    expect(result.abilityLevel).toBe("intermediate-advanced");
  });

  it("captures key-value pairs in extras", () => {
    const result = parseBodyHtml("<p>Inserts: 2x4</p>");
    expect(result.extras["inserts"]).toBe("2x4");
  });

  it("returns all nulls with empty extras for empty input", () => {
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

  it("extracts multiple fields from combined HTML", () => {
    const html = [
      "<div>",
      "<p>Flex: 7/10</p>",
      "<p>Profile: Hybrid Camber.</p>",
      "<p>Shape: Directional Twin.</p>",
      "<p>This all-mountain board is for intermediate to advanced riders.</p>",
      "<p>Inserts: 2x4</p>",
      "</div>",
    ].join("\n");
    const result = parseBodyHtml(html);
    expect(result.flex).toBe("7/10");
    expect(result.profile).toBe("hybrid camber");
    expect(result.shape).toBe("directional twin");
    expect(result.category).toBe("all-mountain");
    expect(result.abilityLevel).toBe("intermediate-advanced");
    expect(result.extras["inserts"]).toBe("2x4");
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
