import { Region } from "../types";
import { ScraperModule } from "./types";

// Manufacturer scrapers
import { burton } from "../manufacturers/burton";
import { libTech } from "../manufacturers/lib-tech";
import { capita } from "../manufacturers/capita";
import { jones } from "../manufacturers/jones";
import { gnu } from "../manufacturers/gnu";
import { yes } from "../manufacturers/yes";
import { season } from "../manufacturers/season";

// Retailer scrapers
import { tactics } from "../retailers/tactics";
import { evo } from "../retailers/evo";
import { backcountry } from "../retailers/backcountry";
import { rei } from "../retailers/rei";

const ALL_SCRAPERS: ScraperModule[] = [
  // Retailers
  tactics, evo, backcountry, rei,
  // Manufacturers
  burton, libTech, capita, jones, gnu, yes, season,
];

// Scrapers that are actually working (not blocked by Cloudflare/bot protection)
const BLOCKED_SCRAPERS = new Set<string>([]);

export interface GetScrapersOpts {
  regions?: Region[] | null;
  retailers?: string[] | null;
  manufacturers?: string[] | null;
  sites?: string[] | null;
  sourceType?: "retailer" | "manufacturer" | "review-site";
}

/** Get all unified scrapers, filtered by options */
export function getScrapers(opts?: GetScrapersOpts): ScraperModule[] {
  let result = ALL_SCRAPERS.filter((s) => !BLOCKED_SCRAPERS.has(s.name));

  // If sites is provided, filter by exact scraper name
  if (opts?.sites && opts.sites.length > 0) {
    const siteSet = new Set(opts.sites);
    return result.filter((s) => siteSet.has(s.name));
  }

  // Filter by retailers (empty array = skip retailers, null/undefined = include all)
  if (Array.isArray(opts?.retailers)) {
    if (opts!.retailers.length === 0) {
      result = result.filter((s) => s.sourceType !== "retailer");
    } else {
      const names = new Set(opts!.retailers.map((r) => `retailer:${r}`));
      result = result.filter((s) => s.sourceType !== "retailer" || names.has(s.name));
    }
  }

  // Filter by manufacturers (empty array = skip manufacturers, null/undefined = include all)
  if (Array.isArray(opts?.manufacturers)) {
    if (opts!.manufacturers.length === 0) {
      result = result.filter((s) => s.sourceType !== "manufacturer");
    } else {
      const names = new Set(opts!.manufacturers.map((m) => `manufacturer:${m.toLowerCase()}`));
      result = result.filter((s) => s.sourceType !== "manufacturer" || names.has(s.name));
    }
  }

  // Filter by region
  if (opts?.regions && opts.regions.length > 0) {
    const regionSet = new Set(opts.regions);
    result = result.filter((s) => !s.region || regionSet.has(s.region));
  }

  // Filter by sourceType
  if (opts?.sourceType) {
    result = result.filter((s) => s.sourceType === opts.sourceType);
  }

  return result;
}

/** Get all scraper names (including blocked ones) */
export function getAllScraperNames(): string[] {
  return ALL_SCRAPERS.map((s) => s.name);
}

/** Get manufacturer brand names (e.g. ["Burton", "Lib Tech", ...]) */
export function getManufacturerBrands(): string[] {
  return ALL_SCRAPERS
    .filter((s) => s.sourceType === "manufacturer")
    .map((s) => s.name.replace("manufacturer:", ""));
}
