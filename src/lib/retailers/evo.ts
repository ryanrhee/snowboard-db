import * as cheerio from "cheerio";
import { RawBoard, ScrapeScope, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPageWithBrowser, parsePrice, normalizeBrand } from "../scraping/utils";

const EVO_BASE_URL = "https://www.evo.com";

function buildSearchUrl(): string {
  return `${EVO_BASE_URL}/shop/snowboard/snowboards/sale`;
}

function parseProductCards(html: string): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  // evo uses .product-thumb cards with known sub-selectors
  $(".product-thumb").each((_, el) => {
    const $el = $(el);

    const link = $el.find(".product-thumb-link, a").first();
    const href = link.attr("href");
    if (!href) return;
    const fullUrl = href.startsWith("http") ? href : `${EVO_BASE_URL}${href}`;

    const title = $el.find(".product-thumb-title").text().trim();
    const imgEl = $el.find(".product-thumb-image, img").first();
    const imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || undefined;

    // Price text contains original + sale on separate lines, e.g.:
    // "$549.95\n$439.96\nSale"
    const priceText = $el.find(".product-thumb-price").text().trim();
    const priceMatches = priceText.match(/\$([\d,.]+)/g) || [];

    let originalPrice: number | undefined;
    let salePrice: number | undefined;

    if (priceMatches.length >= 2) {
      // First price is original, second is sale
      originalPrice = parsePrice(priceMatches[0]!) || undefined;
      salePrice = parsePrice(priceMatches[1]!) || undefined;
    } else if (priceMatches.length === 1) {
      salePrice = parsePrice(priceMatches[0]!) || undefined;
    }

    // Parse brand from title (first word is typically the brand)
    let brand: string | undefined;
    let model = title;
    if (title) {
      const parts = title.split(/\s+/);
      brand = parts[0];
      // Remove brand from model to avoid duplication like "Rossignol Rossignol Ultraviolet"
      model = parts.slice(1).join(" ") || title;
    }

    boards.push({
      retailer: "evo",
      region: Region.US,
      url: fullUrl,
      imageUrl,
      brand,
      model,
      originalPrice,
      salePrice,
      currency: Currency.USD,
    });
  });

  return boards;
}

export const evo: RetailerModule = {
  name: "evo",
  region: Region.US,
  baseUrl: EVO_BASE_URL,

  async searchBoards(_scope: ScrapeScope): Promise<RawBoard[]> {
    const searchUrl = buildSearchUrl();
    console.log(`[evo] Fetching search results from ${searchUrl}`);

    const html = await fetchPageWithBrowser(searchUrl);
    const partialBoards = parseProductCards(html);
    console.log(`[evo] Found ${partialBoards.length} product cards`);

    // Convert listing data directly to RawBoard (skip detail pages for speed)
    const boards: RawBoard[] = partialBoards
      .filter((p) => p.salePrice && p.url)
      .map((p) => ({
        retailer: "evo",
        region: Region.US,
        url: p.url!,
        imageUrl: p.imageUrl,
        brand: p.brand ? normalizeBrand(p.brand) : "Unknown",
        model: p.model || "Unknown",
        year: undefined,
        lengthCm: undefined,
        widthMm: undefined,
        flex: undefined,
        profile: undefined,
        shape: undefined,
        category: undefined,
        originalPrice: p.originalPrice,
        salePrice: p.salePrice!,
        currency: Currency.USD,
        availability: "in_stock",
        description: undefined,
        specs: {},
        scrapedAt: new Date().toISOString(),
      }));

    console.log(`[evo] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
