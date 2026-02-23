import { describe, it, expect } from "vitest";
import {
  inferRiderLevelFromInfographic,
  cleanModelName,
} from "../lib/manufacturers/lib-tech";

describe("inferRiderLevelFromInfographic", () => {
  describe("intermediate-advanced slugs", () => {
    it('returns "intermediate-advanced" for golden-orca', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/golden-orca-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for trice-golden-orca', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/trice-golden-orca-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for t-rice-orca', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/t-rice-orca-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for apex-orca', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/apex-orca-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for t-rice-apex-orca', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/t-rice-apex-orca-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for dynamo', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/dynamo-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for ejack-knife', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/ejack-knife-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for tr-orca-techno-split', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/tr-orca-techno-split-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });

    it('returns "intermediate-advanced" for orca-techno-split', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/orca-techno-split-terrain.png"
        )
      ).toBe("intermediate-advanced");
    });
  });

  describe("beginner-advanced (all levels) slugs", () => {
    it('returns "beginner-advanced" for skate-banana', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/skate-banana-terrain.png"
        )
      ).toBe("beginner-advanced");
    });

    it('returns "beginner-advanced" for t-rice-pro', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/t-rice-pro-terrain.png"
        )
      ).toBe("beginner-advanced");
    });

    it('returns "beginner-advanced" for terrain-wrecker', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/terrain-wrecker-terrain.png"
        )
      ).toBe("beginner-advanced");
    });

    it('returns "beginner-advanced" for jamie-lynn', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/jamie-lynn-terrain.png"
        )
      ).toBe("beginner-advanced");
    });

    it('returns "beginner-advanced" for rasman', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/rasman-terrain.png"
        )
      ).toBe("beginner-advanced");
    });

    it('returns "beginner-advanced" for skunkape-terrain', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/skunkape-terrain-terrain.png"
        )
      ).toBe("beginner-advanced");
    });
  });

  describe("beginner-intermediate slugs", () => {
    it('returns "beginner-intermediate" for libzilla', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/libzilla-terrain.png"
        )
      ).toBe("beginner-intermediate");
    });

    it('returns "beginner-intermediate" for legitimizer', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/legitimizer-terrain.png"
        )
      ).toBe("beginner-intermediate");
    });

    it('returns "beginner-intermediate" for cold-brew', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/cold-brew-terrain.png"
        )
      ).toBe("beginner-intermediate");
    });

    it('returns "beginner-intermediate" for coldbrew', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/coldbrew-terrain.png"
        )
      ).toBe("beginner-intermediate");
    });

    it('returns "beginner-intermediate" for escalator', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/escalator-terrain.png"
        )
      ).toBe("beginner-intermediate");
    });

    it('returns "beginner-intermediate" for doughboy', () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/doughboy-terrain.png"
        )
      ).toBe("beginner-intermediate");
    });
  });

  describe("unrecognized slugs", () => {
    it("returns null for an unrecognized slug", () => {
      expect(
        inferRiderLevelFromInfographic(
          "/media/catalog/terrain-riderlevel-flex/unknown-board-terrain.png"
        )
      ).toBeNull();
    });

    it("returns null for an empty string", () => {
      expect(inferRiderLevelFromInfographic("")).toBeNull();
    });
  });
});

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
