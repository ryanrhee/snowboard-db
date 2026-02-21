import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, SearchConstraints, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPage, parsePrice, parseLengthCm, normalizeBrand, delay } from "../scraping/utils";

const REI_BASE_URL = "https://www.rei.com";

function buildSearchUrl(constraints: SearchConstraints): string {
  // REI search/category URL for snowboards on sale
  let url = `${REI_BASE_URL}/c/downhill-snowboards`;
  const params: string[] = [];

  // Sale filter
  params.push("deals=*");

  if (constraints.maxPriceUsd) {
    params.push(`price=${encodeURIComponent(`0-${constraints.maxPriceUsd}`)}`);
  }

  return `${url}?${params.join("&")}`;
}

function parseProductsFromHtml(html: string): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  // Try JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      if (data["@type"] === "ItemList" && data.itemListElement) {
        for (const item of data.itemListElement) {
          const product = item.item || item;
          if (product["@type"] !== "Product") continue;
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
          boards.push({
            retailer: "rei",
            region: Region.US,
            url: product.url?.startsWith("http") ? product.url : `${REI_BASE_URL}${product.url || ""}`,
            imageUrl: product.image,
            brand: product.brand?.name || product.brand,
            model: product.name,
            salePrice: offer?.price ? parseFloat(offer.price) : undefined,
            currency: Currency.USD,
          });
        }
      }
    } catch {
      // skip
    }
  });

  if (boards.length > 0) return boards;

  // HTML fallback: REI product cards
  const cardSelectors = [
    '[data-ui="product-card"]',
    '[class*="product-card"]',
    '[class*="search-results"] li',
    '[id*="search-results"] li',
  ];

  for (const selector of cardSelectors) {
    const cards = $(selector);
    if (cards.length === 0) continue;

    cards.each((_, el) => {
      const $el = $(el);
      const link = $el.find('a[href*="/product/"]').first();
      const href = link.attr("href");
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : `${REI_BASE_URL}${href}`;
      const imgEl = $el.find("img").first();
      const brandEl = $el.find('[class*="brand"], [data-ui="brand"]').first();
      const nameEl = $el.find('[class*="name"], [data-ui="name"]').first();

      let salePrice: number | undefined;
      let originalPrice: number | undefined;

      const salePriceEl = $el.find('[class*="sale"], [data-ui="sale-price"]').first();
      const origPriceEl = $el.find('[class*="compare"], [data-ui="compare-price"], s, del').first();

      if (salePriceEl.length) salePrice = parsePrice(salePriceEl.text()) || undefined;
      if (origPriceEl.length) originalPrice = parsePrice(origPriceEl.text()) || undefined;

      if (!salePrice) {
        salePrice = parsePrice($el.find('[class*="price"]').first().text()) || undefined;
      }

      boards.push({
        retailer: "rei",
        region: Region.US,
        url: fullUrl,
        imageUrl: imgEl.attr("src") || imgEl.attr("data-src"),
        brand: brandEl.text().trim() || undefined,
        model: nameEl.text().trim() || undefined,
        salePrice,
        originalPrice,
        currency: Currency.USD,
      });
    });
    break;
  }

  return boards;
}

async function fetchBoardDetails(partial: Partial<RawBoard>): Promise<RawBoard | null> {
  if (!partial.url) return null;

  try {
    await delay(config.scrapeDelayMs);
    const html = await fetchPage(partial.url);
    const $ = cheerio.load(html);

    let brand = partial.brand;
    let model = partial.model;
    let salePrice = partial.salePrice;
    let originalPrice = partial.originalPrice;
    let imageUrl = partial.imageUrl;
    let description: string | undefined;
    const specs: Record<string, string> = {};

    // JSON-LD product data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data["@type"] === "Product") {
          brand = brand || data.brand?.name || data.brand;
          model = model || data.name;
          description = data.description;
          imageUrl = imageUrl || data.image;
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          if (offer?.price && !salePrice) salePrice = parseFloat(offer.price);
          if (offer?.availability) specs["availability"] = offer.availability;
        }
      } catch { /* skip */ }
    });

    // REI specs section
    const specSelectors = [
      "#tab-specs table tr",
      '[class*="specs"] table tr',
      '[class*="specifications"] tr',
      '[data-ui="specs"] tr',
    ];

    for (const selector of specSelectors) {
      $(selector).each((_, row) => {
        const cells = $(row).find("td, th");
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim().toLowerCase();
          const val = $(cells[1]).text().trim();
          if (key && val) specs[key] = val;
        }
      });
      if (Object.keys(specs).length > 2) break;
    }

    // Definition lists
    if (Object.keys(specs).length < 2) {
      $("dl dt").each((_, el) => {
        const key = $(el).text().trim().toLowerCase();
        const val = $(el).next("dd").text().trim();
        if (key && val) specs[key] = val;
      });
    }

    const flex = specs["flex rating"] || specs["flex"] || specs["stiffness"];
    const profile = specs["profile"] || specs["bend"] || specs["rocker type"];
    const shape = specs["shape"] || specs["shape type"];
    const category = specs["terrain"] || specs["best use"] || specs["best for"];

    let lengthCm: number | undefined;
    const lengthSpec = specs["size"] || specs["length"] || specs["board length"];
    if (lengthSpec) lengthCm = parseLengthCm(lengthSpec) || undefined;
    if (!lengthCm) {
      const urlMatch = partial.url.match(/(\d{3})(?:cm)?/);
      if (urlMatch) {
        const parsed = parseInt(urlMatch[1]);
        if (parsed >= 100 && parsed <= 200) lengthCm = parsed;
      }
    }

    let widthMm: number | undefined;
    const widthSpec = specs["waist width"] || specs["width"];
    if (widthSpec) {
      const m = widthSpec.match(/([\d.]+)/);
      if (m) widthMm = parseFloat(m[1]);
    }

    if (!salePrice) return null;

    let availability: string | undefined;
    if (specs["availability"]?.includes("InStock")) availability = "in_stock";
    else if (specs["availability"]?.includes("OutOfStock")) availability = "out_of_stock";

    return {
      retailer: "rei",
      region: Region.US,
      url: partial.url,
      imageUrl,
      brand: brand ? normalizeBrand(brand) : "Unknown",
      model: model || "Unknown",
      year: undefined,
      lengthCm,
      widthMm,
      flex,
      profile,
      shape,
      category,
      originalPrice,
      salePrice,
      currency: Currency.USD,
      availability,
      description: description?.slice(0, 1000),
      specs,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[rei] Failed to fetch details for ${partial.url}:`, error);
    return null;
  }
}

export const rei: RetailerModule = {
  name: "rei",
  region: Region.US,
  baseUrl: REI_BASE_URL,

  async searchBoards(constraints: SearchConstraints): Promise<RawBoard[]> {
    const searchUrl = buildSearchUrl(constraints);
    console.log(`[rei] Fetching search results from ${searchUrl}`);

    const html = await fetchPage(searchUrl);
    const partials = parseProductsFromHtml(html);
    console.log(`[rei] Found ${partials.length} product cards`);

    const maxPrice = constraints.maxPriceUsd;
    const filtered = maxPrice
      ? partials.filter((b) => !b.salePrice || b.salePrice <= maxPrice)
      : partials;

    console.log(`[rei] Fetching details for ${filtered.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of filtered) {
      const board = await fetchBoardDetails(partial);
      if (board) boards.push(board);
    }

    console.log(`[rei] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
