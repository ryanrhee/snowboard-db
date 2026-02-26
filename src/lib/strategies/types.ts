/**
 * All raw scraped data — immutable input to the strategy.
 */
export interface BoardSignal {
  rawModel: string;
  brand: string; // canonical from BrandIdentifier
  manufacturer: string; // "burton" | "mervin" | "default"
  source: string; // "retailer:evo", "manufacturer:gnu"
  sourceUrl: string;
  profile?: string; // raw profile from scraper
  gender?: string;
}

/**
 * Computed output — what the strategy determines.
 */
export interface BoardIdentity {
  model: string; // normalized model (profile stripped)
  profileVariant: string | null; // "camber", "flying v", "c2x", "c3", etc.
}

/**
 * Strategy interface for board identification.
 * Each manufacturer group implements its own normalization and profile logic.
 */
export interface BoardIdentificationStrategy {
  identify(signal: BoardSignal): BoardIdentity;
}
