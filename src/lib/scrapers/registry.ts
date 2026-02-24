import { Region, ScrapeScope } from "../types";
import { RetailerModule } from "../retailers/types";
import { ManufacturerModule } from "../manufacturers/types";
import { ScraperModule, ScrapedBoard } from "./types";
import { adaptRetailerOutput, adaptManufacturerOutput } from "./adapters";

// Import existing registries
import { getRetailers } from "../retailers/registry";
import { getManufacturers } from "../manufacturers/registry";

/** Wrap a RetailerModule as a unified ScraperModule */
function wrapRetailer(retailer: RetailerModule): ScraperModule {
  return {
    name: `retailer:${retailer.name}`,
    sourceType: "retailer",
    baseUrl: retailer.baseUrl,
    region: retailer.region,
    async scrape(scope?: ScrapeScope): Promise<ScrapedBoard[]> {
      const rawBoards = await retailer.searchBoards(scope ?? {});
      return adaptRetailerOutput(rawBoards, retailer.name);
    },
  };
}

/** Wrap a ManufacturerModule as a unified ScraperModule */
function wrapManufacturer(mfr: ManufacturerModule): ScraperModule {
  return {
    name: `manufacturer:${mfr.brand.toLowerCase()}`,
    sourceType: "manufacturer",
    baseUrl: mfr.baseUrl,
    async scrape(): Promise<ScrapedBoard[]> {
      const specs = await mfr.scrapeSpecs();
      return adaptManufacturerOutput(specs, mfr.brand);
    },
  };
}

export interface GetScrapersOpts {
  regions?: Region[] | null;
  retailers?: string[] | null;
  manufacturers?: string[] | null;
  sourceType?: "retailer" | "manufacturer" | "review-site";
}

/** Get all unified scrapers, filtered by options */
export function getScrapers(opts?: GetScrapersOpts): ScraperModule[] {
  const result: ScraperModule[] = [];

  // Wrap retailers (empty array = skip, undefined/null = include all)
  if (!Array.isArray(opts?.retailers) || opts!.retailers.length > 0) {
    const retailers = getRetailers(opts?.regions, opts?.retailers);
    for (const r of retailers) {
      result.push(wrapRetailer(r));
    }
  }

  // Wrap manufacturers (empty array = skip, undefined/null = include all)
  if (!Array.isArray(opts?.manufacturers) || opts!.manufacturers.length > 0) {
    const mfrs = getManufacturers(opts?.manufacturers ?? undefined);
    for (const m of mfrs) {
      result.push(wrapManufacturer(m));
    }
  }

  // Filter by sourceType if specified
  if (opts?.sourceType) {
    return result.filter((s) => s.sourceType === opts.sourceType);
  }

  return result;
}
