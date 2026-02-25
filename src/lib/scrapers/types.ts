import { Currency, Region, ScrapeScope } from "../types";

/** One size/price variant from a retailer listing */
export interface ScrapedListing {
  url: string;
  imageUrl?: string;
  lengthCm?: number;
  widthMm?: number;
  originalPrice?: number;
  salePrice: number;
  currency: Currency;
  availability?: string;
  condition?: string;
  stockCount?: number;
  scrapedAt: string;
  gender?: string;
  comboContents?: string | null;
}

/** Unified scraper output — one per board model per source */
export interface ScrapedBoard {
  source: string; // "retailer:tactics", "manufacturer:burton"
  brand: string;
  model: string;
  rawModel?: string;
  year?: number;
  sourceUrl: string;
  region?: Region;
  // Specs (raw strings, normalized by coalescence)
  flex?: string;
  profile?: string;
  shape?: string;
  category?: string;
  abilityLevel?: string;
  gender?: string;
  description?: string;
  msrpUsd?: number;
  extras: Record<string, string>;
  // Listings (empty for non-retailers)
  listings: ScrapedListing[];
}

/** Unified scraper module interface */
export interface ScraperModule {
  name: string;
  sourceType: "retailer" | "manufacturer" | "review-site";
  baseUrl: string;
  region?: Region;
  scrape(scope?: ScrapeScope): Promise<ScrapedBoard[]>;
}
