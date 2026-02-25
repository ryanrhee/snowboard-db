import { ManufacturerSpec } from "./types";
import { getCachedSpecs, setCachedSpecs, CachedSpecs, specKey, setSpecSource, upsertBoard } from "../db";
import { normalizeFlex, normalizeProfile, normalizeShape, normalizeCategory, normalizeModel } from "../normalization";
import { canonicalizeBrand } from "../scraping/utils";
import { Board } from "../types";
import { calcBeginnerScoreForBoard } from "../scoring";
import { TERRAIN_KEYS } from "../terrain";

export interface IngestStats {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Ingest manufacturer specs into spec_cache and boards table.
 * Manufacturer data overwrites LLM data but not other manufacturer data.
 */
export function ingestManufacturerSpecs(specs: ManufacturerSpec[]): IngestStats {
  const stats: IngestStats = { inserted: 0, updated: 0, skipped: 0 };

  for (const spec of specs) {
    const brand = canonicalizeBrand(spec.brand);
    const key = specKey(brand, spec.model, spec.gender);

    const existing = getCachedSpecs(key);

    // Always store extras in spec_sources, even if we skip the main cache update
    for (const [field, value] of Object.entries(spec.extras)) {
      setSpecSource(key, field, 'manufacturer', value, spec.sourceUrl);
      // Also store "ability level" under the camelCase key used by spec resolution
      if (field === "ability level") {
        setSpecSource(key, "abilityLevel", 'manufacturer', value, spec.sourceUrl);
      }
    }

    // Don't overwrite existing manufacturer data, but still update individual
    // spec_sources fields that may be newly available (e.g. flex from detail pages)
    if (existing && existing.source === "manufacturer") {
      const nFlex = spec.flex ? normalizeFlex(spec.flex) : null;
      const nProfile = spec.profile ? normalizeProfile(spec.profile) : null;
      const nShape = spec.shape ? normalizeShape(spec.shape) : null;
      const nCategory = normalizeCategory(spec.category ?? undefined, null);
      if (nFlex !== null) setSpecSource(key, 'flex', 'manufacturer', String(nFlex), spec.sourceUrl);
      if (nProfile !== null) setSpecSource(key, 'profile', 'manufacturer', nProfile, spec.sourceUrl);
      if (nShape !== null) setSpecSource(key, 'shape', 'manufacturer', nShape, spec.sourceUrl);
      if (nCategory !== null) setSpecSource(key, 'category', 'manufacturer', nCategory, spec.sourceUrl);
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

    // Also upsert into boards table
    const now = new Date().toISOString();
    // Extract terrain scores from extras
    const terrainScores = {
      piste: spec.extras["terrain_piste"] ? Number(spec.extras["terrain_piste"]) : null,
      powder: spec.extras["terrain_powder"] ? Number(spec.extras["terrain_powder"]) : null,
      park: spec.extras["terrain_park"] ? Number(spec.extras["terrain_park"]) : null,
      freeride: spec.extras["terrain_freeride"] ? Number(spec.extras["terrain_freeride"]) : null,
      freestyle: spec.extras["terrain_freestyle"] ? Number(spec.extras["terrain_freestyle"]) : null,
    };
    const board: Board = {
      boardKey: key,
      brand,
      model: normalizeModel(spec.model, brand),
      year: spec.year,
      flex: cached.flex,
      profile: cached.profile,
      shape: cached.shape,
      category: cached.category,
      terrainScores,
      abilityLevelMin: null,
      abilityLevelMax: null,
      msrpUsd: spec.msrpUsd,
      manufacturerUrl: spec.sourceUrl,
      description: null,
      beginnerScore: 0,
      createdAt: now,
      updatedAt: now,
    };
    board.beginnerScore = calcBeginnerScoreForBoard(board);
    upsertBoard(board);

    if (existing) {
      stats.updated++;
    } else {
      stats.inserted++;
    }
  }

  return stats;
}
