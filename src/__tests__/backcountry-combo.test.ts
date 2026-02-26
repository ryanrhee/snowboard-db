import { describe, it, expect, vi, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { resolve } from "path";
import { adaptRetailerOutput } from "../lib/scrapers/adapters";
import { Currency, Region, RawBoard } from "../lib/types";

/**
 * Integration test: backcountry combo package detail page → gender detection.
 *
 * Uses cached HTML from the http-cache DB to test that the backcountry scraper
 * correctly identifies the board component's gender from a combo deal page.
 *
 * The page for "Capita Paradice Snowboard + Union Juliet Binding - 2026" has
 * two sub-product titles:
 *   - "Capita Paradise Snowboard - 2026 - Women's"
 *   - "Union Juliet Snowboard Binding - 2026 - Women's"
 *
 * The scraper should detect "Women's" from the board component and tag the
 * board as womens gender.
 */

const COMBO_URL =
  "https://www.backcountry.com/capita-paradice-union-juliet-snowboard-package-2026";

let cachedHtml: string;

beforeAll(() => {
  const dbPath = resolve(__dirname, "../../data/http-cache.db");
  const db = new Database(dbPath, { readonly: true });
  const row = db.prepare("SELECT body FROM http_cache WHERE url = ?").get(COMBO_URL) as
    | { body: string }
    | undefined;
  db.close();

  if (!row) {
    throw new Error(
      `No cached HTML found for ${COMBO_URL}. Run the pipeline first to populate the cache.`
    );
  }
  cachedHtml = row.body;
});

// Mock fetchPageWithBrowser to return cached HTML instead of making network requests
vi.mock("../lib/scraping/utils", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    fetchPageWithBrowser: vi.fn(async () => cachedHtml),
    delay: vi.fn(async () => {}),
  };
});

// Mock config to avoid loading .env
vi.mock("../lib/config", () => ({
  config: { scrapeDelayMs: 0 },
}));

describe("backcountry combo package gender detection", () => {
  it("detects womens gender from combo page component titles", async () => {
    const { backcountry } = await import("../lib/retailers/backcountry");

    // Mock fetchPageWithBrowser to return different HTML for listing vs detail page
    const { fetchPageWithBrowser } = await import("../lib/scraping/utils");
    const mockFetch = fetchPageWithBrowser as ReturnType<typeof vi.fn>;

    // First call: listing page (return a page with one product pointing to our combo URL)
    // We build a minimal __NEXT_DATA__ listing page with just this one product
    const listingHtml = `<html><head></head><body>
      <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            totalPages: 1,
            __APOLLO_STATE__: {
              "Product:combo-1": {
                __typename: "Product",
                name: "Paradice Snowboard + Union Juliet Binding - 2026",
                brand: { name: "Capita" },
                url: "/capita-paradice-union-juliet-snowboard-package-2026",
                aggregates: { minSalePrice: 529, minListPrice: 599 },
              },
            },
          },
        },
      })}</script>
    </body></html>`;

    // First call returns listing, second call returns detail page
    mockFetch.mockResolvedValueOnce(listingHtml).mockResolvedValueOnce(cachedHtml);

    const scrapedBoards = await backcountry.scrape();

    // Find the board(s) that came from this combo URL
    const paradiseBoards = scrapedBoards.filter(
      (b) => b.model.toLowerCase().includes("paradise") || b.model.toLowerCase().includes("paradice")
    );

    expect(paradiseBoards.length).toBeGreaterThan(0);

    // The board should be detected as womens
    for (const board of paradiseBoards) {
      expect(board.gender).toBe("womens");
    }
  });
});
