import { ManufacturerSpec } from "./types";
import { getCachedSpecs, setCachedSpecs, CachedSpecs } from "../db";
import { normalizeFlex, normalizeProfile, normalizeShape, normalizeCategory } from "../normalization";
import { canonicalizeBrand } from "../scraping/utils";

export interface IngestStats {
  inserted: number;
  updated: number;
  skipped: number;
}

function specKey(brand: string, model: string): string {
  return `${brand.toLowerCase()}|${cleanModelForKey(model)}`;
}

/**
 * Strip "Snowboard", year, profile suffixes, leading brand, trailing dashes etc.
 * from model name so manufacturer and retailer keys align.
 */
function cleanModelForKey(model: string): string {
  return model
    .toLowerCase()
    .replace(/\bsnowboard\b/gi, "")
    .replace(/\b20[1-2]\d\b/g, "")
    .replace(/\bmen'?s\b/gi, "")
    .replace(/\bwomen'?s\b/gi, "")
    // Strip profile terms that retailers sometimes append
    .replace(/\b(?:camber|rocker|flat|c2x?|c3|btx)\b/gi, "")
    // "Flat Top" → "top" after stripping "flat" — clean up the orphan
    .replace(/\b(?:top)\b/gi, "")
    // Normalize abbreviation dots: "t. rice" -> "t.rice"
    .replace(/(\w)\.\s+/g, "$1.")
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ingest manufacturer specs into spec_cache.
 * Manufacturer data overwrites LLM data but not other manufacturer data.
 */
export function ingestManufacturerSpecs(specs: ManufacturerSpec[]): IngestStats {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0 };

  for (const spec of specs) {
    const brand = canonicalizeBrand(spec.brand);
    const key = specKey(brand, spec.model);

    const existing = getCachedSpecs(key);

    // Don't overwrite existing manufacturer data
    if (existing && existing.source === "manufacturer") {
      stats.skipped++;
      continue;
    }

    const cached: CachedSpecs = {
      flex: spec.flex ? normalizeFlex(spec.flex) : null,
      profile: spec.profile ? normalizeProfile(spec.profile) : null,
      shape: spec.shape ? normalizeShape(spec.shape) : null,
      category: normalizeCategory(spec.category ?? undefined, null),
      msrpUsd: spec.msrpUsd,
      source: "manufacturer",
      sourceUrl: spec.sourceUrl,
    };

    setCachedSpecs(key, cached);

    if (existing) {
      stats.updated++;
    } else {
      stats.inserted++;
    }
  }

  return stats;
}
