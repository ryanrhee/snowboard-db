import { describe, it, expect } from "vitest";
import { canonicalizeBrand, normalizeBrand } from "../lib/scraping/utils";
import {
  normalizeProfile,
  normalizeShape,
  normalizeCategory,
  normalizeFlex,
  normalizeModel,
  inferYear,
  detectCondition,
  detectGender,
  extractComboContents,
} from "../lib/normalization";
import { specKey } from "../lib/db";
import { BoardProfile, BoardShape, BoardCategory, ListingCondition, GenderTarget } from "../lib/types";

// =============================================================================
// canonicalizeBrand
// =============================================================================

describe("canonicalizeBrand", () => {
  describe("Yes. alias resolution", () => {
    it('maps "yes" to "Yes."', () => {
      expect(canonicalizeBrand("yes")).toBe("Yes.");
    });

    it('maps "Yes." to "Yes."', () => {
      expect(canonicalizeBrand("Yes.")).toBe("Yes.");
    });

    it('maps "YES" to "Yes." (case-insensitive)', () => {
      expect(canonicalizeBrand("YES")).toBe("Yes.");
    });

    it('maps "yes." to "Yes." (case-insensitive)', () => {
      expect(canonicalizeBrand("yes.")).toBe("Yes.");
    });
  });

  describe("Dinosaurs Will Die alias resolution", () => {
    it('maps "dinosaurs" to "Dinosaurs Will Die"', () => {
      expect(canonicalizeBrand("dinosaurs")).toBe("Dinosaurs Will Die");
    });

    it('maps "dwd" to "Dinosaurs Will Die"', () => {
      expect(canonicalizeBrand("dwd")).toBe("Dinosaurs Will Die");
    });

    it('maps "DWD" to "Dinosaurs Will Die"', () => {
      expect(canonicalizeBrand("DWD")).toBe("Dinosaurs Will Die");
    });

    it('maps "dinosaurs will die" to "Dinosaurs Will Die"', () => {
      expect(canonicalizeBrand("dinosaurs will die")).toBe("Dinosaurs Will Die");
    });

    it('maps "Dinosaurs Will Die" to "Dinosaurs Will Die"', () => {
      expect(canonicalizeBrand("Dinosaurs Will Die")).toBe("Dinosaurs Will Die");
    });
  });

  describe("Sims alias resolution", () => {
    it('maps "sims" to "Sims"', () => {
      expect(canonicalizeBrand("sims")).toBe("Sims");
    });

    it('maps "SIMS" to "Sims"', () => {
      expect(canonicalizeBrand("SIMS")).toBe("Sims");
    });
  });

  describe("GNU alias resolution", () => {
    it('maps "gnu" to "GNU"', () => {
      expect(canonicalizeBrand("gnu")).toBe("GNU");
    });

    it('maps "Gnu" to "GNU"', () => {
      expect(canonicalizeBrand("Gnu")).toBe("GNU");
    });

    it('maps "GNU" to "GNU"', () => {
      expect(canonicalizeBrand("GNU")).toBe("GNU");
    });
  });

  describe("Lib Tech alias resolution", () => {
    it('maps "lib" to "Lib Tech"', () => {
      expect(canonicalizeBrand("lib")).toBe("Lib Tech");
    });

    it('maps "libtech" to "Lib Tech"', () => {
      expect(canonicalizeBrand("libtech")).toBe("Lib Tech");
    });

    it('maps "lib tech" to "Lib Tech"', () => {
      expect(canonicalizeBrand("lib tech")).toBe("Lib Tech");
    });

    it('maps "Lib Tech" to "Lib Tech"', () => {
      expect(canonicalizeBrand("Lib Tech")).toBe("Lib Tech");
    });

    it('maps "LIB TECH" to "Lib Tech"', () => {
      expect(canonicalizeBrand("LIB TECH")).toBe("Lib Tech");
    });

    it('maps "lib technologies" to "Lib Tech"', () => {
      expect(canonicalizeBrand("lib technologies")).toBe("Lib Tech");
    });

    it('maps "Lib Technologies" to "Lib Tech"', () => {
      expect(canonicalizeBrand("Lib Technologies")).toBe("Lib Tech");
    });
  });

  describe("CAPiTA alias resolution", () => {
    it('maps "capita" to "CAPiTA"', () => {
      expect(canonicalizeBrand("capita")).toBe("CAPiTA");
    });

    it('maps "CAPiTA" to "CAPiTA"', () => {
      expect(canonicalizeBrand("CAPiTA")).toBe("CAPiTA");
    });

    it('maps "CAPITA" to "CAPiTA"', () => {
      expect(canonicalizeBrand("CAPITA")).toBe("CAPiTA");
    });

    it('maps "capita snowboarding" to "CAPiTA"', () => {
      expect(canonicalizeBrand("capita snowboarding")).toBe("CAPiTA");
    });

    it('maps "Capita Snowboarding" to "CAPiTA"', () => {
      expect(canonicalizeBrand("Capita Snowboarding")).toBe("CAPiTA");
    });
  });

  describe("passthrough for unknown brands", () => {
    it("returns the original string for unknown brands", () => {
      expect(canonicalizeBrand("Burton")).toBe("Burton");
    });

    it("preserves casing on unknown brands", () => {
      expect(canonicalizeBrand("RIDE")).toBe("RIDE");
    });

    it("preserves mixed case on unknown brands", () => {
      expect(canonicalizeBrand("Never Summer")).toBe("Never Summer");
    });

    it("returns empty string for empty input", () => {
      expect(canonicalizeBrand("")).toBe("");
    });
  });

  describe("whitespace handling", () => {
    it("trims leading whitespace", () => {
      expect(canonicalizeBrand("  capita")).toBe("CAPiTA");
    });

    it("trims trailing whitespace", () => {
      expect(canonicalizeBrand("capita  ")).toBe("CAPiTA");
    });

    it("trims surrounding whitespace", () => {
      expect(canonicalizeBrand("  lib tech  ")).toBe("Lib Tech");
    });

    it("trims whitespace-only input and passes through", () => {
      expect(canonicalizeBrand("   ")).toBe("   ");
    });
  });
});

// =============================================================================
// normalizeBrand
// =============================================================================

describe("normalizeBrand", () => {
  describe('strips "snowboard(s)" suffix', () => {
    it('removes " Snowboards" suffix', () => {
      expect(normalizeBrand("Burton Snowboards")).toBe("Burton");
    });

    it('removes " Snowboard" (singular) suffix', () => {
      expect(normalizeBrand("Burton Snowboard")).toBe("Burton");
    });

    it('removes "Snowboards" when it IS the whole string (after strip → empty)', () => {
      // "Snowboards" → cleaned to "" → canonicalizeBrand("") → ""
      expect(normalizeBrand("Snowboards")).toBe("");
    });

    it("handles case-insensitive snowboard removal", () => {
      expect(normalizeBrand("BURTON SNOWBOARDS")).toBe("BURTON");
    });

    it("handles mixed-case snowboard removal", () => {
      expect(normalizeBrand("ride snowBoard")).toBe("ride");
    });
  });

  describe('strips "snowboard co." suffix', () => {
    it('removes " Snowboard Co." suffix', () => {
      expect(normalizeBrand("Ride Snowboard Co.")).toBe("Ride");
    });

    it('removes " Snowboard Co" (no dot) suffix', () => {
      expect(normalizeBrand("Ride Snowboard Co")).toBe("Ride");
    });

    it("handles case-insensitive co. removal", () => {
      expect(normalizeBrand("RIDE SNOWBOARD CO.")).toBe("RIDE");
    });
  });

  describe("combines stripping with alias resolution", () => {
    it('normalizes "Lib Tech Snowboards" → "Lib Tech"', () => {
      expect(normalizeBrand("Lib Tech Snowboards")).toBe("Lib Tech");
    });

    it('normalizes "CAPiTA Snowboarding" → "CAPiTA"', () => {
      expect(normalizeBrand("CAPiTA Snowboarding")).toBe("CAPiTA");
    });

    it('normalizes "capita snowboarding" → "CAPiTA"', () => {
      expect(normalizeBrand("capita snowboarding")).toBe("CAPiTA");
    });

    it('normalizes "Yes. Snowboards" → "Yes."', () => {
      expect(normalizeBrand("Yes. Snowboards")).toBe("Yes.");
    });

    it('normalizes "DWD Snowboards" → "Dinosaurs Will Die"', () => {
      expect(normalizeBrand("DWD Snowboards")).toBe("Dinosaurs Will Die");
    });
  });

  describe("empty and missing input", () => {
    it('returns "Unknown" for empty string', () => {
      expect(normalizeBrand("")).toBe("Unknown");
    });

    it('returns "Unknown" for undefined (cast)', () => {
      expect(normalizeBrand(undefined as unknown as string)).toBe("Unknown");
    });

    it('returns "Unknown" for null (cast)', () => {
      expect(normalizeBrand(null as unknown as string)).toBe("Unknown");
    });
  });

  describe("preserves brands with no transformations needed", () => {
    it("passes through Burton unchanged", () => {
      expect(normalizeBrand("Burton")).toBe("Burton");
    });

    it("passes through Ride unchanged", () => {
      expect(normalizeBrand("Ride")).toBe("Ride");
    });

    it("passes through Jones unchanged", () => {
      expect(normalizeBrand("Jones")).toBe("Jones");
    });

    it("passes through K2 unchanged", () => {
      expect(normalizeBrand("K2")).toBe("K2");
    });

    it("passes through Rossignol unchanged", () => {
      expect(normalizeBrand("Rossignol")).toBe("Rossignol");
    });

    it("passes through GNU unchanged", () => {
      expect(normalizeBrand("GNU")).toBe("GNU");
    });
  });
});

// =============================================================================
// normalizeProfile
// =============================================================================

describe("normalizeProfile", () => {
  describe("standard camber terms", () => {
    it.each([
      ["camber", BoardProfile.CAMBER],
      ["Camber", BoardProfile.CAMBER],
      ["CAMBER", BoardProfile.CAMBER],
      ["traditional camber", BoardProfile.CAMBER],
      ["full camber", BoardProfile.CAMBER],
      ["pure pop camber", BoardProfile.CAMBER],
      ["c3", BoardProfile.CAMBER],
      ["c3 btx", BoardProfile.CAMBER],
      ["system camber", BoardProfile.CAMBER],
    ])('%s → %s', (input, expected) => {
      expect(normalizeProfile(input)).toBe(expected);
    });
  });

  describe("standard rocker terms", () => {
    it.each([
      ["rocker", BoardProfile.ROCKER],
      ["Rocker", BoardProfile.ROCKER],
      ["full rocker", BoardProfile.ROCKER],
      ["pure rocker", BoardProfile.ROCKER],
      ["banana", BoardProfile.ROCKER],
      ["Banana", BoardProfile.ROCKER],
      ["catch-free", BoardProfile.ROCKER],
      ["bend", BoardProfile.ROCKER],
      ["system rocker", BoardProfile.ROCKER],
      ["catch free rocker baseline", BoardProfile.ROCKER],
    ])('%s → %s', (input, expected) => {
      expect(normalizeProfile(input)).toBe(expected);
    });
  });

  describe("flat terms", () => {
    it.each([
      ["flat", BoardProfile.FLAT],
      ["Flat", BoardProfile.FLAT],
      ["flat top", BoardProfile.FLAT],
      ["zero camber", BoardProfile.FLAT],
      ["directional flat top", BoardProfile.FLAT],
      ["flat top (frostbite edges)", BoardProfile.FLAT],
      ["directional baseline", BoardProfile.FLAT],
      ["catch free baseline", BoardProfile.FLAT],
      ["jib baseline", BoardProfile.FLAT],
    ])('%s → %s', (input, expected) => {
      expect(normalizeProfile(input)).toBe(expected);
    });
  });

  describe("hybrid camber terms", () => {
    it.each([
      ["hybrid camber", BoardProfile.HYBRID_CAMBER],
      ["Hybrid Camber", BoardProfile.HYBRID_CAMBER],
      ["camrock", BoardProfile.HYBRID_CAMBER],
      ["cam-rock", BoardProfile.HYBRID_CAMBER],
      ["directional camber", BoardProfile.HYBRID_CAMBER],
      ["camber/rocker", BoardProfile.HYBRID_CAMBER],
      ["camber with rocker", BoardProfile.HYBRID_CAMBER],
      ["mostly camber", BoardProfile.HYBRID_CAMBER],
      ["s-camber", BoardProfile.HYBRID_CAMBER],
      ["c2", BoardProfile.HYBRID_CAMBER],
      ["c2x", BoardProfile.HYBRID_CAMBER],
      ["c2e", BoardProfile.HYBRID_CAMBER],
      ["c2 btx", BoardProfile.HYBRID_CAMBER],
      ["camrock 2.0", BoardProfile.HYBRID_CAMBER],
      ["flat with camber", BoardProfile.HYBRID_CAMBER],
      ["resort v1", BoardProfile.HYBRID_CAMBER],
      ["alpine v1", BoardProfile.HYBRID_CAMBER],
      ["uprise fender", BoardProfile.HYBRID_CAMBER],
      ["amptek", BoardProfile.HYBRID_CAMBER],
    ])('%s → %s', (input, expected) => {
      expect(normalizeProfile(input)).toBe(expected);
    });
  });

  describe("hybrid rocker terms", () => {
    it.each([
      ["hybrid rocker", BoardProfile.HYBRID_ROCKER],
      ["Hybrid Rocker", BoardProfile.HYBRID_ROCKER],
      ["rocker/camber", BoardProfile.HYBRID_ROCKER],
      ["rocker/camber/rocker", BoardProfile.HYBRID_ROCKER],
      ["rocker with camber", BoardProfile.HYBRID_ROCKER],
      ["mostly rocker", BoardProfile.HYBRID_ROCKER],
      ["gullwing", BoardProfile.HYBRID_ROCKER],
      ["flying v", BoardProfile.HYBRID_ROCKER],
      ["Flying V", BoardProfile.HYBRID_ROCKER],
      ["btx", BoardProfile.HYBRID_ROCKER],
      ["b.c.", BoardProfile.HYBRID_ROCKER],
      ["directional rocker", BoardProfile.HYBRID_ROCKER],
      ["directional flat with rocker", BoardProfile.HYBRID_ROCKER],
      ["flat with rocker", BoardProfile.HYBRID_ROCKER],
      ["flat to rocker", BoardProfile.HYBRID_ROCKER],
      ["performance rocker", BoardProfile.HYBRID_ROCKER],
      ["quad rocker", BoardProfile.HYBRID_ROCKER],
      ["hybrid all mountain rocker", BoardProfile.HYBRID_ROCKER],
      ["park v1", BoardProfile.HYBRID_ROCKER],
      ["parabolic rocker", BoardProfile.HYBRID_ROCKER],
      ["amptek auto-turn rocker", BoardProfile.HYBRID_ROCKER],
    ])('%s → %s', (input, expected) => {
      expect(normalizeProfile(input)).toBe(expected);
    });
  });

  describe("keyword fallback for compound terms", () => {
    it("rocker before camber → HYBRID_ROCKER", () => {
      expect(normalizeProfile("rocker-camber-rocker combo")).toBe(BoardProfile.HYBRID_ROCKER);
    });

    it("camber before rocker → HYBRID_CAMBER", () => {
      expect(normalizeProfile("camber dominant with rocker tips")).toBe(BoardProfile.HYBRID_CAMBER);
    });

    it("camber alone in unknown string → CAMBER", () => {
      expect(normalizeProfile("progressive camber design")).toBe(BoardProfile.CAMBER);
    });

    it("rocker alone in unknown string → ROCKER", () => {
      expect(normalizeProfile("continuous rocker design")).toBe(BoardProfile.ROCKER);
    });

    it("flat alone in unknown string → FLAT", () => {
      expect(normalizeProfile("completely flat profile")).toBe(BoardProfile.FLAT);
    });
  });

  describe("null/empty handling", () => {
    it("returns null for empty string", () => {
      expect(normalizeProfile("")).toBeNull();
    });

    it("returns null for unrecognized profile", () => {
      expect(normalizeProfile("xyzabc")).toBeNull();
    });
  });
});

// =============================================================================
// normalizeShape
// =============================================================================

describe("normalizeShape", () => {
  describe("true twin terms", () => {
    it.each([
      ["true twin", BoardShape.TRUE_TWIN],
      ["True Twin", BoardShape.TRUE_TWIN],
      ["twin", BoardShape.TRUE_TWIN],
      ["Twin", BoardShape.TRUE_TWIN],
      ["perfectly twin", BoardShape.TRUE_TWIN],
      ["symmetrical", BoardShape.TRUE_TWIN],
      ["Symmetrical", BoardShape.TRUE_TWIN],
    ])('%s → %s', (input, expected) => {
      expect(normalizeShape(input)).toBe(expected);
    });
  });

  describe("directional twin terms", () => {
    it.each([
      ["directional twin", BoardShape.DIRECTIONAL_TWIN],
      ["Directional Twin", BoardShape.DIRECTIONAL_TWIN],
      ["directional-twin", BoardShape.DIRECTIONAL_TWIN],
      ["tapered twin", BoardShape.DIRECTIONAL_TWIN],
      ["slight directional twin", BoardShape.DIRECTIONAL_TWIN],
    ])('%s → %s', (input, expected) => {
      expect(normalizeShape(input)).toBe(expected);
    });
  });

  describe("directional terms", () => {
    it.each([
      ["directional", BoardShape.DIRECTIONAL],
      ["Directional", BoardShape.DIRECTIONAL],
      ["fully directional", BoardShape.DIRECTIONAL],
    ])('%s → %s', (input, expected) => {
      expect(normalizeShape(input)).toBe(expected);
    });
  });

  describe("tapered terms", () => {
    it.each([
      ["tapered", BoardShape.TAPERED],
      ["Tapered", BoardShape.TAPERED],
      ["tapered directional", BoardShape.TAPERED],
      ["directional tapered", BoardShape.TAPERED],
    ])('%s → %s', (input, expected) => {
      expect(normalizeShape(input)).toBe(expected);
    });
  });

  describe("keyword fallback", () => {
    it("twin in unknown string → TRUE_TWIN", () => {
      expect(normalizeShape("some twin shape")).toBe(BoardShape.TRUE_TWIN);
    });

    it("directional + twin in unknown string → DIRECTIONAL_TWIN", () => {
      expect(normalizeShape("slight directional with twin shape")).toBe(BoardShape.DIRECTIONAL_TWIN);
    });

    it("directional in unknown string → DIRECTIONAL", () => {
      expect(normalizeShape("very directional shape")).toBe(BoardShape.DIRECTIONAL);
    });

    it("taper in unknown string → TAPERED", () => {
      expect(normalizeShape("custom taper shape")).toBe(BoardShape.TAPERED);
    });
  });

  describe("null/empty handling", () => {
    it("returns null for empty string", () => {
      expect(normalizeShape("")).toBeNull();
    });

    it("returns null for unrecognized shape", () => {
      expect(normalizeShape("xyzabc")).toBeNull();
    });
  });
});

// =============================================================================
// normalizeCategory
// =============================================================================

describe("normalizeCategory", () => {
  describe("all-mountain terms", () => {
    it.each([
      ["all-mountain", BoardCategory.ALL_MOUNTAIN],
      ["all mountain", BoardCategory.ALL_MOUNTAIN],
      ["All Mountain", BoardCategory.ALL_MOUNTAIN],
      ["allmountain", BoardCategory.ALL_MOUNTAIN],
      ["mountain", BoardCategory.ALL_MOUNTAIN],
    ])('category "%s" → %s', (input, expected) => {
      expect(normalizeCategory(input)).toBe(expected);
    });
  });

  describe("freestyle terms", () => {
    it.each([
      ["freestyle", BoardCategory.FREESTYLE],
      ["Freestyle", BoardCategory.FREESTYLE],
      ["free style", BoardCategory.FREESTYLE],
    ])('category "%s" → %s', (input, expected) => {
      expect(normalizeCategory(input)).toBe(expected);
    });
  });

  describe("freeride terms", () => {
    it.each([
      ["freeride", BoardCategory.FREERIDE],
      ["Freeride", BoardCategory.FREERIDE],
      ["free ride", BoardCategory.FREERIDE],
      ["backcountry", BoardCategory.FREERIDE],
      ["Backcountry", BoardCategory.FREERIDE],
    ])('category "%s" → %s', (input, expected) => {
      expect(normalizeCategory(input)).toBe(expected);
    });
  });

  describe("powder terms", () => {
    it.each([
      ["powder", BoardCategory.POWDER],
      ["Powder", BoardCategory.POWDER],
      ["deep powder", BoardCategory.POWDER],
    ])('category "%s" → %s', (input, expected) => {
      expect(normalizeCategory(input)).toBe(expected);
    });
  });

  describe("park terms", () => {
    it.each([
      ["park", BoardCategory.PARK],
      ["Park", BoardCategory.PARK],
      ["park & pipe", BoardCategory.PARK],
      ["park/pipe", BoardCategory.PARK],
      ["park / freestyle", BoardCategory.PARK],
      ["jib", BoardCategory.PARK],
      ["park/jib", BoardCategory.PARK],
    ])('category "%s" → %s', (input, expected) => {
      expect(normalizeCategory(input)).toBe(expected);
    });
  });

  describe("description-based fallback", () => {
    it("detects all-mountain from description", () => {
      expect(normalizeCategory(undefined, "A versatile all-mountain board for everyday riding")).toBe(
        BoardCategory.ALL_MOUNTAIN
      );
    });

    it("detects freestyle from description", () => {
      expect(normalizeCategory(undefined, "Playful and great for butters and tricks")).toBe(
        BoardCategory.FREESTYLE
      );
    });

    it("detects freeride from description", () => {
      expect(normalizeCategory(undefined, "Built for aggressive backcountry charging on steep terrain")).toBe(
        BoardCategory.FREERIDE
      );
    });

    it("detects powder from description", () => {
      expect(normalizeCategory(undefined, "Designed to float in deep snow like surfing")).toBe(
        BoardCategory.POWDER
      );
    });

    it("detects park from description", () => {
      expect(normalizeCategory(undefined, "Perfect for hitting rails and boxes in the terrain park")).toBe(
        BoardCategory.PARK
      );
    });

    it("picks highest keyword count when multiple categories match", () => {
      // freeride: "backcountry" + "aggressive" + "charging" + "steep" = 4
      // all-mountain: "versatile" = 1
      expect(
        normalizeCategory(undefined, "A versatile board for aggressive backcountry charging on steep lines")
      ).toBe(BoardCategory.FREERIDE);
    });

    it("category arg takes precedence over description", () => {
      expect(normalizeCategory("park", "Great for backcountry freeride charging")).toBe(
        BoardCategory.PARK
      );
    });
  });

  describe("null/empty handling", () => {
    it("returns null when no category and no description", () => {
      expect(normalizeCategory(undefined, undefined)).toBeNull();
    });

    it("returns null for empty category and no description", () => {
      expect(normalizeCategory("", undefined)).toBeNull();
    });

    it("returns null for unrecognized category and no description", () => {
      expect(normalizeCategory("xyzabc", null)).toBeNull();
    });

    it("returns null for empty description with no category", () => {
      expect(normalizeCategory(undefined, "nothing relevant here")).toBeNull();
    });
  });
});

// =============================================================================
// normalizeFlex
// =============================================================================

describe("normalizeFlex", () => {
  describe("numeric fraction format (X/10)", () => {
    it.each([
      ["3/10", 3],
      ["5/10", 5],
      ["7/10", 7],
      ["10/10", 10],
      ["1/10", 1],
      ["3.5/10", 3.5],
    ])('"%s" → %d', (input, expected) => {
      expect(normalizeFlex(input)).toBe(expected);
    });
  });

  describe('"out of 10" format', () => {
    it.each([
      ["3 out of 10", 3],
      ["5 out of 10", 5],
      ["7 out of 10", 7],
      ["6.5 out of 10", 6.5],
    ])('"%s" → %d', (input, expected) => {
      expect(normalizeFlex(input)).toBe(expected);
    });
  });

  describe("plain numeric", () => {
    it.each([
      ["1", 1],
      ["5", 5],
      ["10", 10],
      ["3", 3],
    ])('"%s" → %d', (input, expected) => {
      expect(normalizeFlex(input)).toBe(expected);
    });

    it("rejects plain number outside 1-10 range", () => {
      expect(normalizeFlex("0")).toBeNull();
      expect(normalizeFlex("11")).toBeNull();
      expect(normalizeFlex("100")).toBeNull();
    });
  });

  describe("text-based flex descriptors", () => {
    it.each([
      ["very soft", 2],
      ["Very Soft", 2],
      ["extra soft", 2],
      ["soft", 3],
      ["Soft", 3],
      ["medium-soft", 4],
      ["soft-medium", 4],
      ["medium", 5],
      ["Medium", 5],
      ["medium-stiff", 6],
      ["stiff-medium", 6],
      ["stiff", 7],
      ["Stiff", 7],
      ["very stiff", 9],
      ["extra stiff", 9],
    ])('"%s" → %d', (input, expected) => {
      expect(normalizeFlex(input)).toBe(expected);
    });

    it('"Soft (3/10)" matches fraction format first', () => {
      expect(normalizeFlex("Soft (3/10)")).toBe(3);
    });
  });

  describe("null/empty handling", () => {
    it("returns null for empty string", () => {
      expect(normalizeFlex("")).toBeNull();
    });

    it("returns null for unrecognized text", () => {
      expect(normalizeFlex("xyzabc")).toBeNull();
    });
  });
});

// =============================================================================
// inferYear
// =============================================================================

describe("inferYear", () => {
  describe("4-digit year extraction", () => {
    it.each([
      ["Custom 2024", 2024],
      ["Skate Banana 2023", 2023],
      ["Process 2019", 2019],
      ["DOA 2025", 2025],
      ["2022 Custom", 2022],
    ])('"%s" → %d', (input, expected) => {
      expect(inferYear(input)).toBe(expected);
    });
  });

  describe("2-digit year extraction", () => {
    it.each([
      ["Custom 24", 2024],
      ["Skate Banana 23", 2023],
      ["Process 19", 2019],
    ])('"%s" → %d', (input, expected) => {
      expect(inferYear(input)).toBe(expected);
    });

    it("rejects 2-digit years outside 18-29 range", () => {
      expect(inferYear("Custom 17")).toBeNull();
      expect(inferYear("Custom 30")).toBeNull();
    });
  });

  describe("null/empty handling", () => {
    it("returns null for empty string", () => {
      expect(inferYear("")).toBeNull();
    });

    it("returns null for model with no year", () => {
      expect(inferYear("Custom")).toBeNull();
    });

    it("returns null for undefined (cast)", () => {
      expect(inferYear(undefined as unknown as string)).toBeNull();
    });
  });

  describe("prefers 4-digit over 2-digit", () => {
    it("extracts 4-digit year when both present", () => {
      expect(inferYear("Custom 2024 v2 23")).toBe(2024);
    });
  });
});

// =============================================================================
// normalizeModel — real board names from retailer scrapers
// =============================================================================

describe("normalizeModel", () => {
  describe("strips Snowboard suffix", () => {
    it.each([
      ["Custom Snowboard - 2026", undefined, "Custom"],
      ["Flagship Snowboard", undefined, "Flagship"],
      ["Standard Snowboard 2026", undefined, "Standard"],
      ["Pick Your Line Snowboard 2026", undefined, "Pick Your Line"],
      ["Sight X Snowboard 2026", undefined, "Sight X"],
      ["Mind Expander Twin Snowboard", undefined, "Mind Expander Twin"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });
  });

  describe("strips year", () => {
    it.each([
      ["Primer Snowboard 2026", undefined, "Primer"],
      ["ATV Pro Snowboard 2025", undefined, "ATV Pro"],
      ["Turbo Snowboard 2025", undefined, "Turbo"],
      ["Medium Snowboard 2024", undefined, "Medium"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });
  });

  describe("strips gendered suffixes", () => {
    it.each([
      ["Draft Snowboard - 2026 - Men's", undefined, "Draft"],
      ["Feelgood Snowboard - 2026 - Women's", undefined, "Feelgood"],
      ["Dynamiss Snowboard - 2026 - Women's", undefined, "Dynamiss"],
      ["Algorhythm Snowboard - 2026 - Men's", undefined, "Algorhythm"],
      ["Lotus Snowboard - 2025 - Women's", undefined, "Lotus"],
      ["Ultra Prodigy Snowboard - Kids'", undefined, "Ultra Prodigy"],
      ["Lectra Cam-Out Snowboard - 2026 - Women's", undefined, "Lectra Cam Out"],
      ["Mini Ramp C3 Snowboard - Boys' 2025", "Lib Tech", "Mini Ramp"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips leading gendered prefixes", () => {
    it.each([
      ["Women's Talent Scout Snowboard 2025", undefined, "Talent Scout"],
      ["Women's Basic Snowboard 2026", undefined, "Basic"],
      ["Women's Saturday Snowboard 2025", undefined, "Saturday"],
      ["Women's Darrah Snowboard 2025", undefined, "Darrah"],
      ["Women's No Drama Snowboard (Closeout) 2024", undefined, "No Drama"],
      ["Women's Frosting C2 Snowboard 2025", "GNU", "Frosting"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips retail tags", () => {
    it.each([
      ["Psychocandy Snowboard (Closeout) 2025", undefined, "Psychocandy"],
      ["Forest Bailey Head Space C3 Snowboard (Closeout) 2025", "GNU", "Head Space"],
      ["T. Rice Apex Orca Snowboard - Blem 2026", "Lib Tech", "Apex Orca"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips binding/package info", () => {
    it.each([
      ["Instigator Camber Snowboard + Malavita Re:Flex Binding", "Burton", "Instigator Camber"],
      ["Birds Of A Feather Snowboard + Union Ultra Binding - 2026", "CAPiTA", "Birds Of A Feather"],
      ["Kazu Kokubo Pro Snowboard + Union Atlas Pro Binding - 2026", "CAPiTA", "Kazu Kokubo Pro"],
      ["Feelgood Snowboard + Step On Package - Women's", "Burton", "Feelgood"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });
  });

  describe("fixes Lib Tech brand leak", () => {
    it.each([
      ["Tech Dynamiss C3 Snowboard - Women's 2025", "Lib Tech", "Dynamiss"],
      ["Tech Legitimizer C3 Snowboard 2025", "Lib Tech", "Legitimizer"],
      ["Tech Cold Brew C2 LTD Snowboard 2026", "Lib Tech", "Cold Brew C2 LTD"],
      ["Tech Rasman C2X Snowboard 2025", "Lib Tech", "Rasman"],
      ["Tech Mini Ramp C3 Snowboard - Boys' 2025", "Lib Tech", "Mini Ramp"],
      ["Tech T. Rice Apex Orca Snowboard - Blem 2026", "Lib Tech", "Apex Orca"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });

    it("does not strip Tech from non-Lib Tech brands", () => {
      expect(normalizeModel("Tech Something Snowboard 2026", "Burton")).toBe("Tech Something");
    });
  });

  describe("fixes DWD brand leak", () => {
    it("strips 'Will Die' prefix from model", () => {
      expect(normalizeModel("Will Die Wizard Stick Snowboard 2025", "Dinosaurs Will Die")).toBe("Wizard Stick");
    });

    it("does not strip from non-DWD brands", () => {
      expect(normalizeModel("Will Die Snowboard 2025", "Burton")).toBe("Will Die");
    });
  });

  describe("handles models that need no cleanup", () => {
    it.each([
      ["Custom", undefined, "Custom"],
      ["Process Flying V", "Burton", "Process Flying V"],
      ["Halldor", undefined, "Halldor"],
      ["Flagship Pro", undefined, "Flagship Pro"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips brand name prefix from model (generic)", () => {
    it.each([
      ["GNU Asym Ladies Choice C2X Snowboard - Women's 2025", "GNU", "Ladies Choice"],
      ["Jones Dream Weaver 2.0 Snowboard - Women's 2026", "Jones", "Dream Weaver 2.0"],
      ["Rossignol Juggernaut Snowboard 2025", "Rossignol", "Juggernaut"],
      ["Sims Bowl Squad Snowboard 2026", "Sims", "Bowl Squad"],
      ["Season Kin Snowboard 2026", "Season", "Kin"],
      ["Yes. Airmaster 3D Snowboard 2026", "Yes.", "Airmaster 3D"],
      ["Salomon Sight X Snowboard 2026", "Salomon", "Sight X"],
      ["Rome Heist Snowboard - Women's 2024", "Rome", "Heist"],
      ["Lib Tech Dynamiss C3 Snowboard - Women's 2025", "Lib Tech", "Dynamiss"],
      ["Never Summer Proto Ultra Snowboard 2026", "Never Summer", "Proto Ultra"],
    ])('%s (brand: %s) → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });

    it("does not strip when model does not start with brand", () => {
      expect(normalizeModel("Custom Snowboard 2026", "Burton")).toBe("Custom");
    });

    it("does not strip mid-model brand occurrence", () => {
      expect(normalizeModel("Chrome Rome Snowboard 2025", "Rome")).toBe("Chrome Rome");
    });
  });

  describe("strips trailing slashes (Task #4)", () => {
    it("strips trailing slash from model", () => {
      expect(normalizeModel("Element/")).toBe("Element");
    });

    it("strips multiple trailing slashes", () => {
      expect(normalizeModel("Element///")).toBe("Element");
    });
  });

  describe("preserves Unknown and empty", () => {
    it("returns Unknown for Unknown", () => {
      expect(normalizeModel("Unknown")).toBe("Unknown");
    });

    it("returns empty for empty", () => {
      expect(normalizeModel("")).toBe("");
    });
  });

  describe("strips trailing profile designators", () => {
    // Burton profile suffixes are now RETAINED in model names
    it.each([
      ["Custom Camber", "Burton", "Custom Camber"],
      ["Custom Flying V", "Burton", "Custom Flying V"],
      ["Feelgood Camber", "Burton", "Feelgood Camber"],
      ["Hideaway Flat Top", "Burton", "Hideaway Flat Top"],
      ["Instigator PurePop Camber", "Burton", "Instigator PurePop Camber"],
    ])('Burton: %s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });

    // Lib Tech / GNU contour code stripping (C2X, C2E, C2, C3, BTX still stripped)
    // but "Camber" and GNU "C" prefix/suffix are RETAINED
    it.each([
      ["Legitimizer C3", "Lib Tech", "Legitimizer"],
      ["Rasman C2X", "Lib Tech", "Rasman"],
      ["Frosting C2", "GNU", "Frosting"],
      ["Gloss-C C3", "GNU", "Gloss C"],
      ["C Money C3", "GNU", "C Money"],
      ["T. Rice Pro C2", "Lib Tech", "Pro"],
    ])('Lib Tech/GNU: %s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });

    // No-op cases (should NOT strip)
    it.each([
      ["Airmaster 3D", "Yes.", "Airmaster 3D"],
      ["Dream Weaver 2.0", "Jones", "Dream Weaver 2.0"],
      ["Cold Brew C2 LTD", "Lib Tech", "Cold Brew C2 LTD"],
    ])('No-op: %s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });
  });

  describe("normalizes T.Rice → T. Rice then strips rider name", () => {
    it.each([
      ["T.Rice Pro", "Lib Tech", "Pro"],
      ["T.Rice Orca", "Lib Tech", "Orca"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });
  });

  describe("real-world combos from all 3 retailers", () => {
    // Tactics
    it("Tactics: Yes. Airmaster 3D Snowboard 2026", () => {
      expect(normalizeModel("Airmaster 3D Snowboard 2026", "Yes.")).toBe("Airmaster 3D");
    });

    // Evo
    it("Evo: Jones Mountain Twin Snowboard 2026", () => {
      expect(normalizeModel("Mountain Twin Snowboard 2026", "Jones")).toBe("Mountain Twin");
    });

    // Backcountry
    it("BC: CAPiTA Spring Break Slush Slashers 2.0 Snowboard - 2026", () => {
      expect(normalizeModel("Spring Break Slush Slashers 2.0 Snowboard - 2026", "CAPiTA")).toBe(
        "Spring Break Slush Slashers 2.0"
      );
    });

    // Backcountry gendered
    it("BC: Jones Dream Weaver 2.0 Snowboard - 2026 - Women's", () => {
      expect(normalizeModel("Dream Weaver 2.0 Snowboard - 2026 - Women's", "Jones")).toBe(
        "Dream Weaver 2.0"
      );
    });

    // REI season year format
    it("REI: Flagship Snowboard - 2025/2026", () => {
      expect(normalizeModel("Flagship Snowboard - 2025/2026", "Jones")).toBe("Flagship");
    });

    it("REI: Mountain Twin Snowboard - 2025/2026", () => {
      expect(normalizeModel("Mountain Twin Snowboard - 2025/2026", "Jones")).toBe("Mountain Twin");
    });

    it("REI: Mind Expander Snowboard - 2025/2026", () => {
      expect(normalizeModel("Mind Expander Snowboard - 2025/2026", "Jones")).toBe("Mind Expander");
    });

    it("REI: Stratos Snowboard - 2025/2026", () => {
      expect(normalizeModel("Stratos Snowboard - 2025/2026", "Jones")).toBe("Stratos");
    });

    it("REI: Frontier 2.0 Snowboard - 2025/2026", () => {
      expect(normalizeModel("Frontier 2.0 Snowboard - 2025/2026", "Jones")).toBe("Frontier 2.0");
    });

    it("REI: Process Camber Snowboard - 2025/2026", () => {
      expect(normalizeModel("Process Camber Snowboard - 2025/2026", "Burton")).toBe("Process Camber");
    });
  });
});

// =============================================================================
// detectCondition
// =============================================================================

describe("detectCondition", () => {
  it("detects (Blem) in model → BLEMISHED", () => {
    expect(detectCondition("Burton Custom Snowboard (Blem) 2025")).toBe(ListingCondition.BLEMISHED);
  });

  it("detects - Blem in model → BLEMISHED", () => {
    expect(detectCondition("Jones Flagship - Blem")).toBe(ListingCondition.BLEMISHED);
  });

  it("detects (Closeout) in model → CLOSEOUT", () => {
    expect(detectCondition("Lib Tech Skate Banana (Closeout) 2024")).toBe(ListingCondition.CLOSEOUT);
  });

  it("detects /outlet/ in URL → CLOSEOUT", () => {
    expect(detectCondition("regular model", "https://example.com/outlet/board")).toBe(ListingCondition.CLOSEOUT);
  });

  it("regular model name → NEW", () => {
    expect(detectCondition("regular model name")).toBe(ListingCondition.NEW);
  });

  it("(Sale) is NOT a condition → NEW", () => {
    expect(detectCondition("model (Sale)")).toBe(ListingCondition.NEW);
  });

  it("detects -closeout in URL → CLOSEOUT", () => {
    expect(detectCondition("model", "https://tactics.com/ride/psychocandy-snowboard-closeout")).toBe(ListingCondition.CLOSEOUT);
  });

  it("detects -blem in URL → BLEMISHED", () => {
    expect(detectCondition("model", "https://evo.com/lib-tech-t-rice-apex-orca-blem")).toBe(ListingCondition.BLEMISHED);
  });
});

// =============================================================================
// detectGender
// =============================================================================

describe("detectGender", () => {
  it("detects Women's suffix → WOMENS", () => {
    expect(detectGender("Burton Feelgood Snowboard - Women's")).toBe(GenderTarget.WOMENS);
  });

  it("detects Women's prefix → WOMENS", () => {
    expect(detectGender("Women's Frosting C2 Snowboard")).toBe(GenderTarget.WOMENS);
  });

  it("detects Men's prefix → UNISEX (mens collapsed to unisex)", () => {
    expect(detectGender("Men's Custom Camber Snowboard")).toBe(GenderTarget.UNISEX);
  });

  it("detects Kids' suffix → KIDS", () => {
    expect(detectGender("Burton Process Snowboard - Kids'")).toBe(GenderTarget.KIDS);
  });

  it("plain model → UNISEX", () => {
    expect(detectGender("Jones Flagship")).toBe(GenderTarget.UNISEX);
  });

  it("detects -womens in URL → WOMENS", () => {
    expect(detectGender("model", "https://www.backcountry.com/some-board-womens")).toBe(GenderTarget.WOMENS);
  });
});

// =============================================================================
// extractComboContents
// =============================================================================

describe("extractComboContents", () => {
  describe("detects + combos", () => {
    it("extracts binding from board + binding combo", () => {
      expect(extractComboContents("Instigator Camber Snowboard + Malavita Re:Flex Binding")).toBe(
        "Malavita Re:Flex Binding"
      );
    });

    it("strips trailing year from combo contents", () => {
      expect(extractComboContents("Birds Of A Feather Snowboard + Union Ultra Binding - 2026")).toBe(
        "Union Ultra Binding"
      );
    });

    it("strips trailing gender from combo contents", () => {
      expect(extractComboContents("Feelgood Snowboard + Step On Package - Women's")).toBe(
        "Step On Package"
      );
    });

    it("extracts binding with year in middle", () => {
      expect(extractComboContents("Kazu Kokubo Pro Snowboard + Union Atlas Pro Binding - 2026")).toBe(
        "Union Atlas Pro Binding"
      );
    });
  });

  describe("returns null for non-combos", () => {
    it("returns null for plain model name", () => {
      expect(extractComboContents("Custom Flying V")).toBeNull();
    });

    it("returns null for model with year", () => {
      expect(extractComboContents("Process Camber Snowboard - 2025/2026")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(extractComboContents("")).toBeNull();
    });
  });
});

// =============================================================================
// Zero-width character stripping (Task 39)
// =============================================================================

describe("zero-width character stripping", () => {
  it("normalizeModel strips zero-width chars", () => {
    expect(normalizeModel("Custom\u200b")).toBe("Custom");
    expect(normalizeModel("Cus\u200ctom")).toBe("Custom");
    expect(normalizeModel("\ufeffCustom")).toBe("Custom");
    expect(normalizeModel("Custom\u00ad")).toBe("Custom");
  });

  it("normalizeBrand strips zero-width chars", () => {
    expect(normalizeBrand("Burton\u200b")).toBe("Burton");
    expect(normalizeBrand("\ufeffBurton")).toBe("Burton");
  });
});

// =============================================================================
// New brand aliases (Task 39)
// =============================================================================

describe("canonicalizeBrand — new aliases", () => {
  it('maps "never summer" to "Never Summer"', () => {
    expect(canonicalizeBrand("never summer")).toBe("Never Summer");
  });

  it('maps "united shapes" to "United Shapes"', () => {
    expect(canonicalizeBrand("united shapes")).toBe("United Shapes");
  });
});

// =============================================================================
// Model normalization — new rules (Task 39)
// =============================================================================

describe("normalizeModel — Task 39 rules", () => {
  describe("strips leading 'the '", () => {
    it.each([
      ["The Throwback Snowboard 2026", undefined, "Throwback"],
      ["The Black Of Death Snowboard 2026", undefined, "Black Of Death"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("replaces space-dash-space with space", () => {
    it("hps - goop → hps goop", () => {
      expect(normalizeModel("HPS - Goop")).toBe("HPS Goop");
    });
  });

  describe("strips periods from model names", () => {
    it.each([
      ["D.O.A.", undefined, "DOA"],
      ["Super D.O.A.", undefined, "Super DOA"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("replaces hyphens with spaces", () => {
    it("Gloss-C → Gloss C", () => {
      expect(normalizeModel("Gloss-C")).toBe("Gloss C");
    });
  });

  describe("model aliases", () => {
    it("Mega Merc → mega mercury", () => {
      expect(normalizeModel("Mega Merc", "CAPiTA")).toBe("mega mercury");
    });

    it("SB Slush Slashers → spring break Slush Slashers", () => {
      expect(normalizeModel("SB Slush Slashers", "CAPiTA")).toBe("spring break Slush Slashers");
    });

    it("Son Of A Birdman → son of birdman", () => {
      expect(normalizeModel("Son Of A Birdman", "Lib Tech")).toBe("son of birdman");
    });

    it("Snowboards Something → Something", () => {
      expect(normalizeModel("Snowboards Display", "Public")).toBe("Display");
    });
  });
});

// =============================================================================
// specKey — kids prefix deduplication (Task 39)
// =============================================================================

describe("specKey — kids prefix stripping", () => {
  it("strips 'kids ' prefix for kids gender", () => {
    const key1 = specKey("Burton", "Kids Custom Smalls", "kids");
    const key2 = specKey("Burton", "Custom Smalls", "kids");
    expect(key1).toBe(key2);
  });

  it("does not strip 'kids ' for unisex gender", () => {
    const key = specKey("Burton", "Kids Custom Smalls", "unisex");
    expect(key).toContain("kids custom smalls");
  });

  it("strips 'kids ' prefix for youth gender", () => {
    const key1 = specKey("Burton", "Kids Custom Smalls", "youth");
    const key2 = specKey("Burton", "Custom Smalls", "kids");
    expect(key1).toBe(key2);
  });
});

// =============================================================================
// Zero-width chars + alias resolution interaction (Task 39)
// =============================================================================

describe("zero-width chars + alias resolution", () => {
  it("normalizeBrand resolves alias after stripping zero-width chars", () => {
    expect(normalizeBrand("never\u200b summer")).toBe("Never Summer");
    expect(normalizeBrand("lib\u200d tech")).toBe("Lib Tech");
    expect(normalizeBrand("\ufeffcapita")).toBe("CAPiTA");
    expect(normalizeBrand("united\u200c shapes")).toBe("United Shapes");
  });

  it("normalizeModel produces same key with and without zero-width chars", () => {
    const clean = normalizeModel("Custom", "Burton");
    const dirty = normalizeModel("Cus\u200btom", "Burton");
    expect(clean).toBe(dirty);
  });

  it("specKey produces identical keys with and without zero-width chars", () => {
    const clean = specKey("Burton", "Custom", "unisex");
    const dirty = specKey("Burton", "Cus\u200btom", "unisex");
    expect(clean).toBe(dirty);
  });
});

// =============================================================================
// Pipe char stripping (Task 39 round 7)
// =============================================================================

describe("normalizeModel — pipe char", () => {
  it("replaces pipe with space", () => {
    expect(normalizeModel("Warpspeed | Automobili Lamborghini Snowboard 2026", "CAPiTA")).toBe(
      "Warpspeed Automobili Lamborghini"
    );
  });
});

// =============================================================================
// Package deal stripping (Task 39 round 7)
// =============================================================================

describe("normalizeModel — package deals", () => {
  it("strips Package keyword", () => {
    expect(normalizeModel("After School Special Package", "Burton")).toBe(
      "After School Special"
    );
  });

  it("strips & Bindings from combo listing", () => {
    expect(normalizeModel("Poppy & Bindings Snowboard", "Burton")).toBe(
      "Poppy"
    );
  });

  it("strips & Binding (singular) from combo listing", () => {
    expect(normalizeModel("Recess & Binding", "Burton")).toBe(
      "Recess"
    );
  });
});

// =============================================================================
// Period stripping edge cases (Task 39)
// =============================================================================

describe("normalizeModel — period stripping edge cases", () => {
  it("preserves version numbers like 2.0", () => {
    expect(normalizeModel("Dream Weaver 2.0", "Jones")).toBe("Dream Weaver 2.0");
    expect(normalizeModel("Frontier 2.0", "Jones")).toBe("Frontier 2.0");
    expect(normalizeModel("Slush Slashers 2.0", "CAPiTA")).toBe("Slush Slashers 2.0");
  });

  it("strips T. Rice rider name from Lib Tech models", () => {
    expect(normalizeModel("T. Rice Pro", "Lib Tech")).toBe("Pro");
    expect(normalizeModel("T. Rice Orca", "Lib Tech")).toBe("Orca");
  });

  it("strips acronym periods between letters", () => {
    expect(normalizeModel("D.O.A.")).toBe("DOA");
    expect(normalizeModel("B.O.D.")).toBe("BOD");
  });

  it("strips acronym periods in compound names", () => {
    expect(normalizeModel("Super D.O.A.")).toBe("Super DOA");
  });

  it("handles mixed periods — acronym + version number", () => {
    // Hypothetical: version number preserved, acronym stripped
    expect(normalizeModel("D.O.A. 2.0")).toBe("DOA 2.0");
  });
});

// =============================================================================
// specKey — end-to-end deduplication (Task 39)
// =============================================================================

describe("specKey — deduplication of variant names", () => {
  it("D.O.A. and DOA produce the same key", () => {
    expect(specKey("CAPiTA", "D.O.A.", "unisex")).toBe(specKey("CAPiTA", "DOA", "unisex"));
  });

  it("Gloss-C and Gloss C produce the same key", () => {
    expect(specKey("GNU", "Gloss-C", "unisex")).toBe(specKey("GNU", "Gloss C", "unisex"));
  });

  it("The Throwback and Throwback produce the same key", () => {
    expect(specKey("Rome", "The Throwback", "unisex")).toBe(specKey("Rome", "Throwback", "unisex"));
  });

  it("HPS - Goop and HPS Goop produce the same key", () => {
    expect(specKey("Jones", "HPS - Goop", "unisex")).toBe(specKey("Jones", "HPS Goop", "unisex"));
  });

  it("Mega Merc and Mega Mercury produce the same key", () => {
    expect(specKey("CAPiTA", "Mega Merc", "unisex")).toBe(specKey("CAPiTA", "Mega Mercury", "unisex"));
  });

  it("SB and Spring Break prefix produce the same key", () => {
    expect(specKey("CAPiTA", "SB Slush Slashers", "unisex")).toBe(
      specKey("CAPiTA", "Spring Break Slush Slashers", "unisex")
    );
  });
});

// =============================================================================
// Remaining duplicates — GNU model naming (Task 39)
// =============================================================================

describe("specKey — GNU model deduplication", () => {
  it("C Money and Money produce DIFFERENT keys (C is a model variant, not stripped)", () => {
    // "C Money" and "Money" are now distinct model names
    expect(specKey("GNU", "C Money", "unisex")).not.toBe(specKey("GNU", "Money", "unisex"));
  });

  it("Gloss C and Gloss produce DIFFERENT keys (C is a model variant, not stripped)", () => {
    // "Gloss C" and "Gloss" are now distinct model names
    expect(specKey("GNU", "Gloss C", "womens")).not.toBe(specKey("GNU", "Gloss", "womens"));
  });

  it("Forest Bailey Head Space and Head Space produce the same key", () => {
    // "Forest Bailey" is a rider name prefix
    expect(specKey("GNU", "Forest Bailey Head Space", "unisex")).toBe(
      specKey("GNU", "Head Space", "unisex")
    );
  });

  it("Forest Bailey 4x4 and 4x4 produce the same key", () => {
    expect(specKey("GNU", "Forest Bailey 4x4", "unisex")).toBe(
      specKey("GNU", "4x4", "unisex")
    );
  });

  it("Max Warbington Finest Asym and Finest produce the same key", () => {
    // "Max Warbington" is rider name prefix, "Asym" is shape descriptor
    expect(specKey("GNU", "Max Warbington Finest Asym", "unisex")).toBe(
      specKey("GNU", "Finest", "unisex")
    );
  });

  it("Cummins' Banked Country and Banked Country produce the same key", () => {
    expect(specKey("GNU", "Cummins' Banked Country", "unisex")).toBe(
      specKey("GNU", "Banked Country", "unisex")
    );
  });
});

// =============================================================================
// Remaining duplicates — CAPiTA model naming (Task 39)
// =============================================================================

describe("specKey — CAPiTA model deduplication", () => {
  it("Arthur Longo Aeronaut and Aeronaut produce the same key", () => {
    expect(specKey("CAPiTA", "Arthur Longo Aeronaut", "unisex")).toBe(
      specKey("CAPiTA", "Aeronaut", "unisex")
    );
  });

  it("Equalizer By Jess Kimura and Equalizer produce the same key (womens)", () => {
    // Manufacturer uses "Equalizer By Jess Kimura", retailers use "Equalizer"
    expect(specKey("CAPiTA", "Equalizer By Jess Kimura", "womens")).toBe(
      specKey("CAPiTA", "Equalizer", "womens")
    );
  });

  it("Jess Kimura Equalizer and Equalizer produce the same key (womens)", () => {
    // Tactics uses "Jess Kimura Equalizer", others use "Equalizer"
    expect(specKey("CAPiTA", "Jess Kimura Equalizer", "womens")).toBe(
      specKey("CAPiTA", "Equalizer", "womens")
    );
  });
});

// =============================================================================
// Remaining duplicates — other rider name prefixes (Task 39)
// =============================================================================

describe("specKey — rider name prefix stripping", () => {
  it("Hailey Langland Alternator and Alternator produce the same key", () => {
    expect(specKey("Nitro", "Hailey Langland Alternator", "womens")).toBe(
      specKey("Nitro", "Alternator", "womens")
    );
  });

  it("Team Pro Marcus Kleveland and Team Pro produce the same key (suffix)", () => {
    expect(specKey("Nitro", "Team Pro Marcus Kleveland", "unisex")).toBe(
      specKey("Nitro", "Team Pro", "unisex")
    );
  });
});

// =============================================================================
// Gender detection — WMN suffix (Task 39)
// =============================================================================

describe("detectGender — WMN detection", () => {
  it("detects WMN in model as WOMENS", () => {
    expect(detectGender("Navigator WMN")).toBe(GenderTarget.WOMENS);
  });

  it("detects Wmn in model as WOMENS", () => {
    expect(detectGender("Navigator Wmn Split")).toBe(GenderTarget.WOMENS);
  });
});

describe("detectGender — toddler detection", () => {
  it("detects Toddlers' as KIDS", () => {
    expect(detectGender("Ripper Toddlers'")).toBe(GenderTarget.KIDS);
  });

  it("detects Toddler as KIDS", () => {
    expect(detectGender("Ripper Toddler")).toBe(GenderTarget.KIDS);
  });

  it("detects Toddlers as KIDS", () => {
    expect(detectGender("Ripper Toddlers")).toBe(GenderTarget.KIDS);
  });
});

describe("specKey — WMN gender resolution", () => {
  it("Navigator WMN gets womens gender key", () => {
    expect(specKey("CAPiTA", "Navigator WMN", "womens")).toContain("|womens");
  });
});

// =============================================================================
// Round 3 rider names: Lib Tech, Arbor, Gentemstick (Task 39)
// =============================================================================

describe("specKey — Lib Tech T. Rice rider name stripping", () => {
  it("T. Rice Golden Orca → Golden Orca", () => {
    expect(specKey("Lib Tech", "T. Rice Golden Orca", "unisex")).toBe(
      specKey("Lib Tech", "Golden Orca", "unisex")
    );
  });

  it("T. Rice Orca → Orca", () => {
    expect(specKey("Lib Tech", "T. Rice Orca", "unisex")).toBe(
      specKey("Lib Tech", "Orca", "unisex")
    );
  });

  it("Travis Rice Orca → Orca", () => {
    expect(specKey("Lib Tech", "Travis Rice Orca", "unisex")).toBe(
      specKey("Lib Tech", "Orca", "unisex")
    );
  });
});

describe("specKey — Arbor additional rider names", () => {
  it("Mike Liddle Metal Machine → Metal Machine", () => {
    expect(specKey("Arbor", "Mike Liddle Metal Machine", "unisex")).toBe(
      specKey("Arbor", "Metal Machine", "unisex")
    );
  });

  it("Danny Kass Park Pro → Park Pro", () => {
    expect(specKey("Arbor", "Danny Kass Park Pro", "unisex")).toBe(
      specKey("Arbor", "Park Pro", "unisex")
    );
  });

  it("DK Park Pro → Park Pro", () => {
    expect(specKey("Arbor", "DK Park Pro", "unisex")).toBe(
      specKey("Arbor", "Park Pro", "unisex")
    );
  });

  it("Bryan Iguchi Pro → Pro (rider stripped)", () => {
    expect(specKey("Arbor", "Bryan Iguchi Pro", "unisex")).toBe(
      specKey("Arbor", "Pro", "unisex")
    );
  });
});

describe("specKey — Gentemstick rider names", () => {
  it("Alex Yoder XY → XY (rider stripped)", () => {
    expect(specKey("Gentemstick", "Alex Yoder XY", "unisex")).toBe(
      specKey("Gentemstick", "XY", "unisex")
    );
  });
});

// =============================================================================
// Season suffix and size number stripping (Task 39)
// =============================================================================

describe("normalizeModel — season and size stripping", () => {
  it("strips '2627 EARLY RELEASE' suffix", () => {
    expect(normalizeModel("Golden Orca 2627 EARLY RELEASE", "Lib Tech")).toBe(
      "Golden Orca"
    );
  });

  it("strips '- 2627 EARLY RELEASE' with dash prefix", () => {
    expect(normalizeModel("Doughboy 185 - 2627 EARLY RELEASE", "Lib Tech")).toBe(
      "Doughboy"
    );
  });

  it("strips '2627 early release' case-insensitive", () => {
    expect(normalizeModel("Orca II 2627 Early Release", "Lib Tech")).toBe(
      "Orca II"
    );
  });

  it("strips trailing 3-digit size number (185)", () => {
    expect(normalizeModel("Doughboy 185", "Lib Tech")).toBe("Doughboy");
  });

  it("strips trailing 3-digit size number (195)", () => {
    expect(normalizeModel("Doughboy 195", "Lib Tech")).toBe("Doughboy");
  });

  it("does NOT strip non-size numbers (e.g. 4x4)", () => {
    expect(normalizeModel("4x4", "GNU")).toBe("4x4");
  });

  it("strips both size and season suffix together", () => {
    expect(normalizeModel("Doughboy 185 2627 EARLY RELEASE", "Lib Tech")).toBe(
      "Doughboy"
    );
  });
});
