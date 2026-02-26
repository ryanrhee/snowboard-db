// ===== Enums =====

export enum BoardProfile {
  CAMBER = "camber",
  ROCKER = "rocker",
  FLAT = "flat",
  HYBRID_CAMBER = "hybrid_camber", // camber-dominant hybrid
  HYBRID_ROCKER = "hybrid_rocker", // rocker-dominant hybrid
}

export enum BoardShape {
  TRUE_TWIN = "true_twin",
  DIRECTIONAL_TWIN = "directional_twin",
  DIRECTIONAL = "directional",
  TAPERED = "tapered",
}

export enum BoardCategory {
  ALL_MOUNTAIN = "all_mountain",
  FREESTYLE = "freestyle",
  FREERIDE = "freeride",
  POWDER = "powder",
  PARK = "park",
}

export enum Region {
  US = "US",
  KR = "KR",
}

export enum Currency {
  USD = "USD",
  KRW = "KRW",
}

export enum Availability {
  IN_STOCK = "in_stock",
  LOW_STOCK = "low_stock",
  OUT_OF_STOCK = "out_of_stock",
  UNKNOWN = "unknown",
}

export enum ListingCondition {
  NEW = "new",
  BLEMISHED = "blemished",
  CLOSEOUT = "closeout",
  USED = "used",
  UNKNOWN = "unknown",
}

export enum GenderTarget {
  WOMENS = "womens",
  KIDS = "kids",
  UNISEX = "unisex",
}

import { BrandIdentifier } from "./strategies/brand-identifier";

// ===== Raw Board (retailer output, messy) =====

export interface RawBoard {
  retailer: string;
  region: Region;
  url: string;
  imageUrl?: string;
  brand?: BrandIdentifier;
  model?: string;
  year?: number;
  lengthCm?: number;
  widthMm?: number;
  flex?: string; // raw flex string e.g. "Soft (3/10)", "Medium", "6"
  profile?: string; // raw profile string e.g. "CamRock", "Flying V"
  shape?: string; // raw shape string e.g. "True Twin", "Directional"
  category?: string; // raw category string
  abilityLevel?: string; // raw ability level string
  originalPrice?: number;
  salePrice?: number;
  currency: Currency;
  availability?: string;
  description?: string;
  specs?: Record<string, string>;
  scrapedAt: string; // ISO timestamp
  condition?: string;
  gender?: string;
  stockCount?: number;
}

// ===== Terrain Scores =====

export interface TerrainScores {
  piste: number | null;
  powder: number | null;
  park: number | null;
  freeride: number | null;
  freestyle: number | null;
}

// ===== Board-centric types (new data model) =====

export interface Board {
  boardKey: string;
  brand: string;
  model: string;
  gender: string;
  year: number | null;
  flex: number | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  terrainScores: TerrainScores;
  abilityLevelMin: string | null;
  abilityLevelMax: string | null;
  msrpUsd: number | null;
  manufacturerUrl: string | null;
  description: string | null;
  beginnerScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  boardKey: string;
  runId: string;
  retailer: string;
  region: string;
  url: string;
  imageUrl: string | null;
  lengthCm: number | null;
  widthMm: number | null;
  currency: string;
  originalPrice: number | null;
  salePrice: number;
  originalPriceUsd: number | null;
  salePriceUsd: number;
  discountPercent: number | null;
  availability: string;
  scrapedAt: string;
  condition: string;
  gender: string;
  stockCount: number | null;
  comboContents: string | null;
}

export interface BoardWithListings extends Board {
  listings: Listing[];
  bestPrice: number;
  valueScore: number;
  finalScore: number;
  specSources?: Record<string, { source: string; value: string; sourceUrl?: string | null }[]>;
}

// ===== Scrape Scope (ingestion-time, no personal filters) =====

export interface ScrapeScope {
  regions?: Region[] | null;
  retailers?: string[] | null;
  manufacturers?: string[] | null;
  sites?: string[] | null;
  extraScrapedBoards?: import("./scrapers/types").ScrapedBoard[];
  from?: "scrape" | "review-sites" | "resolve";
}

// ===== Search Types =====

export interface SearchConstraints {
  minLengthCm?: number | null;
  maxLengthCm?: number | null;
  maxPriceUsd?: number | null;
  minPriceUsd?: number | null;
  preferredProfiles?: BoardProfile[] | null;
  preferredCategories?: BoardCategory[] | null;
  excludeKids?: boolean;
  excludeWomens?: boolean;
  regions?: Region[] | null;
  retailers?: string[] | null;
}

export interface SearchRun {
  id: string;
  timestamp: string;
  constraintsJson: string;
  boardCount: number;
  retailersQueried: string;
  durationMs: number;
}

export interface SearchResponse {
  run: SearchRun;
  boards: BoardWithListings[];
  errors: RetailerError[];
}

export interface RetailerError {
  retailer: string;
  error: string;
  timestamp: string;
}
