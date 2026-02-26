import { RawBoard } from "../types";
import { ScrapedBoard, ScrapedListing } from "./types";

/** Internal intermediate type used by manufacturer scrapers */
export interface ManufacturerSpec {
  brand: string;
  model: string;
  year: number | null;
  flex: string | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  gender?: string;
  msrpUsd: number | null;
  sourceUrl: string;
  extras: Record<string, string>;
  listings?: ScrapedListing[];
}
import { detectGender, extractComboContents } from "../normalization";
import { BrandIdentifier } from "../strategies/brand-identifier";
import { getStrategy } from "../strategies";
import type { BoardSignal } from "../strategies/types";

/**
 * Group RawBoard[] (one per size/listing) from a retailer into ScrapedBoard[]
 * (one per board model, with listings array).
 */
export function adaptRetailerOutput(
  rawBoards: RawBoard[],
  retailerName: string
): ScrapedBoard[] {
  // Group by normalized brand|model to merge size variants
  const groups = new Map<string, { board: Partial<ScrapedBoard>; listings: ScrapedListing[] }>();

  for (const raw of rawBoards) {
    const brandId = raw.brand ?? new BrandIdentifier("Unknown");
    const brand = brandId.canonical;
    const rawModel = raw.model || "Unknown";
    const comboContents = extractComboContents(rawModel);
    const signal: BoardSignal = {
      rawModel,
      brand: brandId.canonical,
      manufacturer: brandId.manufacturer,
      source: `retailer:${retailerName}`,
      sourceUrl: raw.url,
      profile: raw.profile,
      gender: raw.gender,
    };
    const strategy = getStrategy(brandId.manufacturer);
    const identity = strategy.identify(signal);
    const model = identity.model;
    const detectedGender = (raw.gender || detectGender(raw.model || "", raw.url)).toLowerCase();
    const genderSuffix = (detectedGender === "womens" || detectedGender === "kids") ? `|${detectedGender}` : "";
    const groupKey = `${brand.toLowerCase()}|${model.toLowerCase()}${genderSuffix}`;

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        board: {
          source: `retailer:${retailerName}`,
          brandId,
          model,
          rawModel: rawModel,
          year: raw.year ?? undefined,
          sourceUrl: raw.url,
          region: raw.region,
          flex: raw.flex ?? undefined,
          profile: raw.profile ?? undefined,
          shape: raw.shape ?? undefined,
          category: raw.category ?? undefined,
          abilityLevel: raw.abilityLevel ?? undefined,
          gender: detectedGender || undefined,
          description: raw.description ?? undefined,
          extras: raw.specs ?? {},
        },
        listings: [],
      });
    }

    const group = groups.get(groupKey)!;

    // Merge specs from subsequent raw boards if the first one lacked them
    const board = group.board;
    if (!board.flex && raw.flex) board.flex = raw.flex;
    if (!board.profile && raw.profile) board.profile = raw.profile;
    if (!board.shape && raw.shape) board.shape = raw.shape;
    if (!board.category && raw.category) board.category = raw.category;
    if (!board.abilityLevel && raw.abilityLevel) board.abilityLevel = raw.abilityLevel;
    if (!board.description && raw.description) board.description = raw.description;
    if (raw.specs) {
      board.extras = { ...board.extras, ...raw.specs };
    }

    group.listings.push({
      url: raw.url,
      imageUrl: raw.imageUrl,
      lengthCm: raw.lengthCm,
      widthMm: raw.widthMm,
      originalPrice: raw.originalPrice,
      salePrice: raw.salePrice ?? 0,
      currency: raw.currency,
      availability: raw.availability,
      condition: raw.condition,
      stockCount: raw.stockCount,
      scrapedAt: raw.scrapedAt,
      gender: raw.gender,
      comboContents,
    });
  }

  return Array.from(groups.values()).map(({ board, listings }) => ({
    source: board.source!,
    brandId: board.brandId!,
    model: board.model!,
    rawModel: board.rawModel,
    year: board.year,
    sourceUrl: board.sourceUrl!,
    region: board.region,
    flex: board.flex,
    profile: board.profile,
    shape: board.shape,
    category: board.category,
    abilityLevel: board.abilityLevel,
    gender: board.gender,
    description: board.description,
    extras: board.extras ?? {},
    listings,
  }));
}

/**
 * Map ManufacturerSpec[] to ScrapedBoard[] (listings from spec or empty).
 */
export function adaptManufacturerOutput(
  specs: ManufacturerSpec[],
  brand: string
): ScrapedBoard[] {
  return specs.map((spec) => ({
    source: `manufacturer:${brand.toLowerCase()}`,
    brandId: new BrandIdentifier(spec.brand),
    model: spec.model,
    rawModel: spec.model,
    year: spec.year ?? undefined,
    sourceUrl: spec.sourceUrl,
    flex: spec.flex ?? undefined,
    profile: spec.profile ?? undefined,
    shape: spec.shape ?? undefined,
    category: spec.category ?? undefined,
    msrpUsd: spec.msrpUsd ?? undefined,
    gender: spec.gender ?? undefined,
    extras: spec.extras,
    listings: spec.listings ?? [],
  }));
}
