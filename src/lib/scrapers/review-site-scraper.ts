import { ScrapedBoard, ScraperModule } from "./types";
import { tryReviewSiteLookup } from "../review-sites/the-good-ride";
import { delay } from "../scraping/utils";
import { config } from "../config";

/**
 * Create a ScraperModule that looks up review site specs for a list of
 * known board targets (brand + model). Produces ScrapedBoard entries with
 * source "review-site:the-good-ride" and empty listings.
 */
export function createReviewSiteScraper(
  targets: { brand: string; model: string }[]
): ScraperModule {
  return {
    name: "review-site:the-good-ride",
    sourceType: "review-site",
    baseUrl: "https://www.thegoodride.com",

    async scrape(): Promise<ScrapedBoard[]> {
      console.log(
        `[review-site-scraper] Looking up ${targets.length} boards on The Good Ride`
      );

      const boards: ScrapedBoard[] = [];
      let found = 0;
      let missed = 0;

      for (const { brand, model } of targets) {
        const reviewSpec = await tryReviewSiteLookup(brand, model);

        if (!reviewSpec) {
          missed++;
          continue;
        }

        found++;

        boards.push({
          source: "review-site:the-good-ride",
          brand,
          model,
          sourceUrl: reviewSpec.sourceUrl,
          flex: reviewSpec.flex ?? undefined,
          profile: reviewSpec.profile ?? undefined,
          shape: reviewSpec.shape ?? undefined,
          category: reviewSpec.category ?? undefined,
          abilityLevel: reviewSpec.abilityLevel ?? undefined,
          msrpUsd: reviewSpec.msrpUsd ?? undefined,
          extras: reviewSpec.extras,
          listings: [],
        });

        await delay(config.scrapeDelayMs);
      }

      console.log(
        `[review-site-scraper] Done: ${found} matched, ${missed} not found`
      );
      return boards;
    },
  };
}
