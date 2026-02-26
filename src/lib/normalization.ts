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
  if (/kids'?|boys'?|girls'?|youth|junior/i.test(rawModel))
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

export function normalizeModel(raw: string, brand?: string, opts?: { keepProfile?: boolean }): string {
  if (!raw || raw === "Unknown") return raw;

  let model = raw;

  // Strip zero-width Unicode characters
  model = model.replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, "");

  // Strip binding/package info: everything after " + " or " w/ "
  model = model.replace(/\s*\+\s.*$/, "");
  model = model.replace(/\s+w\/\s.*$/i, "");

  // Strip retail tags: (Closeout), (Blem), (Sale) or "- Blem", "- Closeout"
  model = model.replace(/\s*\((?:Closeout|Blem|Sale)\)/gi, "");
  model = model.replace(/\s*-\s*(?:Closeout|Blem|Sale)\b/gi, "");

  // Strip "Snowboard" (but not from model names like "Snowboard Addiction")
  model = model.replace(/\s+Snowboard\b/gi, "");

  // Strip year: "2025/2026", " - 2026", " 2025", leading "2025 "
  model = model.replace(/\s*-?\s*\b20[1-2]\d\s*\/\s*20[1-2]\d\b/g, "");
  model = model.replace(/\s*-?\s*\b20[1-2]\d\b/g, "");

  // Strip gendered suffixes: " - Men's", " - Women's", " - Kids'", " - Boys'", " - Girls'"
  model = model.replace(/\s*-\s*(?:Men's|Women's|Kids'|Boys'|Girls')$/i, "");

  // Strip leading "Women's ", "Men's " prefix
  model = model.replace(/^(?:Women's|Men's|Kids'|Boys'|Girls')\s+/i, "");

  // Generic brand-prefix stripping: if model starts with the brand name, remove it
  if (brand) {
    const brandLower = brand.toLowerCase();
    const modelLower = model.toLowerCase();
    if (modelLower.startsWith(brandLower + " ")) {
      model = model.slice(brand.length).trimStart();
    }
  }

  // Fix brand leak: Lib Tech → evo lists as "Lib Tech" brand + "Tech Cold Brew..." model
  if (brand === "Lib Tech" && /^Tech\s/i.test(model)) {
    model = model.replace(/^Tech\s+/i, "");
  }

  // Fix brand leak: Dinosaurs Will Die → evo lists "Will Die Wizard Stick..."
  if (brand === "Dinosaurs Will Die" && /^(?:Will Die|Dinosaurs)\s/i.test(model)) {
    model = model.replace(/^(?:Will Die|Dinosaurs)\s+/i, "");
  }

  // Normalize "T.Rice" → "T. Rice" (Lib Tech website vs retailer naming)
  model = model.replace(/T\.Rice/g, "T. Rice");

  // Strip trailing profile designators (profile is stored as a separate field)
  if (!opts?.keepProfile) {
    model = model.replace(PROFILE_SUFFIX_RE, "");
  }

  // Strip leading "the " (e.g. "the throwback" → "throwback")
  model = model.replace(/^the\s+/i, "");

  // Replace " - " (space-dash-space) with single space (e.g. "hps - goop" → "hps goop")
  model = model.replace(/\s+-\s+/g, " ");

  // Strip acronym-style periods (period between letters, e.g. "D.O.A." → "DOA")
  // Preserves version numbers ("2.0") and name initials ("T. Rice" — single letter + period + space)
  model = model.replace(/\.(?=[a-zA-Z])/g, "");
  // Strip trailing acronym period (letter.space or letter.end) but not single-letter initials
  model = model.replace(/(?<=[a-zA-Z]{2})\.(?=\s|$)/g, "");

  // Replace hyphens with spaces (e.g. "gloss-c" → "gloss c")
  model = model.replace(/-/g, " ");

  // Apply model aliases
  const modelLowerForAlias = model.toLowerCase();
  const MODEL_ALIASES: Record<string, string> = {
    "mega merc": "mega mercury",
    "son of a birdman": "son of birdman",
  };
  // Prefix-based aliases
  const MODEL_PREFIX_ALIASES: [string, string][] = [
    ["sb ", "spring break "],
    ["snowboards ", ""],
  ];
  if (MODEL_ALIASES[modelLowerForAlias]) {
    // Preserve original casing style by using the alias directly
    model = MODEL_ALIASES[modelLowerForAlias];
  } else {
    for (const [prefix, replacement] of MODEL_PREFIX_ALIASES) {
      if (modelLowerForAlias.startsWith(prefix)) {
        model = replacement + model.slice(prefix.length);
        break;
      }
    }
  }

  // Strip rider name prefixes (brand-scoped)
  // Some retailers include the pro rider's name, others don't
  if (brand) {
    const RIDER_NAMES: Record<string, string[]> = {
      "GNU": ["Forest Bailey", "Max Warbington", "Cummins'"],
      "CAPiTA": ["Arthur Longo", "Jess Kimura"],
      "Nitro": ["Hailey Langland", "Marcus Kleveland"],
      "Jones": ["Harry Kearney", "Ruiki Masuda"],
      "Arbor": ["Bryan Iguchi", "Erik Leon", "Jared Elston", "Pat Moore"],
    };
    const riders = RIDER_NAMES[brand];
    if (riders) {
      const mLower = model.toLowerCase();
      for (const rider of riders) {
        const rLower = rider.toLowerCase();
        // Strip "by <rider>" infix (e.g. "Equalizer By Jess Kimura" → "Equalizer")
        const byIdx = mLower.indexOf(" by " + rLower);
        if (byIdx >= 0) {
          model = model.slice(0, byIdx) + model.slice(byIdx + 4 + rider.length);
          break;
        }
        // Strip "<rider> " prefix (e.g. "Forest Bailey Head Space" → "Head Space")
        if (mLower.startsWith(rLower + " ")) {
          model = model.slice(rider.length).trimStart();
          break;
        }
        // Strip " <rider>" suffix (e.g. "Team Pro Marcus Kleveland" → "Team Pro")
        if (mLower.endsWith(" " + rLower)) {
          model = model.slice(0, model.length - rider.length - 1);
          break;
        }
      }
    }

    // Also handle "Signature Series" / "Ltd" infixes after rider name stripping
    // e.g. "Harry Kearney Signature Series Stratos" → "Stratos" (rider stripped above)
    // Remaining: "Signature Series Stratos" → "Stratos"
    model = model.replace(/^(?:Signature Series|Ltd)\s+/i, "");
  }

  // GNU-specific: strip profile letter prefix "C " and suffix " C"
  // GNU uses "C" to denote C3 camber line (e.g. "C Money" = "Money" with C3 profile)
  // Also strip "Asym" (asymmetric sidecut — shape attribute, not model differentiator)
  if (brand === "GNU") {
    model = model.replace(/^C\s+/i, "");
    model = model.replace(/\s+C$/i, "");
    model = model.replace(/^Asym\s+/i, "");
    model = model.replace(/\s+Asym\b/i, "");
  }

  // Clean up leftover dashes, slashes, and whitespace
  model = model.replace(/\/+$/, "");
  model = model.replace(/^\s*[-/]\s*/, "").replace(/\s*[-/]\s*$/, "");
  model = model.replace(/\s{2,}/g, " ").trim();

  return model || raw;
}

/**
 * Extract the profile suffix that normalizeModel() would strip.
 * Returns the lowercased suffix (e.g. "camber", "flying v", "c2") or null.
 */
export function extractProfileSuffix(rawModel: string, brand?: string): string | null {
  if (!rawModel) return null;
  const withProfile = normalizeModel(rawModel, brand, { keepProfile: true });
  const match = withProfile.match(PROFILE_SUFFIX_RE);
  if (!match) return null;
  return match[0].trim().toLowerCase();
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
