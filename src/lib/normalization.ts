import { config } from "./config";
import {
  BoardProfile,
  BoardShape,
  BoardCategory,
  Availability,
  Currency,
  ListingCondition,
  GenderTarget,
} from "./types";
import { PROFILE_MAP, SHAPE_MAP, CATEGORY_MAP, CATEGORY_KEYWORDS } from "./normalization-maps";

export function detectCondition(rawModel: string, url?: string): ListingCondition {
  if (/\(blem\)|- blem\b/i.test(rawModel)) return ListingCondition.BLEMISHED;
  if (/\(closeout\)|- closeout\b/i.test(rawModel)) return ListingCondition.CLOSEOUT;
  if (url) {
    if (/-blem\b/i.test(url)) return ListingCondition.BLEMISHED;
    if (/\/outlet\//i.test(url) || /-closeout\b/i.test(url)) return ListingCondition.CLOSEOUT;
  }
  return ListingCondition.NEW;
}

export function normalizeConditionString(raw: string): ListingCondition {
  const lower = raw.toLowerCase();
  if (lower === "blemished" || lower === "blem") return ListingCondition.BLEMISHED;
  if (lower === "closeout" || lower === "outlet") return ListingCondition.CLOSEOUT;
  if (lower === "used") return ListingCondition.USED;
  if (lower === "new") return ListingCondition.NEW;
  return ListingCondition.UNKNOWN;
}

export function detectGender(rawModel: string, url?: string): GenderTarget {
  if (/women'?s|wmns|\bwmn\b/i.test(rawModel) || (url && /[\/-]womens?\b/i.test(url)))
    return GenderTarget.WOMENS;
  if (/kids'?|boys'?|girls'?|youth|junior|toddlers?'?/i.test(rawModel))
    return GenderTarget.KIDS;
  return GenderTarget.UNISEX;
}

export function normalizeProfile(raw: string): BoardProfile | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  // Direct lookup
  if (PROFILE_MAP[lower]) return PROFILE_MAP[lower];

  // Check for compound rocker+camber presence before substring matching,
  // so "camber dominant with rocker tips" → HYBRID_CAMBER (not plain CAMBER)
  if (lower.includes("rocker") && lower.includes("camber")) {
    return lower.indexOf("rocker") < lower.indexOf("camber")
      ? BoardProfile.HYBRID_ROCKER
      : BoardProfile.HYBRID_CAMBER;
  }

  // Substring matching for compound terms
  for (const [key, value] of Object.entries(PROFILE_MAP)) {
    if (lower.includes(key)) return value;
  }

  // Single-keyword fallback
  if (lower.includes("camber")) return BoardProfile.CAMBER;
  if (lower.includes("rocker")) return BoardProfile.ROCKER;
  if (lower.includes("flat")) return BoardProfile.FLAT;

  return null;
}

export function normalizeShape(raw: string): BoardShape | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  if (SHAPE_MAP[lower]) return SHAPE_MAP[lower];

  // Check compound directional+twin before substring matching,
  // so "slight directional with twin shape" → DIRECTIONAL_TWIN (not TRUE_TWIN)
  if (lower.includes("twin") && lower.includes("direct")) {
    return BoardShape.DIRECTIONAL_TWIN;
  }

  for (const [key, value] of Object.entries(SHAPE_MAP)) {
    if (lower.includes(key)) return value;
  }

  if (lower.includes("twin")) return BoardShape.TRUE_TWIN;
  if (lower.includes("directional")) return BoardShape.DIRECTIONAL;
  if (lower.includes("taper")) return BoardShape.TAPERED;

  return null;
}

export function normalizeCategory(
  rawCategory?: string,
  description?: string | null
): BoardCategory | null {
  if (rawCategory) {
    const lower = rawCategory.toLowerCase().trim();

    if (CATEGORY_MAP[lower]) return CATEGORY_MAP[lower];

    for (const [key, value] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(key)) return value;
    }
  }

  // Keyword matching on description
  if (description) {
    const lowerDesc = description.toLowerCase();
    let bestCategory: BoardCategory | null = null;
    let bestCount = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const count = keywords.filter((kw) => lowerDesc.includes(kw)).length;
      if (count > bestCount) {
        bestCount = count;
        bestCategory = category as BoardCategory;
      }
    }

    if (bestCategory) return bestCategory;
  }

  return null;
}

export function inferYear(model: string): number | null {
  if (!model) return null;
  // Match 4-digit year (2018-2029) or 2-digit year (18-29)
  const match4 = model.match(/\b(20[1-2]\d)\b/);
  if (match4) return parseInt(match4[1]);

  const match2 = model.match(/\b([1-2]\d)\b/);
  if (match2) {
    const year = parseInt(match2[1]);
    if (year >= 18 && year <= 29) return 2000 + year;
  }

  return null;
}

/**
 * Extract binding/package name from a combo listing's raw model string.
 * Returns null if the model is not a combo.
 */
export function extractComboContents(raw: string): string | null {
  if (!raw) return null;

  // Match " + <combo contents>" or " w/ <combo contents>"
  const plusMatch = raw.match(/\s*\+\s(.*)$/);
  const withMatch = raw.match(/\s+w\/\s(.*)$/i);
  const match = plusMatch || withMatch;
  if (!match) return null;

  let contents = match[1];

  // Strip trailing year (e.g. "- 2026", " 2025")
  contents = contents.replace(/\s*-?\s*\b20[1-2]\d\b/g, "");

  // Strip trailing gender (e.g. "- Women's", "- Men's")
  contents = contents.replace(/\s*-\s*(?:Men's|Women's|Kids'|Boys'|Girls')$/i, "");

  // Strip "Snowboard" (shouldn't appear in combo part, but just in case)
  contents = contents.replace(/\s+Snowboard\b/gi, "");

  // Clean up whitespace
  contents = contents.replace(/\s{2,}/g, " ").trim();

  return contents || null;
}

export const PROFILE_SUFFIX_RE =
  /\s+(?:PurePop\s+Camber|C3\s+BTX|Flying\s+V|Flat\s+Top|PurePop|Camber|C2X|C2E|C2|C3|BTX)$/i;

// ---------------------------------------------------------------------------
// Normalization pipeline — structured, composable, testable
// ---------------------------------------------------------------------------

export interface NormalizationStep {
  /** Short identifier for this step (used in debug traces) */
  name: string;
  /** Which brands this step applies to (undefined = all brands) */
  brands?: string[];
  /** Transform the model string. Receives current model + brand context. */
  transform(model: string, brand: string | undefined): string;
}

const MODEL_ALIASES: Record<string, string> = {
  "mega merc": "mega mercury",
  "son of a birdman": "son of birdman",
  "hel yes": "hell yes",
  "dreamweaver": "dream weaver",
  "paradice": "paradise",
  "fish 3d directional": "3d fish directional",
  "fish 3d": "3d fish directional",
  "3d family tree channel surfer": "family tree 3d channel surfer",
  "x konvoi surfer": "konvoi x nitro surfer",
};

const MODEL_PREFIX_ALIASES: [string, string][] = [
  ["sb ", "spring break "],
  ["snowboards ", ""],
  ["darkhorse ", "dark horse "],
];

const RIDER_NAMES: Record<string, string[]> = {
  "GNU": ["Forest Bailey", "Max Warbington", "Cummins'"],
  "CAPiTA": ["Arthur Longo", "Jess Kimura"],
  "Nitro": ["Hailey Langland", "Marcus Kleveland"],
  "Jones": ["Harry Kearney", "Ruiki Masuda"],
  "Arbor": ["Bryan Iguchi", "Erik Leon", "Jared Elston", "Pat Moore", "Mike Liddle", "Danny Kass", "DK"],
  "Lib Tech": ["T. Rice", "Travis Rice"],
  "Gentemstick": ["Alex Yoder"],
  "Aesmo": ["Fernando Elvira"],
};

/**
 * The ordered pipeline of normalization steps.
 * Each step is named and independently testable.
 * Steps with a `brands` array only apply to those brands.
 *
 * ORDER MATTERS — steps are applied sequentially and some depend on
 * earlier steps having already run (documented in step names/comments).
 */
export const NORMALIZATION_PIPELINE: NormalizationStep[] = [
  {
    name: "strip-unicode",
    transform: (m) => m.replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, ""),
  },
  {
    name: "strip-pipe",
    transform: (m) => m.replace(/\s*\|\s*/g, " "),
  },
  {
    name: "strip-combo",
    transform: (m) => {
      m = m.replace(/\s*\+\s.*$/, "");
      m = m.replace(/\s+w\/\s.*$/i, "");
      m = m.replace(/\s+&\s+Bindings?\b.*$/i, "");
      return m;
    },
  },
  {
    name: "strip-retail-tags",
    transform: (m) => {
      m = m.replace(/\s*\((?:Closeout|Blem|Sale)\)/gi, "");
      m = m.replace(/\s*-\s*(?:Closeout|Blem|Sale)\b/gi, "");
      return m;
    },
  },
  {
    name: "strip-snowboard",
    transform: (m) => m.replace(/\s+Snowboard\b/gi, ""),
  },
  {
    name: "strip-year",
    transform: (m) => {
      m = m.replace(/\s*-?\s*\b20[1-2]\d\s*\/\s*20[1-2]\d\b/g, "");
      m = m.replace(/\s*-?\s*\b20[1-2]\d\b/g, "");
      return m;
    },
  },
  {
    name: "strip-season-suffix",
    transform: (m) => m.replace(/\s*-?\s*\d{4}\s+early\s+release\b/gi, ""),
  },
  {
    name: "strip-trailing-size",
    transform: (m) => m.replace(/\s+\b(1[3-9]\d|2[0-2]\d)\b/g, ""),
  },
  {
    name: "strip-gender-suffix",
    transform: (m) => m.replace(/\s*-\s*(?:Men's|Women's|Kids'|Boys'|Girls')$/i, ""),
  },
  {
    name: "strip-gender-prefix",
    transform: (m) => m.replace(/^(?:Women's|Men's|Kids'|Boys'|Girls')\s+/i, ""),
  },
  {
    name: "strip-brand-prefix",
    transform: (m, brand) => {
      if (!brand) return m;
      const brandLower = brand.toLowerCase();
      const modelLower = m.toLowerCase();
      if (modelLower.startsWith(brandLower + " ")) {
        return m.slice(brand.length).trimStart();
      }
      return m;
    },
  },
  {
    name: "fix-libtech-brand-leak",
    brands: ["Lib Tech"],
    transform: (m) => m.replace(/^Tech\s+/i, ""),
  },
  {
    name: "fix-dwd-brand-leak",
    brands: ["Dinosaurs Will Die"],
    transform: (m) => m.replace(/^(?:Will Die|Dinosaurs)\s+/i, ""),
  },
  {
    name: "normalize-trice",
    transform: (m) => m.replace(/T\.Rice/g, "T. Rice"),
  },
  // "strip-profile" is handled specially via opts.keepProfile — see normalizeModel()
  {
    name: "strip-leading-the",
    transform: (m) => m.replace(/^the\s+/i, ""),
  },
  {
    name: "replace-space-dash-space",
    transform: (m) => m.replace(/\s+-\s+/g, " "),
  },
  {
    name: "strip-acronym-periods",
    transform: (m) => {
      m = m.replace(/\.(?=[a-zA-Z])/g, "");
      m = m.replace(/(?<=[a-zA-Z]{2})\.(?=\s|$)/g, "");
      return m;
    },
  },
  {
    name: "replace-hyphens",
    transform: (m) => m.replace(/-/g, " "),
  },
  {
    name: "apply-model-aliases",
    transform: (m) => {
      const lower = m.toLowerCase();
      if (MODEL_ALIASES[lower]) return MODEL_ALIASES[lower];
      for (const [prefix, replacement] of MODEL_PREFIX_ALIASES) {
        if (lower.startsWith(prefix)) {
          return replacement + m.slice(prefix.length);
        }
      }
      return m;
    },
  },
  {
    name: "strip-rider-names",
    transform: (m, brand) => {
      if (!brand) return m;
      const riders = RIDER_NAMES[brand];
      if (!riders) return m;
      const mLower = m.toLowerCase();
      for (const rider of riders) {
        const rLower = rider.toLowerCase();
        const byIdx = mLower.indexOf(" by " + rLower);
        if (byIdx >= 0) {
          return (m.slice(0, byIdx) + m.slice(byIdx + 4 + rider.length)).trim();
        }
        if (mLower.startsWith(rLower + " ")) {
          return m.slice(rider.length).trimStart();
        }
        if (mLower.endsWith(" " + rLower)) {
          return m.slice(0, m.length - rider.length - 1);
        }
      }
      return m;
    },
  },
  {
    name: "strip-signature-series",
    transform: (m, brand) => {
      if (!brand) return m;
      return m.replace(/^(?:Signature Series|Ltd)\s+/i, "");
    },
  },
  {
    name: "strip-gnu-profile-letter",
    brands: ["GNU"],
    transform: (m) => {
      m = m.replace(/^C\s+/i, "");
      m = m.replace(/\s+C$/i, "");
      return m;
    },
  },
  {
    name: "strip-gnu-asym",
    brands: ["GNU"],
    transform: (m) => {
      m = m.replace(/^Asym\s+/i, "");
      m = m.replace(/\s+Asym\b/i, "");
      return m;
    },
  },
  {
    name: "strip-package",
    transform: (m) => m.replace(/\s+Package\b/gi, ""),
  },
  {
    name: "clean-whitespace",
    transform: (m) => {
      m = m.replace(/\/+$/, "");
      m = m.replace(/^\s*[-/]\s*/, "").replace(/\s*[-/]\s*$/, "");
      m = m.replace(/\s{2,}/g, " ").trim();
      return m;
    },
  },
];

/**
 * Check if a step applies to the given brand.
 */
function stepApplies(step: NormalizationStep, brand: string | undefined): boolean {
  if (!step.brands) return true;
  if (!brand) return false;
  return step.brands.includes(brand);
}

import { BrandIdentifier } from "./strategies/brand-identifier";
import { getStrategy } from "./strategies";
import type { BoardSignal } from "./strategies/types";

/**
 * Run model normalization via the strategy pattern.
 * Delegates to the appropriate manufacturer strategy (Burton, Mervin, Default).
 */
export function normalizeModel(raw: string, brand?: string, manufacturer?: string): string {
  if (!raw || raw === "Unknown") return raw;

  const brandId = manufacturer ? null : (brand ? new BrandIdentifier(brand) : null);
  const signal: BoardSignal = {
    rawModel: raw,
    brand: brandId?.canonical ?? (brand || ""),
    manufacturer: manufacturer ?? brandId?.manufacturer ?? "default",
    source: "",
    sourceUrl: "",
  };
  const strategy = getStrategy(signal.manufacturer);
  return strategy.identify(signal).model || raw;
}

/**
 * Run the normalization pipeline and return the intermediate result after each step.
 * Useful for debugging which step(s) caused unexpected normalization.
 * Note: This uses the legacy pipeline directly for step-by-step tracing.
 */
export function normalizeModelDebug(
  raw: string,
  brand?: string,
  opts?: { keepProfile?: boolean }
): { step: string; result: string }[] {
  const trace: { step: string; result: string }[] = [];

  if (!raw || raw === "Unknown") {
    trace.push({ step: "early-return", result: raw });
    return trace;
  }

  let model = raw;
  trace.push({ step: "input", result: model });

  for (const step of NORMALIZATION_PIPELINE) {
    if (!stepApplies(step, brand)) continue;
    if (step.name === "strip-leading-the" && !opts?.keepProfile) {
      model = model.replace(PROFILE_SUFFIX_RE, "");
      trace.push({ step: "strip-profile", result: model });
    }
    model = step.transform(model, brand);
    trace.push({ step: step.name, result: model });
  }

  const final = model || raw;
  if (final !== model) {
    trace.push({ step: "fallback-to-raw", result: final });
  }

  return trace;
}

export function normalizeFlex(raw: string): number | null {
  if (!raw) return null;

  // Try numeric extraction first: "3/10", "6", "3 out of 10"
  const ratingMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:\/|out of)\s*10/i);
  if (ratingMatch) return parseFloat(ratingMatch[1]);

  const plainNum = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (plainNum) {
    const val = parseFloat(plainNum[1]);
    if (val >= 1 && val <= 10) return val;
  }

  // Text-based flex — check compound terms before simple ones
  const lower = raw.toLowerCase().replace(/[\s-]+/g, "-");
  if (lower.includes("very-soft") || lower.includes("extra-soft")) return 2;
  if (lower.includes("medium-soft") || lower.includes("soft-medium")) return 4;
  if (lower.includes("soft")) return 3;
  if (lower.includes("very-stiff") || lower.includes("extra-stiff")) return 9;
  if (lower.includes("medium-stiff") || lower.includes("stiff-medium")) return 6;
  if (lower.includes("stiff")) return 7;
  if (lower.includes("medium")) return 5;

  return null;
}

const ABILITY_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
const ABILITY_ALIASES: Record<string, string> = {
  novice: "beginner",
  "entry level": "beginner",
  "entry-level": "beginner",
  "day 1": "beginner",
  pro: "expert",
  "pro level": "expert",
};

/**
 * Parse a raw ability level string into a min/max range.
 * Handles single levels ("intermediate"), compound ranges ("beginner-intermediate"),
 * and wide spans ("beginner-advanced").
 */
export function normalizeAbilityRange(raw?: string): { min: string | null; max: string | null } {
  if (!raw) return { min: null, max: null };
  const lower = raw.toLowerCase().trim();

  const found = new Set<string>();
  for (const level of ABILITY_LEVELS) {
    if (lower.includes(level)) found.add(level);
  }
  for (const [alias, level] of Object.entries(ABILITY_ALIASES)) {
    if (lower.includes(alias)) found.add(level);
  }

  if (found.size === 0) return { min: null, max: null };

  let minIdx = ABILITY_LEVELS.length - 1;
  let maxIdx = 0;
  for (const level of found) {
    const idx = ABILITY_LEVELS.indexOf(level as typeof ABILITY_LEVELS[number]);
    if (idx >= 0 && idx < minIdx) minIdx = idx;
    if (idx > maxIdx) maxIdx = idx;
  }

  return { min: ABILITY_LEVELS[minIdx] ?? null, max: ABILITY_LEVELS[maxIdx] ?? null };
}

/**
 * Normalize a raw ability level string into a canonical single string.
 * Used for spec_sources storage. Returns "beginner-advanced" style ranges.
 */
export function normalizeAbilityLevel(raw?: string): string | null {
  const range = normalizeAbilityRange(raw);
  if (!range.min) return null;
  if (range.min === range.max) return range.min;
  return `${range.min}-${range.max}`;
}

function normalizeAvailability(raw?: string): Availability {
  if (!raw) return Availability.UNKNOWN;
  const lower = raw.toLowerCase();
  if (lower.includes("in_stock") || lower.includes("in stock") || lower.includes("instock"))
    return Availability.IN_STOCK;
  if (lower.includes("low") || lower.includes("limited") || lower.includes("few left"))
    return Availability.LOW_STOCK;
  if (lower.includes("out") || lower.includes("sold"))
    return Availability.OUT_OF_STOCK;
  return Availability.UNKNOWN;
}

export function convertToUsd(amount: number, currency: Currency): number {
  if (currency === Currency.USD) return amount;
  if (currency === Currency.KRW) return Math.round(amount * config.krwToUsdRate * 100) / 100;
  return amount;
}
