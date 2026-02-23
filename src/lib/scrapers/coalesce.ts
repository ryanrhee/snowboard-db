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
  convertToUsd,
} from "../normalization";
import { canonicalizeBrand } from "../scraping/utils";
import { calcBeginnerScoreForBoard } from "../scoring";

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
    { scraped: ScrapedBoard[]; brand: string; model: string }
  >();

  for (const sb of allScrapedBoards) {
    const brand = canonicalizeBrand(sb.brand);
    const key = specKey(brand, sb.model);

    if (!boardGroups.has(key)) {
      // Use the normalized brand/model from specKey for consistent identity
      const parts = key.split("|");
      boardGroups.set(key, {
        scraped: [],
        brand: brand,
        model: parts.slice(1).join("|"), // model portion from specKey
      });
    }
    boardGroups.get(key)!.scraped.push(sb);
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
        });

        // Use year from identifier if not already set
        if (!bestYear && identifier.year) bestYear = identifier.year;
      }
    }

    // Resolve board gender from listings
    const boardListings = listings.filter((l) => l.boardKey === key);
    const genders = new Set(boardListings.map((l) => l.gender));
    const boardGender =
      boardListings.length > 0
        ? genders.size === 1
          ? [...genders][0]
          : "unisex"
        : // For manufacturer-only boards with no listings, use the scraped gender
          group.scraped.find((sb) => sb.gender)?.gender ?? "unisex";

    // Build the Board entity — specs are left null here, filled by resolveSpecSources
    const board: Board = {
      boardKey: key,
      brand: group.brand,
      model: group.model,
      year: bestYear,
      flex: null,
      profile: null,
      shape: null,
      category: null,
      abilityLevelMin: null,
      abilityLevelMax: null,
      msrpUsd,
      manufacturerUrl,
      description,
      beginnerScore: 0,
      gender: boardGender,
      createdAt: now,
      updatedAt: now,
    };

    boards.push(board);
  }

  return { boards, listings };
}
