import { describe, it, expect } from "vitest";
import {
  skillLevelToAbility,
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
