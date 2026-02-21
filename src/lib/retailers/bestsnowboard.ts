import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, SearchConstraints, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPage, parsePrice, parseLengthCm, normalizeBrand, delay } from "../scraping/utils";

const BS_BASE_URL = "https://www.bestsnowboard.co.kr";

function buildSearchUrl(constraints: SearchConstraints): string {
  // Korean snowboard shop — search for sale boards
  return `${BS_BASE_URL}/product/list.html?cate_no=25&sort_method=6`;
}

function parseProductsFromHtml(html: string): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  // Korean e-commerce sites commonly use standard product listing patterns
  const cardSelectors = [
    ".prd-list .item",
    ".product-list .product",
    '[class*="product-item"]',
    ".item_gallery_type li",
    ".prdList .prdItem",
    "ul.prdList > li",
    ".thumbnail",
  ];

  for (const selector of cardSelectors) {
    const cards = $(selector);
    if (cards.length === 0) continue;

    cards.each((_, el) => {
      const $el = $(el);
      const link = $el.find("a[href]").first();
      const href = link.attr("href");
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : `${BS_BASE_URL}${href}`;
      const imgEl = $el.find("img").first();
      const nameEl = $el.find('[class*="name"], [class*="title"], .description, strong').first();

      // Korean price parsing: ₩450,000 or 450,000원
      const priceEls = $el.find('[class*="price"], [class*="Price"], .sale, .cost');
      let salePrice: number | undefined;
      let originalPrice: number | undefined;

      priceEls.each((_, priceEl) => {
        const text = $(priceEl).text().trim();
        const cls = $(priceEl).attr("class") || "";
        // Remove Korean Won symbol and parse
        const cleaned = text.replace(/[₩원,\s]/g, "");
        const parsed = parseFloat(cleaned);
        if (isNaN(parsed)) return;

        if (cls.includes("sale") || cls.includes("sell") || cls.includes("dc")) {
          salePrice = parsed;
        } else if (cls.includes("origin") || cls.includes("regular") || cls.includes("consumer")) {
          originalPrice = parsed;
        } else if (!salePrice) {
          salePrice = parsed;
        }
      });

      // Brand names on Korean sites are typically in English
      const nameText = nameEl.text().trim();
      let brand: string | undefined;
      let model: string | undefined;

      if (nameText) {
        // Try to split "BURTON Custom" into brand and model
        const parts = nameText.split(/\s+/);
        if (parts.length >= 2) {
          // If first word is all caps, it's likely the brand
          if (parts[0] === parts[0].toUpperCase() && parts[0].length > 1) {
            brand = parts[0];
            model = parts.slice(1).join(" ");
          } else {
            model = nameText;
          }
        } else {
          model = nameText;
        }
      }

      boards.push({
        retailer: "bestsnowboard",
        region: Region.KR,
        url: fullUrl,
        imageUrl: imgEl.attr("src") || imgEl.attr("data-src"),
        brand,
        model,
        salePrice,
        originalPrice,
        currency: Currency.KRW,
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

    // Product detail page parsing
    // Title/name
    const titleEl = $("h2, h1, .headingArea h1, [class*='product_name']").first();
    if (titleEl.length && !model) {
      model = titleEl.text().trim();
    }

    // Description
    const descEl = $('[class*="description"], [class*="detail"], #prdDetail').first();
    if (descEl.length) {
      description = descEl.text().trim().slice(0, 1000);
    }

    // Image
    if (!imageUrl) {
      const mainImg = $('[class*="main"] img, .keyImg img, #mainImage').first();
      imageUrl = mainImg.attr("src") || mainImg.attr("data-src");
    }

    // Price parsing on detail page
    if (!salePrice) {
      const priceEl = $('[class*="sale"], [class*="sell"], .price').first();
      const text = priceEl.text().replace(/[₩원,\s]/g, "");
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) salePrice = parsed;
    }

    if (!originalPrice) {
      const origEl = $('[class*="origin"], [class*="regular"], [class*="consumer"]').first();
      const text = origEl.text().replace(/[₩원,\s]/g, "");
      const parsed = parseFloat(text);
      if (!isNaN(parsed)) originalPrice = parsed;
    }

    // Specs table
    $("table tr, dl dt").each((_, el) => {
      const $el = $(el);
      let key: string, val: string;

      if ($el.is("tr")) {
        const cells = $el.find("td, th");
        if (cells.length < 2) return;
        key = $(cells[0]).text().trim().toLowerCase();
        val = $(cells[1]).text().trim();
      } else {
        key = $el.text().trim().toLowerCase();
        val = $el.next("dd").text().trim();
      }

      if (key && val) specs[key] = val;
    });

    // Map Korean spec keys
    const flex = specs["flex"] || specs["플렉스"] || specs["강도"];
    const profile = specs["profile"] || specs["프로파일"] || specs["캠버"];
    const shape = specs["shape"] || specs["쉐이프"] || specs["형태"];
    const category = specs["terrain"] || specs["지형"] || specs["용도"];

    let lengthCm: number | undefined;
    const lengthSpec = specs["size"] || specs["사이즈"] || specs["길이"] || specs["length"];
    if (lengthSpec) lengthCm = parseLengthCm(lengthSpec) || undefined;

    if (!salePrice) return null;

    // Brand extraction from model name if still missing
    if (!brand && model) {
      const knownBrands = [
        "BURTON", "RIDE", "CAPITA", "JONES", "GNU", "LIB TECH", "LIBTECH",
        "K2", "ARBOR", "SALOMON", "NITRO", "ROSSIGNOL", "ROME", "NIDECKER",
        "BATALEON", "NEVER SUMMER", "YES", "ENDEAVOR",
      ];
      const upperModel = model.toUpperCase();
      for (const b of knownBrands) {
        if (upperModel.startsWith(b)) {
          brand = b;
          model = model.slice(b.length).trim();
          break;
        }
      }
    }

    return {
      retailer: "bestsnowboard",
      region: Region.KR,
      url: partial.url,
      imageUrl,
      brand: brand ? normalizeBrand(brand) : "Unknown",
      model: model || "Unknown",
      year: undefined,
      lengthCm,
      widthMm: undefined,
      flex,
      profile,
      shape,
      category,
      originalPrice,
      salePrice,
      currency: Currency.KRW,
      availability: "in_stock",
      description,
      specs,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[bestsnowboard] Failed to fetch details for ${partial.url}:`, error);
    return null;
  }
}

export const bestsnowboard: RetailerModule = {
  name: "bestsnowboard",
  region: Region.KR,
  baseUrl: BS_BASE_URL,

  async searchBoards(constraints: SearchConstraints): Promise<RawBoard[]> {
    const searchUrl = buildSearchUrl(constraints);
    console.log(`[bestsnowboard] Fetching search results from ${searchUrl}`);

    const html = await fetchPage(searchUrl);
    const partials = parseProductsFromHtml(html);
    console.log(`[bestsnowboard] Found ${partials.length} product cards`);

    // Convert KRW max price for filtering
    const maxPriceKrw = constraints.maxPriceUsd
      ? constraints.maxPriceUsd / config.krwToUsdRate
      : null;

    const filtered = maxPriceKrw
      ? partials.filter((b) => !b.salePrice || b.salePrice <= maxPriceKrw)
      : partials;

    console.log(`[bestsnowboard] Fetching details for ${filtered.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of filtered) {
      const board = await fetchBoardDetails(partial);
      if (board) boards.push(board);
    }

    console.log(`[bestsnowboard] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
