import { describe, it, expect } from "vitest";
import { cleanModelName } from "../lib/manufacturers/lib-tech";

describe("cleanModelName", () => {
  it('strips "Lib Tech " prefix', () => {
    expect(cleanModelName("Lib Tech Orca")).toBe("Orca");
  });

  it('strips "LibTech " prefix (no space between Lib and Tech)', () => {
    expect(cleanModelName("LibTech Orca")).toBe("Orca");
  });

  it('strips " Snowboard" suffix', () => {
    expect(cleanModelName("Orca Snowboard")).toBe("Orca");
  });

  it("strips both prefix and suffix", () => {
    expect(cleanModelName("Lib Tech Orca Snowboard")).toBe("Orca");
  });

  it('strips lowercase "lib tech " prefix', () => {
    expect(cleanModelName("lib tech Skate Banana")).toBe("Skate Banana");
  });

  it("passes through a name with no prefix or suffix", () => {
    expect(cleanModelName("Skate Banana")).toBe("Skate Banana");
  });

  it("trims surrounding whitespace", () => {
    expect(cleanModelName("  Orca  ")).toBe("Orca");
  });

  it('strips "Lib  Tech " prefix with extra space', () => {
    expect(cleanModelName("Lib  Tech Cold Brew")).toBe("Cold Brew");
  });
});
