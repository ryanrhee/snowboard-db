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
  originalPrice?: number;
  salePrice?: number;
  currency: Currency;
  availability?: string;
  description?: string;
  specs?: Record<string, string>;
  scrapedAt: string; // ISO timestamp
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
  boards: CanonicalBoard[];
  errors: RetailerError[];
}

export interface RetailerError {
  retailer: string;
  error: string;
  timestamp: string;
}
