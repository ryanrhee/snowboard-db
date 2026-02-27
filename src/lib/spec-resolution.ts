import { BoardProfile, BoardShape, BoardCategory, TerrainScores } from "./types";
import { specKey, getSpecSources, SpecSourceEntry } from "./db";
import { normalizeAbilityRange } from "./normalization";
import { terrainToCategory, TERRAIN_KEYS } from "./terrain";
import { profiler } from "./profiler";

// Priority: manufacturer > review-site > retailer
const SOURCE_PRIORITY: Record<string, number> = {
  manufacturer: 4,
  "review-site": 3,
};

function getSourcePriority(source: string): number {
  if (source.startsWith("retailer:")) return 2;
  if (source.startsWith("manufacturer:")) return SOURCE_PRIORITY["manufacturer"];
  return SOURCE_PRIORITY[source] ?? 0;
}

export interface SpecFieldInfo {
  resolved: string | number | null;
  resolvedSource: string;
  agreement: boolean;
  sources: { source: string; value: string; sourceUrl?: string }[];
}

function findConsensus(
  entries: SpecSourceEntry[],
  field: string
): { value: string; sources: string[] } | null {
  // Look for agreement among non-manufacturer sources
  const candidates = entries.filter(
    (e) => e.source !== "manufacturer"
  );
  if (candidates.length < 2) return null;

  // Group by normalized value
  const groups = new Map<string, string[]>();
  for (const c of candidates) {
    const normalized = field === "flex" ? String(Math.round(Number(c.value))) : c.value;
    const existing = groups.get(normalized);
    if (existing) {
      existing.push(c.source);
    } else {
      groups.set(normalized, [c.source]);
    }
  }

  // Find the group with >=2 agreeing sources
  for (const [value, sources] of groups) {
    if (sources.length >= 2) {
      return { value, sources };
    }
  }

  return null;
}

function valuesMatch(a: string, b: string, field: string): boolean {
  if (field === "flex") {
    return Math.round(Number(a)) === Math.round(Number(b));
  }
  return a === b;
}

// Test exports
export { getSourcePriority, findConsensus, valuesMatch };

/** Minimal interface for boards that can be resolved */
interface Resolvable {
  boardKey?: string;
  brand: string;
  model: string;
  year: number | null;
  flex: number | null;
  profile: BoardProfile | string | null;
  shape: BoardShape | string | null;
  category: BoardCategory | string | null;
  terrainScores: TerrainScores;
  abilityLevelMin: string | null;
  abilityLevelMax: string | null;
  gender?: string | null;
}

function resolvableKey(board: Resolvable): string {
  if (board.boardKey) return board.boardKey;
  return specKey(board.brand, board.model, board.gender ?? undefined);
}

export async function resolveSpecSources<T extends Resolvable>(boards: T[]): Promise<T[]> {
  // Group boards by specKey to avoid redundant resolution
  const keyToBoards = new Map<string, T[]>();
  for (const board of boards) {
    const key = resolvableKey(board);
    const group = keyToBoards.get(key);
    if (group) {
      group.push(board);
    } else {
      keyToBoards.set(key, [board]);
    }
  }

  const SPEC_FIELDS = [
    "flex", "profile", "shape", "category", "abilityLevel",
    "terrain_piste", "terrain_powder", "terrain_park", "terrain_freeride", "terrain_freestyle",
  ] as const;

  // Resolve by priority
  profiler.start("resolve:db-read+sort");
  const resolvedMap = new Map<string, Record<string, SpecFieldInfo>>();

  for (const [key, groupBoards] of keyToBoards) {
    const allSources = getSpecSources(key);
    const fieldInfoMap: Record<string, SpecFieldInfo> = {};

    for (const field of SPEC_FIELDS) {
      const entries = allSources[field] || [];
      if (entries.length === 0) {
        fieldInfoMap[field] = {
          resolved: null,
          resolvedSource: "none",
          agreement: true,
          sources: [],
        };
        continue;
      }

      // Sort by priority descending
      const sorted = [...entries].sort(
        (a, b) => getSourcePriority(b.source) - getSourcePriority(a.source)
      );

      const topEntry = sorted[0];
      const allAgree = entries.every((e) => valuesMatch(e.value, topEntry.value, field));

      fieldInfoMap[field] = {
        resolved: topEntry.value,
        resolvedSource: topEntry.source,
        agreement: allAgree,
        sources: entries.map((e) => ({
          source: e.source,
          value: e.value,
          sourceUrl: e.sourceUrl ?? undefined,
        })),
      };
    }

    resolvedMap.set(key, fieldInfoMap);
  }
  profiler.stop("resolve:db-read+sort", { keys: keyToBoards.size });

  // Apply resolved values to boards
  profiler.start("resolve:apply");
  const result = boards.map((board) => {
    const key = resolvableKey(board);
    const fieldInfoMap = resolvedMap.get(key);
    if (!fieldInfoMap) return board;

    const updated = { ...board };

    // Apply resolved flex
    const flexInfo = fieldInfoMap.flex;
    if (flexInfo && flexInfo.resolved !== null) {
      updated.flex = Number(flexInfo.resolved);
    }

    // Apply resolved profile
    const profileInfo = fieldInfoMap.profile;
    if (profileInfo && profileInfo.resolved !== null) {
      updated.profile = profileInfo.resolved as string;
    }

    // Apply resolved shape
    const shapeInfo = fieldInfoMap.shape;
    if (shapeInfo && shapeInfo.resolved !== null) {
      updated.shape = shapeInfo.resolved as string;
    }

    // Apply resolved category
    const categoryInfo = fieldInfoMap.category;
    if (categoryInfo && categoryInfo.resolved !== null) {
      updated.category = categoryInfo.resolved as string;
    }

    // Apply resolved abilityLevel → split into min/max range
    const abilityLevelInfo = fieldInfoMap.abilityLevel;
    if (abilityLevelInfo && abilityLevelInfo.resolved !== null) {
      const range = normalizeAbilityRange(abilityLevelInfo.resolved as string);
      updated.abilityLevelMin = range.min;
      updated.abilityLevelMax = range.max;
    }

    // Apply resolved terrain scores
    const terrainScores: TerrainScores = { ...updated.terrainScores };
    for (const tKey of TERRAIN_KEYS) {
      const fieldName = `terrain_${tKey}` as typeof SPEC_FIELDS[number];
      const info = fieldInfoMap[fieldName];
      if (info && info.resolved !== null) {
        terrainScores[tKey] = Number(info.resolved);
      }
    }
    updated.terrainScores = terrainScores;

    // Derive category from terrain scores if category wasn't resolved directly
    if (!updated.category) {
      const derived = terrainToCategory(updated.terrainScores);
      if (derived) {
        updated.category = derived;
      }
    }

    if ("specSources" in updated) {
      (updated as Record<string, unknown>).specSources = null; // provenance is in spec_sources table, not on the board
    }

    return updated;
  });
  profiler.stop("resolve:apply", { boards: boards.length });
  return result;
}
