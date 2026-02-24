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
  MENS = "mens",
  WOMENS = "womens",
  KIDS = "kids",
  UNISEX = "unisex",
}

// ===== Raw Board (retailer output, messy) =====

export interface RawBoard {
  retailer: string;
  region: Region;
  url: string;
  imageUrl?: string;
  brand?: string;
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

// ===== Canonical Board (normalized, scored, DB-ready) =====

export interface CanonicalBoard {
  id: string; // SHA-256 hash of retailer + url + lengthCm
  runId: string;
  retailer: string;
  region: Region;
  url: string;
  imageUrl: string | null;
  brand: string;
  model: string;
  year: number | null;
  lengthCm: number | null;
  widthMm: number | null;
  flex: number | null; // normalized 1-10
  profile: BoardProfile | null;
  shape: BoardShape | null;
  category: BoardCategory | null;
  abilityLevelMin: string | null;
  abilityLevelMax: string | null;
  extras: Record<string, string>;
  originalPriceUsd: number | null;
  salePriceUsd: number;
  discountPercent: number | null;
  currency: Currency;
  originalPrice: number | null; // in original currency
  salePrice: number; // in original currency
  availability: Availability;
  description: string | null;
  beginnerScore: number; // 0-1
  valueScore: number; // 0-1
  finalScore: number; // 0-1
  scoreNotes: string | null; // human-readable scoring explanation
  scrapedAt: string;
  specSources: string | null; // JSON: Record<string, SpecFieldInfo>
  condition: ListingCondition;
  gender: GenderTarget;
  stockCount: number | null;
}

// ===== Board-centric types (new data model) =====

export interface Board {
  boardKey: string;
  brand: string;
  model: string;
  year: number | null;
  flex: number | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  abilityLevelMin: string | null;
  abilityLevelMax: string | null;
  msrpUsd: number | null;
  manufacturerUrl: string | null;
  description: string | null;
  beginnerScore: number;
  gender: string | null;
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
  skipEnrichment?: boolean;
  skipManufacturers?: boolean;
  skipJudgment?: boolean;
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
  skipEnrichment?: boolean;
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
