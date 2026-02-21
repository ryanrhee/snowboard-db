import { generateBoardId } from "./db";
import { config } from "./config";
import {
  RawBoard,
  CanonicalBoard,
  BoardProfile,
  BoardShape,
  BoardCategory,
  Availability,
  Currency,
} from "./types";
import { PROFILE_MAP, SHAPE_MAP, CATEGORY_MAP, CATEGORY_KEYWORDS } from "./normalization-maps";
import { normalizeBrand } from "./scraping/utils";

export function normalizeBoard(raw: RawBoard, runId: string): CanonicalBoard {
  const brand = normalizeBrand(raw.brand || "Unknown");
  const model = raw.model || "Unknown";
  const profile = raw.profile ? normalizeProfile(raw.profile) : null;
  const shape = raw.shape ? normalizeShape(raw.shape) : null;
  const category = normalizeCategory(raw.category, raw.description);
  const flex = raw.flex ? normalizeFlex(raw.flex) : null;
  const year = raw.year || inferYear(model);

  const salePriceUsd = convertToUsd(raw.salePrice || 0, raw.currency);
  const originalPriceUsd = raw.originalPrice
    ? convertToUsd(raw.originalPrice, raw.currency)
    : null;
  const discountPercent =
    originalPriceUsd && salePriceUsd && originalPriceUsd > 0
      ? Math.round(((originalPriceUsd - salePriceUsd) / originalPriceUsd) * 100)
      : null;

  const availability = normalizeAvailability(raw.availability);

  const id = generateBoardId(raw.retailer, raw.url, raw.lengthCm);

  return {
    id,
    runId,
    retailer: raw.retailer,
    region: raw.region,
    url: raw.url,
    imageUrl: raw.imageUrl || null,
    brand,
    model,
    year,
    lengthCm: raw.lengthCm || null,
    widthMm: raw.widthMm || null,
    flex,
    profile,
    shape,
    category,
    originalPriceUsd,
    salePriceUsd,
    discountPercent,
    currency: raw.currency,
    originalPrice: raw.originalPrice || null,
    salePrice: raw.salePrice || 0,
    availability,
    description: raw.description || null,
    beginnerScore: 0,
    valueScore: 0,
    finalScore: 0,
    scoreNotes: null,
    scrapedAt: raw.scrapedAt,
  };
}

export function normalizeProfile(raw: string): BoardProfile | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  // Direct lookup
  if (PROFILE_MAP[lower]) return PROFILE_MAP[lower];

  // Substring matching for compound terms
  for (const [key, value] of Object.entries(PROFILE_MAP)) {
    if (lower.includes(key)) return value;
  }

  // Keyword fallback
  if (lower.includes("rocker") && lower.includes("camber")) {
    return lower.indexOf("rocker") < lower.indexOf("camber")
      ? BoardProfile.HYBRID_ROCKER
      : BoardProfile.HYBRID_CAMBER;
  }
  if (lower.includes("camber")) return BoardProfile.CAMBER;
  if (lower.includes("rocker")) return BoardProfile.ROCKER;
  if (lower.includes("flat")) return BoardProfile.FLAT;

  return null;
}

export function normalizeShape(raw: string): BoardShape | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();

  if (SHAPE_MAP[lower]) return SHAPE_MAP[lower];

  for (const [key, value] of Object.entries(SHAPE_MAP)) {
    if (lower.includes(key)) return value;
  }

  if (lower.includes("twin")) {
    return lower.includes("direct") ? BoardShape.DIRECTIONAL_TWIN : BoardShape.TRUE_TWIN;
  }
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

  // Text-based flex
  const lower = raw.toLowerCase();
  if (lower.includes("very soft") || lower.includes("extra soft")) return 2;
  if (lower.includes("soft")) return 3;
  if (lower.includes("medium-soft") || lower.includes("soft-medium")) return 4;
  if (lower.includes("medium")) return 5;
  if (lower.includes("medium-stiff") || lower.includes("stiff-medium")) return 6;
  if (lower.includes("stiff")) return 7;
  if (lower.includes("very stiff") || lower.includes("extra stiff")) return 9;

  return null;
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
