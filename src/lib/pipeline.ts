import { randomUUID } from "crypto";
import {
  ScrapeScope,
  SearchResponse,
  RetailerError,
  Availability,
  Currency,
  Region,
} from "./types";
import { convertToUsd } from "./normalization";
import { calcBeginnerScoreForBoard } from "./scoring";
import {
  insertSearchRun,
  getRunById,
  upsertBoards,
  insertListings,
  getBoardsWithListings,
  getListingsByRunId,
  updateListingPriceAndStock,
} from "./db";
import { fetchPage, parsePrice } from "./scraping/utils";
import { fetchPageWithBrowser } from "./scraping/browser";
import { pruneHttpCache } from "./scraping/http-cache";
import { SEED_BOARDS } from "./seed-data";
import { resolveSpecSources } from "./spec-resolution";
import { getScrapers } from "./scrapers/registry";
import { coalesce } from "./scrapers/coalesce";
import { adaptRetailerOutput } from "./scrapers/adapters";
import { ScrapedBoard } from "./scrapers/types";
import * as cheerio from "cheerio";

const DEFAULT_SCOPE: ScrapeScope = {
  regions: [Region.US, Region.KR],
  skipEnrichment: true,
  skipManufacturers: true,
  skipJudgment: true,
};

export async function runSearchPipeline(
  scope?: Partial<ScrapeScope>
): Promise<SearchResponse> {
  const mergedScope: ScrapeScope = {
    ...DEFAULT_SCOPE,
    ...scope,
  };

  const startTime = Date.now();
  const runId = randomUUID();

  // Get all scrapers (retailers + optionally manufacturers)
  const scrapers = getScrapers({
    regions: mergedScope.regions,
    retailers: mergedScope.retailers,
    manufacturers: mergedScope.manufacturers,
    skipManufacturers: mergedScope.skipManufacturers,
  });

  const errors: RetailerError[] = [];

  // Run all scrapers in parallel
  const results = await Promise.allSettled(
    scrapers.map((scraper) =>
      scraper.scrape(mergedScope).then((boards) => ({
        name: scraper.name,
        boards,
      }))
    )
  );

  // Collect all ScrapedBoards and errors
  const allScrapedBoards: ScrapedBoard[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      allScrapedBoards.push(...result.value.boards);
    } else {
      const scraperName = scrapers[i]?.name || "unknown";
      errors.push({
        retailer: scraperName,
        error: result.reason?.message || String(result.reason),
        timestamp: new Date().toISOString(),
      });
      console.error(`[pipeline] Error from ${scraperName}:`, result.reason);
    }
  }

  const retailerBoardCount = allScrapedBoards.filter(
    (sb) => sb.listings.length > 0
  ).length;
  const listingCount = allScrapedBoards.reduce(
    (s, sb) => s + sb.listings.length,
    0
  );
  console.log(
    `[pipeline] Collected ${allScrapedBoards.length} board models (${listingCount} listings) from ${scrapers.length} scrapers`
  );

  // Fall back to seed data if no retailer boards were scraped
  if (listingCount === 0 && errors.length > 0) {
    console.log("[pipeline] All scrapers failed, using seed data");
    const seedScraped = adaptRetailerOutput(SEED_BOARDS, "seed");
    allScrapedBoards.push(...seedScraped);
    errors.push({
      retailer: "system",
      error:
        "Live scraping failed (bot protection). Using seed data for demo.",
      timestamp: new Date().toISOString(),
    });
  }

  // Coalesce: group by board identity, write spec_sources, build Board + Listing entities
  const { boards, listings } = coalesce(allScrapedBoards, runId);

  // Resolve spec sources: priority-based resolution + disagreement detection
  const resolvedBoards = await resolveSpecSources(boards, { skipJudgment: mergedScope.skipJudgment });

  // Calculate beginner scores now that specs are resolved
  for (const board of resolvedBoards) {
    board.beginnerScore = calcBeginnerScoreForBoard(board);
  }

  // Fill in discount percent for listings that got MSRP from manufacturer
  for (const listing of listings) {
    if (listing.discountPercent === null) {
      const board = resolvedBoards.find(
        (b) => b.boardKey === listing.boardKey
      );
      if (
        board?.msrpUsd &&
        listing.salePriceUsd &&
        board.msrpUsd > listing.salePriceUsd
      ) {
        listing.originalPriceUsd = board.msrpUsd;
        listing.discountPercent = Math.round(
          ((board.msrpUsd - listing.salePriceUsd) / board.msrpUsd) * 100
        );
      }
    }
  }

  // Get retailer names for the search run record
  const retailerNames = scrapers
    .filter((s) => s.sourceType === "retailer")
    .map((s) => s.name.replace("retailer:", ""));

  const durationMs = Date.now() - startTime;
  const run = {
    id: runId,
    timestamp: new Date().toISOString(),
    constraintsJson: JSON.stringify(mergedScope),
    boardCount: resolvedBoards.length,
    retailersQueried: retailerNames.join(","),
    durationMs,
  };

  // Insert search run before listings (listings.run_id FK → search_runs.id)
  insertSearchRun(run);
  upsertBoards(resolvedBoards);
  insertListings(listings);

  pruneHttpCache();

  // Retrieve the board-centric results
  const boardsWithListings = getBoardsWithListings(runId);

  console.log(
    `[pipeline] Search complete: ${resolvedBoards.length} boards, ${listings.length} listings in ${durationMs}ms`
  );

  return {
    run,
    boards: boardsWithListings,
    errors,
  };
}

export async function refreshPipeline(
  runId: string
): Promise<SearchResponse> {
  const run = getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const listings = getListingsByRunId(runId);
  if (listings.length === 0)
    throw new Error(`No listings found for run ${runId}`);

  const errors: RetailerError[] = [];

  for (const listing of listings) {
    try {
      const browserRetailers = new Set(["evo", "backcountry", "rei"]);
      const fetchFn = browserRetailers.has(listing.retailer)
        ? fetchPageWithBrowser
        : fetchPage;
      const html = await fetchFn(listing.url, {
        retries: 1,
        timeoutMs: 10000,
        cacheTtlMs: 0,
      });
      const $ = cheerio.load(html);

      // Try to extract current price
      let currentSalePrice: number | null = null;
      let currentOriginalPrice: number | null = null;
      let availability: string = listing.availability;

      // Check JSON-LD first
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const data = JSON.parse($(el).text());
          if (data["@type"] === "Product") {
            const offer = Array.isArray(data.offers)
              ? data.offers[0]
              : data.offers;
            if (offer?.price) currentSalePrice = parseFloat(offer.price);
            if (offer?.availability) {
              if (offer.availability.includes("InStock"))
                availability = Availability.IN_STOCK;
              else if (offer.availability.includes("OutOfStock"))
                availability = Availability.OUT_OF_STOCK;
            }
          }
        } catch {
          // skip
        }
      });

      // Fallback price from HTML
      if (!currentSalePrice) {
        const priceSelectors = [
          '[class*="sale-price"]',
          '[class*="salePrice"]',
          ".price-sale",
          '[data-testid*="sale-price"]',
        ];
        for (const sel of priceSelectors) {
          const parsed = parsePrice($(sel).first().text());
          if (parsed) {
            currentSalePrice = parsed;
            break;
          }
        }
      }

      if (currentSalePrice) {
        const salePriceUsd = convertToUsd(
          currentSalePrice,
          listing.currency as Currency
        );
        const originalPriceUsd = currentOriginalPrice
          ? convertToUsd(currentOriginalPrice, listing.currency as Currency)
          : listing.originalPriceUsd;
        const discountPercent =
          originalPriceUsd && salePriceUsd && originalPriceUsd > 0
            ? Math.round(
                ((originalPriceUsd - salePriceUsd) / originalPriceUsd) * 100
              )
            : listing.discountPercent;

        updateListingPriceAndStock(listing.id, {
          salePrice: currentSalePrice,
          salePriceUsd,
          originalPrice: currentOriginalPrice,
          originalPriceUsd,
          discountPercent,
          availability,
        });
      }
    } catch (error) {
      console.error(`[refresh] Failed to refresh ${listing.url}:`, error);
      errors.push({
        retailer: listing.retailer,
        error: `Failed to refresh ${listing.url}: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Re-fetch board-centric results with updated prices
  const boardsWithListings = getBoardsWithListings(runId);

  return {
    run,
    boards: boardsWithListings,
    errors,
  };
}
