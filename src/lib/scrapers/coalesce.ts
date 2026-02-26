import { Board, Listing } from "../types";
import { ScrapedBoard } from "./types";
import {
  specKey,
  genderFromKey,
  setSpecSource,
  generateListingId,
  setCachedSpecs,
  getCachedSpecs,
  CachedSpecs,
} from "../db";
import { BoardIdentifier } from "../board-identifier";
import {
  normalizeFlex,
  normalizeProfile,
  normalizeShape,
  normalizeCategory,
  normalizeAbilityLevel,
  convertToUsd,
} from "../normalization";
import { getStrategy } from "../strategies";
import type { BoardSignal } from "../strategies/types";
import { calcBeginnerScoreForBoard } from "../scoring";
import { categoryToTerrain } from "../terrain";

export type BoardGroup = {
  scraped: ScrapedBoard[];
  brand: string;
  model: string;
  rawModels: string[];
};

/**
 * Identify unique boards from scraped data: group by board identity (specKey),
 * then split profile variants that were collapsed into the same key.
 *
 * Returns a Map of board key → BoardGroup (with brand, model, and scraped entries).
 */
export function identifyBoards(
  allScrapedBoards: ScrapedBoard[]
): Map<string, BoardGroup> {
  const boardGroups = new Map<string, BoardGroup>();

  // Phase 1: identify each board via strategy, collecting profile variants
  interface AnnotatedBoard {
    sb: ScrapedBoard;
    brand: string;
    model: string;
    profileVariant: string | null;
    key: string;
  }

  const annotated: AnnotatedBoard[] = [];

  for (const sb of allScrapedBoards) {
    const brandId = sb.brandId;
    const brand = brandId.canonical;
    const gender = sb.gender ?? undefined;

    const signal: BoardSignal = {
      rawModel: sb.rawModel ?? sb.model,
      brand,
      manufacturer: brandId.manufacturer,
      source: sb.source,
      sourceUrl: sb.sourceUrl,
      profile: sb.profile,
      gender: sb.gender,
    };
    const strategy = getStrategy(brandId.manufacturer);
    const identity = strategy.identify(signal);

    const key = specKey(brand, identity.model, gender, brandId.manufacturer);

    annotated.push({
      sb,
      brand,
      model: identity.model,
      profileVariant: identity.profileVariant,
      key,
    });
  }

  // Phase 2: group by key (brand|model|gender)
  const groupedAnnotated = new Map<string, AnnotatedBoard[]>();
  for (const a of annotated) {
    if (!groupedAnnotated.has(a.key)) groupedAnnotated.set(a.key, []);
    groupedAnnotated.get(a.key)!.push(a);
  }

  // Phase 3: split profile variants within each group
  for (const [key, entries] of groupedAnnotated) {
    // Collect distinct profile variants
    const variants = new Set<string | null>();
    for (const e of entries) {
      variants.add(e.profileVariant);
    }

    // Check if there are multiple DISTINCT non-null variants
    const nonNullVariants = new Set([...variants].filter(v => v !== null));

    if (nonNullVariants.size <= 1) {
      // No splitting needed — single variant or all null
      const model = entries[0].model;
      const brand = entries[0].brand;
      boardGroups.set(key, {
        scraped: entries.map(e => e.sb),
        brand,
        model,
        rawModels: entries.map(e => e.sb.rawModel).filter(Boolean) as string[],
      });
      continue;
    }

    // Multiple variants — split into separate groups
    // Build a profile value → variant lookup from entries that have profile specs
    const profileToVariant = new Map<string, string>();
    for (const e of entries) {
      if (e.profileVariant && e.sb.profile) {
        const normalizedProfile = normalizeProfile(e.sb.profile);
        if (normalizedProfile) {
          profileToVariant.set(normalizedProfile, e.profileVariant);
        }
      }
    }

    // Determine default variant: pick the most common non-null variant, or first
    const variantCounts = new Map<string, number>();
    for (const e of entries) {
      if (e.profileVariant) {
        variantCounts.set(e.profileVariant, (variantCounts.get(e.profileVariant) || 0) + 1);
      }
    }
    // Default for unresolved entries: use first variant alphabetically as fallback
    const sortedVariants = [...nonNullVariants].sort();
    const defaultVariant = sortedVariants[0];

    for (const e of entries) {
      let variant = e.profileVariant;

      // If no variant, try matching via profile spec
      if (!variant && e.sb.profile) {
        const normalizedProfile = normalizeProfile(e.sb.profile);
        if (normalizedProfile && profileToVariant.has(normalizedProfile)) {
          variant = profileToVariant.get(normalizedProfile)!;
        }
      }

      // Last resort: use default variant
      if (!variant) {
        variant = defaultVariant;
      }

      const variantModel = `${e.model} ${variant.replace(/\b\w/g, c => c.toUpperCase())}`;
      const keyParts = key.split("|");
      const variantKey = `${keyParts[0]}|${variantModel.toLowerCase()}|${keyParts[keyParts.length - 1]}`;

      if (!boardGroups.has(variantKey)) {
        boardGroups.set(variantKey, {
          scraped: [],
          brand: e.brand,
          model: variantModel,
          rawModels: [],
        });
      }
      const variantGroup = boardGroups.get(variantKey)!;
      variantGroup.scraped.push(e.sb);
      if (e.sb.rawModel) variantGroup.rawModels.push(e.sb.rawModel);
    }
  }

  return boardGroups;
}

/**
 * Write spec fields from scraped boards into the spec_sources table.
 * Returns aggregated MSRP and description from the sources.
 *
 * Extracted so that the `from: "review-sites"` pipeline path can write
 * review-site specs without re-running the full coalesce.
 */
export function writeSpecSources(
  boardKey: string,
  scrapedBoards: ScrapedBoard[]
): { msrpUsd: number | null; description: string | null } {
  let msrpUsd: number | null = null;
  let description: string | null = null;

  for (const sb of scrapedBoards) {
    const source = sb.source;

    // Normalize and store individual spec fields
    if (sb.flex) {
      const normalizedFlex = normalizeFlex(sb.flex);
      if (normalizedFlex !== null) {
        setSpecSource(boardKey, "flex", source, String(normalizedFlex), sb.sourceUrl);
      }
    }
    if (sb.profile) {
      const normalizedProfile = normalizeProfile(sb.profile);
      if (normalizedProfile !== null) {
        setSpecSource(boardKey, "profile", source, normalizedProfile, sb.sourceUrl);
      }
    }
    if (sb.shape) {
      const normalizedShape = normalizeShape(sb.shape);
      if (normalizedShape !== null) {
        setSpecSource(boardKey, "shape", source, normalizedShape, sb.sourceUrl);
      }
    }
    if (sb.category) {
      const normalizedCategory = normalizeCategory(sb.category, sb.description);
      if (normalizedCategory !== null) {
        setSpecSource(boardKey, "category", source, normalizedCategory, sb.sourceUrl);
      }
    }
    if (sb.abilityLevel) {
      const normalizedAbility = normalizeAbilityLevel(sb.abilityLevel);
      if (normalizedAbility !== null) {
        setSpecSource(boardKey, "abilityLevel", source, normalizedAbility, sb.sourceUrl);
      }
    }

    // Store extras
    for (const [field, value] of Object.entries(sb.extras)) {
      setSpecSource(boardKey, field, source, value, sb.sourceUrl);
      // Also store abilityLevel alias
      if (field === "ability level") {
        const normalizedAbility = normalizeAbilityLevel(value);
        if (normalizedAbility !== null) {
          setSpecSource(boardKey, "abilityLevel", source, normalizedAbility, sb.sourceUrl);
        }
      }
    }

    // Derive terrain scores from category when source doesn't provide terrain_* fields
    const hasTerrainExtras = Object.keys(sb.extras).some(k => k.startsWith("terrain_"));
    if (!hasTerrainExtras) {
      const normalizedCat = normalizeCategory(sb.category ?? undefined, sb.description);
      if (normalizedCat) {
        const terrain = categoryToTerrain(normalizedCat);
        if (terrain.piste !== null) setSpecSource(boardKey, "terrain_piste", source, String(terrain.piste), sb.sourceUrl);
        if (terrain.powder !== null) setSpecSource(boardKey, "terrain_powder", source, String(terrain.powder), sb.sourceUrl);
        if (terrain.park !== null) setSpecSource(boardKey, "terrain_park", source, String(terrain.park), sb.sourceUrl);
        if (terrain.freeride !== null) setSpecSource(boardKey, "terrain_freeride", source, String(terrain.freeride), sb.sourceUrl);
        if (terrain.freestyle !== null) setSpecSource(boardKey, "terrain_freestyle", source, String(terrain.freestyle), sb.sourceUrl);
      }
    }

    // Prefer manufacturer MSRP
    if (sb.source.startsWith("manufacturer:")) {
      if (sb.msrpUsd) msrpUsd = sb.msrpUsd;

      // Update spec_cache for manufacturer sources
      const existing = getCachedSpecs(boardKey);
      if (!existing || existing.source !== "manufacturer") {
        const cached: CachedSpecs = {
          flex: sb.flex ? normalizeFlex(sb.flex) : null,
          profile: sb.profile ? normalizeProfile(sb.profile) : null,
          shape: sb.shape ? normalizeShape(sb.shape) : null,
          category: normalizeCategory(sb.category ?? undefined, sb.description),
          msrpUsd: sb.msrpUsd ?? null,
          source: "manufacturer",
          sourceUrl: sb.sourceUrl,
        };
        setCachedSpecs(boardKey, cached);
      }
    }

    if (!description && sb.description) description = sb.description;
  }

  return { msrpUsd, description };
}

/**
 * Coalesce all ScrapedBoard[] (from retailers + manufacturers + review sites)
 * into Board[] + Listing[] entities, writing spec_sources along the way.
 */
export function coalesce(
  allScrapedBoards: ScrapedBoard[],
  runId: string
): { boards: Board[]; listings: Listing[] } {
  const boardGroups = identifyBoards(allScrapedBoards);

  const boards: Board[] = [];
  const listings: Listing[] = [];
  const now = new Date().toISOString();

  for (const [key, group] of boardGroups) {
    // Write specs from each source to spec_sources
    const { msrpUsd, description } = writeSpecSources(key, group.scraped);

    let manufacturerUrl: string | null = null;
    let bestYear: number | null = null;

    for (const sb of group.scraped) {
      // Prefer manufacturer URL
      if (sb.source.startsWith("manufacturer:")) {
        manufacturerUrl = sb.sourceUrl;
      }

      if (sb.year && (!bestYear || sb.year > bestYear)) bestYear = sb.year;

      // Build listings from this source's listings
      for (const sl of sb.listings) {
        const identifier = new BoardIdentifier({
          rawModel: sb.model,
          rawBrand: sb.brandId.canonical,
          brandId: sb.brandId,
          url: sl.url,
          conditionHint: sl.condition,
          genderHint: sl.gender ?? sb.gender,
          yearHint: sb.year,
        });

        const retailerName = sb.source.startsWith("retailer:")
          ? sb.source.slice("retailer:".length)
          : sb.source.startsWith("manufacturer:")
            ? sb.source.slice("manufacturer:".length)
            : sb.source;

        const salePriceUsd = convertToUsd(sl.salePrice, sl.currency);
        const originalPriceUsd = sl.originalPrice
          ? convertToUsd(sl.originalPrice, sl.currency)
          : null;
        const discountPercent =
          originalPriceUsd && salePriceUsd && originalPriceUsd > salePriceUsd
            ? Math.round(
                ((originalPriceUsd - salePriceUsd) / originalPriceUsd) * 100
              )
            : null;

        // Detect availability
        let availability = sl.availability ?? "unknown";
        const lower = availability.toLowerCase();
        if (
          lower.includes("in_stock") ||
          lower.includes("in stock") ||
          lower.includes("instock")
        )
          availability = "in_stock";
        else if (lower.includes("low") || lower.includes("limited"))
          availability = "low_stock";
        else if (lower.includes("out") || lower.includes("sold"))
          availability = "out_of_stock";

        listings.push({
          id: generateListingId(retailerName, sl.url, sl.lengthCm),
          boardKey: key,
          runId,
          retailer: retailerName,
          region: sb.region ?? "US",
          url: sl.url,
          imageUrl: sl.imageUrl ?? null,
          lengthCm: sl.lengthCm ?? null,
          widthMm: sl.widthMm ?? null,
          currency: sl.currency,
          originalPrice: sl.originalPrice ?? null,
          salePrice: sl.salePrice,
          originalPriceUsd,
          salePriceUsd,
          discountPercent,
          availability,
          scrapedAt: sl.scrapedAt,
          condition: identifier.condition,
          gender: identifier.gender,
          stockCount: sl.stockCount ?? null,
          comboContents: sl.comboContents ?? null,
        });

        // Use year from identifier if not already set
        if (!bestYear && identifier.year) bestYear = identifier.year;
      }
    }

    // Build the Board entity — specs are left null here, filled by resolveSpecSources
    const board: Board = {
      boardKey: key,
      brand: group.brand,
      model: group.model,
      gender: genderFromKey(key),
      year: bestYear,
      flex: null,
      profile: null,
      shape: null,
      category: null,
      terrainScores: { piste: null, powder: null, park: null, freeride: null, freestyle: null },
      abilityLevelMin: null,
      abilityLevelMax: null,
      msrpUsd,
      manufacturerUrl,
      description,
      beginnerScore: 0,
      createdAt: now,
      updatedAt: now,
    };

    boards.push(board);
  }

  return { boards, listings };
}
