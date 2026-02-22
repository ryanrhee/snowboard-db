import { ManufacturerSpec } from "./types";
import { getCachedSpecs, setCachedSpecs, CachedSpecs } from "../db";
import { normalizeFlex, normalizeProfile, normalizeShape, normalizeCategory, normalizeModel } from "../normalization";
import { canonicalizeBrand } from "../scraping/utils";

export interface IngestStats {
  inserted: number;
  updated: number;
  skipped: number;
}

function specKey(brand: string, model: string): string {
  return `${brand.toLowerCase()}|${normalizeModel(model, brand).toLowerCase()}`;
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
