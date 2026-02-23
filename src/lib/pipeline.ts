import { randomUUID } from "crypto";
import {
  ScrapeScope,
  SearchResponse,
  RetailerError,
  CanonicalBoard,
  Board,
  Listing,
  BoardWithListings,
  Availability,
  Currency,
  Region,
} from "./types";
import { getRetailers } from "./retailers/registry";
import { normalizeBoard, convertToUsd } from "./normalization";
import { scoreBoard, calcValueScore, calcFinalScore, calcBeginnerScoreForBoard } from "./scoring";
import {
  insertSearchRun,
  getRunById,
  specKey,
  setSpecSource,
  upsertBoards,
  insertListings,
  getBoardsWithListings,
  getListingsByRunId,
  updateListingPriceAndStock,
  getBoardByKey,
  generateListingId,
} from "./db";
import { fetchPage, parsePrice } from "./scraping/utils";
import { fetchPageWithBrowser } from "./scraping/browser";
import { pruneHttpCache } from "./scraping/http-cache";
import { SEED_BOARDS } from "./seed-data";
import { enrichBoardSpecs } from "./llm/enrich";
import { resolveSpecSources } from "./spec-resolution";
import * as cheerio from "cheerio";

function saveRetailerSpecs(boards: CanonicalBoard[]): void {
  for (const board of boards) {
    const key = specKey(board.brand, board.model);
    const source = `retailer:${board.retailer}`;
    if (board.flex !== null) setSpecSource(key, "flex", source, String(board.flex), board.url);
    if (board.profile !== null) setSpecSource(key, "profile", source, board.profile, board.url);
    if (board.shape !== null) setSpecSource(key, "shape", source, board.shape, board.url);
    if (board.category !== null) setSpecSource(key, "category", source, board.category, board.url);
    if (board.abilityLevelMin !== null) {
      const abilityStr = board.abilityLevelMin === board.abilityLevelMax
        ? board.abilityLevelMin
        : `${board.abilityLevelMin}-${board.abilityLevelMax}`;
      setSpecSource(key, "abilityLevel", source, abilityStr, board.url);
    }

    // Store all extra fields
    for (const [field, value] of Object.entries(board.extras)) {
      setSpecSource(key, field, source, value, board.url);
    }
  }
}

function splitIntoBoardsAndListings(
  canonicalBoards: CanonicalBoard[],
  runId: string
): { boards: Board[]; listings: Listing[] } {
  const boardMap = new Map<string, Board>();
  const listings: Listing[] = [];
  const now = new Date().toISOString();

  for (const cb of canonicalBoards) {
    const key = specKey(cb.brand, cb.model);

    if (!boardMap.has(key)) {
      const board: Board = {
        boardKey: key,
        brand: cb.brand,
        model: cb.model,
        year: cb.year,
        flex: cb.flex,
        profile: cb.profile,
        shape: cb.shape,
        category: cb.category,
        abilityLevelMin: cb.abilityLevelMin,
        abilityLevelMax: cb.abilityLevelMax,
        msrpUsd: cb.originalPriceUsd,
        manufacturerUrl: null,
        description: cb.description,
        beginnerScore: 0,
        gender: cb.gender,
        createdAt: now,
        updatedAt: now,
      };
      board.beginnerScore = calcBeginnerScoreForBoard(board);
      boardMap.set(key, board);
    }

    listings.push({
      id: generateListingId(cb.retailer, cb.url, cb.lengthCm),
      boardKey: key,
      runId,
      retailer: cb.retailer,
      region: cb.region,
      url: cb.url,
      imageUrl: cb.imageUrl,
      lengthCm: cb.lengthCm,
      widthMm: cb.widthMm,
      currency: cb.currency,
      originalPrice: cb.originalPrice,
      salePrice: cb.salePrice,
      originalPriceUsd: cb.originalPriceUsd,
      salePriceUsd: cb.salePriceUsd,
      discountPercent: cb.discountPercent,
      availability: cb.availability,
      scrapedAt: cb.scrapedAt,
      condition: cb.condition,
      gender: cb.gender,
      stockCount: cb.stockCount,
    });
  }

  // Resolve board gender across all listings for each board
  for (const [key, board] of boardMap) {
    const boardListings = listings.filter(l => l.boardKey === key);
    const genders = new Set(boardListings.map(l => l.gender));
    board.gender = genders.size === 1 ? [...genders][0] : "unisex";
  }

  return { boards: Array.from(boardMap.values()), listings };
}

const DEFAULT_SCOPE: ScrapeScope = {
  regions: [Region.US, Region.KR],
  skipEnrichment: true,
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

  // Get relevant retailers
  const retailers = getRetailers(mergedScope.regions, mergedScope.retailers);
  const errors: RetailerError[] = [];

  // Query all retailers in parallel
  const results = await Promise.allSettled(
    retailers.map((retailer) =>
      retailer.searchBoards(mergedScope).then((boards) => ({
        retailer: retailer.name,
        boards,
      }))
    )
  );

  // Collect raw boards and errors
  const allRawBoards = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allRawBoards.push(...result.value.boards);
    } else {
      const retailerName =
        retailers[results.indexOf(result)]?.name || "unknown";
      errors.push({
        retailer: retailerName,
        error: result.reason?.message || String(result.reason),
        timestamp: new Date().toISOString(),
      });
      console.error(`[pipeline] Error from ${retailerName}:`, result.reason);
    }
  }

  console.log(
    `[pipeline] Collected ${allRawBoards.length} raw boards from ${retailers.length} retailers`
  );

  // Fall back to seed data if no boards were scraped
  if (allRawBoards.length === 0 && errors.length > 0) {
    console.log("[pipeline] All retailers failed, using seed data");
    allRawBoards.push(...SEED_BOARDS);
    errors.push({
      retailer: "system",
      error: "Live scraping failed (bot protection). Using seed data for demo.",
      timestamp: new Date().toISOString(),
    });
  }

  // Normalize all raw boards
  const normalizedBoards = allRawBoards.map((raw) =>
    normalizeBoard(raw, runId)
  );
  console.log(
    `[pipeline] ${normalizedBoards.length} boards after normalization`
  );

  // Save retailer-provided specs to spec_sources before enrichment
  saveRetailerSpecs(normalizedBoards);

  // Enrich boards missing specs via LLM + web search
  const enrichedBoards = mergedScope.skipEnrichment
    ? normalizedBoards
    : await enrichBoardSpecs(normalizedBoards);

  // Resolve spec sources: priority-based resolution + disagreement detection
  const resolvedBoards = await resolveSpecSources(enrichedBoards);

  // Fill in discount percent for boards that got MSRP from spec cache
  const boardsWithDiscount = resolvedBoards.map((board) => {
    if (
      board.discountPercent === null &&
      board.originalPriceUsd &&
      board.salePriceUsd &&
      board.originalPriceUsd > board.salePriceUsd
    ) {
      return {
        ...board,
        discountPercent: Math.round(
          ((board.originalPriceUsd - board.salePriceUsd) / board.originalPriceUsd) * 100
        ),
      };
    }
    return board;
  });

  // Split into Board + Listing entities and persist
  const { boards, listings } = splitIntoBoardsAndListings(boardsWithDiscount, runId);

  const durationMs = Date.now() - startTime;
  const run = {
    id: runId,
    timestamp: new Date().toISOString(),
    constraintsJson: JSON.stringify(mergedScope),
    boardCount: boards.length,
    retailersQueried: retailers.map((r) => r.name).join(","),
    durationMs,
  };

  // Insert search run before listings (listings.run_id FK → search_runs.id)
  insertSearchRun(run);
  upsertBoards(boards);
  insertListings(listings);

  pruneHttpCache();

  // Retrieve the board-centric results
  const boardsWithListings = getBoardsWithListings(runId);

  console.log(
    `[pipeline] Search complete: ${boards.length} boards, ${listings.length} listings in ${durationMs}ms`
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
  if (listings.length === 0) throw new Error(`No listings found for run ${runId}`);

  const errors: RetailerError[] = [];

  for (const listing of listings) {
    try {
      const browserRetailers = new Set(["evo", "backcountry", "rei"]);
      const fetchFn = browserRetailers.has(listing.retailer)
        ? fetchPageWithBrowser
        : fetchPage;
      const html = await fetchFn(listing.url, { retries: 1, timeoutMs: 10000, cacheTtlMs: 0 });
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
              if (offer.availability.includes("InStock")) availability = Availability.IN_STOCK;
              else if (offer.availability.includes("OutOfStock")) availability = Availability.OUT_OF_STOCK;
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
