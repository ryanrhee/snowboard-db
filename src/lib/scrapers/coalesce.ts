import { Board, Listing } from "../types";
import { ScrapedBoard } from "./types";
import {
  specKey,
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
  normalizeModel,
  convertToUsd,
} from "../normalization";
import { canonicalizeBrand } from "../scraping/utils";
import { calcBeginnerScoreForBoard } from "../scoring";
import { categoryToTerrain } from "../terrain";

/**
 * Coalesce all ScrapedBoard[] (from retailers + manufacturers) into
 * Board[] + Listing[] entities, writing spec_sources along the way.
 */
export function coalesce(
  allScrapedBoards: ScrapedBoard[],
  runId: string
): { boards: Board[]; listings: Listing[] } {
  // Group by board identity (specKey = "brand|model")
  const boardGroups = new Map<
    string,
    { scraped: ScrapedBoard[]; brand: string; model: string; rawModels: string[] }
  >();

  for (const sb of allScrapedBoards) {
    const brand = canonicalizeBrand(sb.brand);
    const gender = sb.gender ?? undefined;
    const key = specKey(brand, sb.model, gender);

    if (!boardGroups.has(key)) {
      boardGroups.set(key, {
        scraped: [],
        brand: brand,
        model: normalizeModel(sb.model, brand),
        rawModels: [],
      });
    }
    const group = boardGroups.get(key)!;
    group.scraped.push(sb);
    if (sb.rawModel) group.rawModels.push(sb.rawModel);
  }

  const boards: Board[] = [];
  const listings: Listing[] = [];
  const now = new Date().toISOString();

  for (const [key, group] of boardGroups) {
    // Write specs from each source to spec_sources
    let msrpUsd: number | null = null;
    let manufacturerUrl: string | null = null;
    let description: string | null = null;
    let bestYear: number | null = null;

    for (const sb of group.scraped) {
      const source = sb.source;

      // Normalize and store individual spec fields
      if (sb.flex) {
        const normalizedFlex = normalizeFlex(sb.flex);
        if (normalizedFlex !== null) {
          setSpecSource(key, "flex", source, String(normalizedFlex), sb.sourceUrl);
        }
      }
      if (sb.profile) {
        const normalizedProfile = normalizeProfile(sb.profile);
        if (normalizedProfile !== null) {
          setSpecSource(key, "profile", source, normalizedProfile, sb.sourceUrl);
        }
      }
      if (sb.shape) {
        const normalizedShape = normalizeShape(sb.shape);
        if (normalizedShape !== null) {
          setSpecSource(key, "shape", source, normalizedShape, sb.sourceUrl);
        }
      }
      if (sb.category) {
        const normalizedCategory = normalizeCategory(sb.category, sb.description);
        if (normalizedCategory !== null) {
          setSpecSource(key, "category", source, normalizedCategory, sb.sourceUrl);
        }
      }
      if (sb.abilityLevel) {
        const normalizedAbility = normalizeAbilityLevel(sb.abilityLevel);
        if (normalizedAbility !== null) {
          setSpecSource(key, "abilityLevel", source, normalizedAbility, sb.sourceUrl);
        }
      }

      // Store extras
      for (const [field, value] of Object.entries(sb.extras)) {
        setSpecSource(key, field, source, value, sb.sourceUrl);
        // Also store abilityLevel alias
        if (field === "ability level") {
          const normalizedAbility = normalizeAbilityLevel(value);
          if (normalizedAbility !== null) {
            setSpecSource(key, "abilityLevel", source, normalizedAbility, sb.sourceUrl);
          }
        }
      }

      // Derive terrain scores from category when source doesn't provide terrain_* fields
      const hasTerrainExtras = Object.keys(sb.extras).some(k => k.startsWith("terrain_"));
      if (!hasTerrainExtras) {
        const normalizedCat = normalizeCategory(sb.category ?? undefined, sb.description);
        if (normalizedCat) {
          const terrain = categoryToTerrain(normalizedCat);
          if (terrain.piste !== null) setSpecSource(key, "terrain_piste", source, String(terrain.piste), sb.sourceUrl);
          if (terrain.powder !== null) setSpecSource(key, "terrain_powder", source, String(terrain.powder), sb.sourceUrl);
          if (terrain.park !== null) setSpecSource(key, "terrain_park", source, String(terrain.park), sb.sourceUrl);
          if (terrain.freeride !== null) setSpecSource(key, "terrain_freeride", source, String(terrain.freeride), sb.sourceUrl);
          if (terrain.freestyle !== null) setSpecSource(key, "terrain_freestyle", source, String(terrain.freestyle), sb.sourceUrl);
        }
      }

      // Prefer manufacturer MSRP and URL
      if (sb.source.startsWith("manufacturer:")) {
        if (sb.msrpUsd) msrpUsd = sb.msrpUsd;
        manufacturerUrl = sb.sourceUrl;

        // Update spec_cache for manufacturer sources
        const existing = getCachedSpecs(key);
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
          setCachedSpecs(key, cached);
        }
      }

      if (!description && sb.description) description = sb.description;
      if (sb.year && (!bestYear || sb.year > bestYear)) bestYear = sb.year;

      // Build listings from this source's listings
      for (const sl of sb.listings) {
        const identifier = new BoardIdentifier({
          rawModel: sb.model,
          rawBrand: sb.brand,
          url: sl.url,
          conditionHint: sl.condition,
          genderHint: sl.gender ?? sb.gender,
          yearHint: sb.year,
        });

        const retailerName = sb.source.startsWith("retailer:")
          ? sb.source.slice("retailer:".length)
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
    // Gender is derived from the board_key suffix, not stored separately
    const board: Board = {
      boardKey: key,
      brand: group.brand,
      model: group.model,
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
