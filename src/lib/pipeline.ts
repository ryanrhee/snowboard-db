import { randomUUID } from "crypto";
import {
  SearchConstraints,
  SearchResponse,
  RetailerError,
  CanonicalBoard,
  Availability,
  Currency,
} from "./types";
import { getRetailers } from "./retailers/registry";
import { normalizeBoard, convertToUsd } from "./normalization";
import { scoreBoard, calcValueScore, calcFinalScore } from "./scoring";
import { applyConstraints, DEFAULT_CONSTRAINTS } from "./constraints";
import {
  insertSearchRun,
  insertBoards,
  getBoardsByRunId,
  getRunById,
  updateBoardPriceAndStock,
} from "./db";
import { fetchPage, parsePrice } from "./scraping/utils";
import { fetchPageWithBrowser } from "./scraping/browser";
import { pruneHttpCache } from "./scraping/http-cache";
import { SEED_BOARDS } from "./seed-data";
import { enrichBoardSpecs } from "./llm/enrich";
import * as cheerio from "cheerio";

export async function runSearchPipeline(
  constraints?: Partial<SearchConstraints>
): Promise<SearchResponse> {
  const mergedConstraints: SearchConstraints = {
    ...DEFAULT_CONSTRAINTS,
    ...constraints,
  };

  const startTime = Date.now();
  const runId = randomUUID();

  // Get relevant retailers
  const retailers = getRetailers(mergedConstraints.regions);
  const errors: RetailerError[] = [];

  // Query all retailers in parallel
  const results = await Promise.allSettled(
    retailers.map((retailer) =>
      retailer.searchBoards(mergedConstraints).then((boards) => ({
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

  // Apply hard constraint filters
  const filteredBoards = applyConstraints(normalizedBoards, mergedConstraints);
  console.log(
    `[pipeline] ${filteredBoards.length} boards after constraint filtering`
  );

  // Enrich boards missing specs via LLM + web search
  const enrichedBoards = await enrichBoardSpecs(filteredBoards);

  // Fill in discount percent for boards that got MSRP from spec cache
  const boardsWithDiscount = enrichedBoards.map((board) => {
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

  // Score each board
  const scoredBoards = boardsWithDiscount.map(scoreBoard);

  // Sort by finalScore descending
  scoredBoards.sort((a, b) => b.finalScore - a.finalScore);

  // Persist to database
  const durationMs = Date.now() - startTime;
  const run = {
    id: runId,
    timestamp: new Date().toISOString(),
    constraintsJson: JSON.stringify(mergedConstraints),
    boardCount: scoredBoards.length,
    retailersQueried: retailers.map((r) => r.name).join(","),
    durationMs,
  };

  insertSearchRun(run);
  insertBoards(scoredBoards);
  pruneHttpCache();

  console.log(
    `[pipeline] Search complete: ${scoredBoards.length} boards in ${durationMs}ms`
  );

  return {
    run,
    boards: scoredBoards,
    errors,
  };
}

export async function refreshPipeline(
  runId: string
): Promise<SearchResponse> {
  const run = getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const boards = getBoardsByRunId(runId);
  if (boards.length === 0) throw new Error(`No boards found for run ${runId}`);

  const errors: RetailerError[] = [];
  const updatedBoards: CanonicalBoard[] = [];

  for (const board of boards) {
    try {
      const browserRetailers = new Set(["evo", "backcountry"]);
      const fetchFn = browserRetailers.has(board.retailer)
        ? fetchPageWithBrowser
        : fetchPage;
      const html = await fetchFn(board.url, { retries: 1, timeoutMs: 10000, cacheTtlMs: 0 });
      const $ = cheerio.load(html);

      // Try to extract current price
      let currentSalePrice: number | null = null;
      let currentOriginalPrice: number | null = null;
      let availability: Availability = board.availability as Availability;

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
          board.currency as Currency
        );
        const originalPriceUsd = currentOriginalPrice
          ? convertToUsd(currentOriginalPrice, board.currency as import("./types").Currency)
          : board.originalPriceUsd;
        const discountPercent =
          originalPriceUsd && salePriceUsd && originalPriceUsd > 0
            ? Math.round(
                ((originalPriceUsd - salePriceUsd) / originalPriceUsd) * 100
              )
            : board.discountPercent;

        const updatedBoard: CanonicalBoard = {
          ...board,
          salePrice: currentSalePrice,
          salePriceUsd,
          originalPrice: currentOriginalPrice || board.originalPrice,
          originalPriceUsd: originalPriceUsd || board.originalPriceUsd,
          discountPercent,
          availability,
        };

        const valueResult = calcValueScore(updatedBoard);
        const finalScore = calcFinalScore(updatedBoard.beginnerScore, valueResult.score);

        updatedBoard.valueScore = valueResult.score;
        updatedBoard.finalScore = finalScore;

        updateBoardPriceAndStock(board.id, runId, {
          salePrice: currentSalePrice,
          salePriceUsd,
          originalPrice: currentOriginalPrice,
          originalPriceUsd,
          discountPercent,
          availability,
          valueScore: valueResult.score,
          finalScore,
        });

        updatedBoards.push(updatedBoard);
      } else {
        updatedBoards.push(board);
      }
    } catch (error) {
      console.error(`[refresh] Failed to refresh ${board.url}:`, error);
      errors.push({
        retailer: board.retailer,
        error: `Failed to refresh ${board.url}: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      });
      updatedBoards.push(board);
    }
  }

  updatedBoards.sort((a, b) => b.finalScore - a.finalScore);

  return {
    run,
    boards: updatedBoards,
    errors,
  };
}
