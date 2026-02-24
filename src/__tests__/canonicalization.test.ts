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
      ["Lectra Cam-Out Snowboard - 2026 - Women's", undefined, "Lectra Cam-Out"],
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
      ["Women's Frosting C2 Snowboard 2025", undefined, "Frosting"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips retail tags", () => {
    it.each([
      ["Psychocandy Snowboard (Closeout) 2025", undefined, "Psychocandy"],
      ["Forest Bailey Head Space C3 Snowboard (Closeout) 2025", undefined, "Forest Bailey Head Space"],
      ["T. Rice Apex Orca Snowboard - Blem 2026", "Lib Tech", "T. Rice Apex Orca"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips binding/package info", () => {
    it.each([
      ["Instigator Camber Snowboard + Malavita Re:Flex Binding", "Burton", "Instigator"],
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
      ["Tech T. Rice Apex Orca Snowboard - Blem 2026", "Lib Tech", "T. Rice Apex Orca"],
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
      ["Process Flying V", undefined, "Process"],
      ["Halldor", undefined, "Halldor"],
      ["Flagship Pro", undefined, "Flagship Pro"],
    ])('%s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand || undefined)).toBe(expected);
    });
  });

  describe("strips brand name prefix from model (generic)", () => {
    it.each([
      ["GNU Asym Ladies Choice C2X Snowboard - Women's 2025", "GNU", "Asym Ladies Choice"],
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
    // Burton profile stripping
    it.each([
      ["Custom Camber", "Burton", "Custom"],
      ["Custom Flying V", "Burton", "Custom"],
      ["Feelgood Camber", "Burton", "Feelgood"],
      ["Hideaway Flat Top", "Burton", "Hideaway"],
      ["Instigator PurePop Camber", "Burton", "Instigator"],
    ])('Burton: %s → %s', (input, brand, expected) => {
      expect(normalizeModel(input, brand)).toBe(expected);
    });

    // Lib Tech / GNU profile code stripping
    it.each([
      ["Legitimizer C3", "Lib Tech", "Legitimizer"],
      ["Rasman C2X", "Lib Tech", "Rasman"],
      ["Frosting C2", "GNU", "Frosting"],
      ["Gloss-C C3", "GNU", "Gloss-C"],
      ["C Money C3", "GNU", "C Money"],
      ["T. Rice Pro C2", "Lib Tech", "T. Rice Pro"],
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

  describe("normalizes T.Rice → T. Rice", () => {
    it.each([
      ["T.Rice Pro", "Lib Tech", "T. Rice Pro"],
      ["T.Rice Orca", "Lib Tech", "T. Rice Orca"],
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
      expect(normalizeModel("Process Camber Snowboard - 2025/2026", "Burton")).toBe("Process");
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

  it("detects Men's prefix → MENS", () => {
    expect(detectGender("Men's Custom Camber Snowboard")).toBe(GenderTarget.MENS);
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
