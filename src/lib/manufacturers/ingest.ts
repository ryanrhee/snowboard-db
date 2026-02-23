import { ManufacturerSpec } from "./types";
import { getCachedSpecs, setCachedSpecs, CachedSpecs, specKey, setSpecSource } from "../db";
import { normalizeFlex, normalizeProfile, normalizeShape, normalizeCategory, normalizeModel } from "../normalization";
import { canonicalizeBrand } from "../scraping/utils";

export interface IngestStats {
  inserted: number;
  updated: number;
  skipped: number;
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

    // Always store extras in spec_sources, even if we skip the main cache update
    for (const [field, value] of Object.entries(spec.extras)) {
      setSpecSource(key, field, 'manufacturer', value, spec.sourceUrl);
      // Also store "ability level" under the camelCase key used by spec resolution
      if (field === "ability level") {
        setSpecSource(key, "abilityLevel", 'manufacturer', value, spec.sourceUrl);
      }
    }

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

    // Write individual fields to spec_sources for multi-source tracking
    if (cached.flex !== null) setSpecSource(key, 'flex', 'manufacturer', String(cached.flex), spec.sourceUrl);
    if (cached.profile !== null) setSpecSource(key, 'profile', 'manufacturer', cached.profile, spec.sourceUrl);
    if (cached.shape !== null) setSpecSource(key, 'shape', 'manufacturer', cached.shape, spec.sourceUrl);
    if (cached.category !== null) setSpecSource(key, 'category', 'manufacturer', cached.category, spec.sourceUrl);

    if (existing) {
      stats.updated++;
    } else {
      stats.inserted++;
    }
  }

  return stats;
}
