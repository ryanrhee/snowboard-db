import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, SearchConstraints, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPage, parsePrice, parseLengthCm, normalizeBrand, delay } from "../scraping/utils";

const EVO_BASE_URL = "https://www.evo.com";

function buildSearchUrl(constraints: SearchConstraints): string {
  // evo.com sale snowboards URL with filters
  let url = `${EVO_BASE_URL}/shop/snowboards/snowboards/s_price-drop/rpp_100`;

  const params: string[] = [];

  // Size filter — evo uses size ranges like "150-154", "155-159", "160-164"
  if (constraints.minLengthCm || constraints.maxLengthCm) {
    // We'll filter more precisely on our side; just get a broad range
  }

  // Price filter
  if (constraints.maxPriceUsd) {
    params.push(`max_price_${constraints.maxPriceUsd}`);
  }

  if (params.length > 0) {
    url += "/" + params.join("/");
  }

  return url;
}

function parseProductCards(
  html: string,
  constraints: SearchConstraints
): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  // Try JSON-LD first
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const jsonLdProducts: Partial<RawBoard>[] = [];

  jsonLdScripts.each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      if (data["@type"] === "ItemList" && data.itemListElement) {
        for (const item of data.itemListElement) {
          const product = item.item || item;
          if (product["@type"] === "Product") {
            const offer = product.offers?.[0] || product.offers;
            jsonLdProducts.push({
              brand: product.brand?.name || product.brand,
              model: product.name,
              url: product.url,
              imageUrl: product.image,
              salePrice: offer?.price ? parseFloat(offer.price) : undefined,
              currency: Currency.USD,
            });
          }
        }
      }
    } catch {
      // JSON-LD parsing failed, fall back to HTML
    }
  });

  if (jsonLdProducts.length > 0) {
    return jsonLdProducts;
  }

  // Fallback: parse product cards from HTML
  // evo.com product cards are in various container selectors
  const productSelectors = [
    '[data-testid="product-card"]',
    ".product-card",
    '[class*="ProductCard"]',
    ".product-thumb",
    'a[href*="/snowboards/"]',
  ];

  let productElements: ReturnType<typeof $> | null = null;
  for (const selector of productSelectors) {
    const els = $(selector);
    if (els.length > 0) {
      productElements = els;
      break;
    }
  }

  if (!productElements || productElements.length === 0) {
    // Try a broader approach: look for any product-like links
    $('a[href*="/snowboards/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || href.includes("/shop/") || boards.some((b) => b.url === href)) return;

      const fullUrl = href.startsWith("http") ? href : `${EVO_BASE_URL}${href}`;
      const text = $el.text().trim();

      boards.push({
        url: fullUrl,
        model: text || undefined,
        currency: Currency.USD,
      });
    });
    return boards;
  }

  productElements.each((_, el) => {
    const $el = $(el);

    // Extract URL
    const linkEl = $el.is("a") ? $el : $el.find("a").first();
    const href = linkEl.attr("href");
    if (!href) return;
    const fullUrl = href.startsWith("http") ? href : `${EVO_BASE_URL}${href}`;

    // Extract image
    const imgEl = $el.find("img").first();
    const imageUrl = imgEl.attr("src") || imgEl.attr("data-src") || undefined;

    // Extract brand and model from text
    const brandEl = $el.find('[class*="brand"], [class*="Brand"]').first();
    const nameEl = $el.find('[class*="name"], [class*="Name"], [class*="title"], [class*="Title"]').first();

    // Extract prices
    const salePriceEl = $el.find('[class*="sale"], [class*="Sale"], [class*="discount"], .price-sale').first();
    const origPriceEl = $el.find('[class*="regular"], [class*="Regular"], [class*="original"], .price-original, s, del').first();

    const salePrice = parsePrice(salePriceEl.text()) || parsePrice($el.find('[class*="price"], .price').first().text());
    const originalPrice = parsePrice(origPriceEl.text());

    boards.push({
      retailer: "evo",
      region: Region.US,
      url: fullUrl,
      imageUrl: imageUrl,
      brand: brandEl.text().trim() || undefined,
      model: nameEl.text().trim() || undefined,
      salePrice: salePrice || undefined,
      originalPrice: originalPrice || undefined,
      currency: Currency.USD,
    });
  });

  return boards;
}

async function fetchBoardDetails(
  partialBoard: Partial<RawBoard>
): Promise<RawBoard | null> {
  if (!partialBoard.url) return null;

  try {
    await delay(config.scrapeDelayMs);
    const html = await fetchPage(partialBoard.url);
    const $ = cheerio.load(html);

    // Try JSON-LD first
    let jsonLdData: Record<string, unknown> | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data["@type"] === "Product") {
          jsonLdData = data;
        }
      } catch {
        // skip
      }
    });

    let brand = partialBoard.brand;
    let model = partialBoard.model;
    let salePrice = partialBoard.salePrice;
    let originalPrice = partialBoard.originalPrice;
    let imageUrl = partialBoard.imageUrl;
    let description: string | undefined;
    const specs: Record<string, string> = {};

    if (jsonLdData) {
      const jd = jsonLdData as Record<string, unknown>;
      brand = brand || ((jd.brand as Record<string, string>)?.name ?? (jd.brand as string));
      model = model || (jd.name as string);
      description = jd.description as string;
      imageUrl = imageUrl || (jd.image as string);

      const offer = Array.isArray(jd.offers) ? jd.offers[0] : jd.offers;
      if (offer && typeof offer === "object") {
        const offerObj = offer as Record<string, unknown>;
        if (!salePrice && offerObj.price) salePrice = parseFloat(offerObj.price as string);
        if (offerObj.availability) {
          specs["availability"] = offerObj.availability as string;
        }
      }
    }

    // Parse specs table
    const specSelectors = [
      "table.specs-table tr",
      '[class*="spec"] tr',
      '[data-testid*="spec"] tr',
      ".pdp-spec-list li",
      '[class*="TechSpec"] tr',
    ];

    for (const selector of specSelectors) {
      $(selector).each((_, row) => {
        const cells = $(row).find("td, th, dt, dd, span");
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim().toLowerCase();
          const val = $(cells[1]).text().trim();
          if (key && val) specs[key] = val;
        }
      });
      if (Object.keys(specs).length > 0) break;
    }

    // Also try definition list format
    if (Object.keys(specs).length === 0) {
      $("dl dt").each((_, el) => {
        const key = $(el).text().trim().toLowerCase();
        const val = $(el).next("dd").text().trim();
        if (key && val) specs[key] = val;
      });
    }

    // Extract specs from the parsed table
    const flex = specs["flex rating"] || specs["flex"] || specs["stiffness"];
    const profile = specs["profile"] || specs["bend"] || specs["camber type"];
    const shape = specs["shape"] || specs["shape type"];
    const category = specs["terrain"] || specs["ability level"] || specs["riding style"] || specs["best for"];

    // Parse length from specs or URL
    let lengthCm: number | undefined;
    const lengthSpec = specs["size"] || specs["length"] || specs["board length"];
    if (lengthSpec) {
      lengthCm = parseLengthCm(lengthSpec) || undefined;
    }
    // Try to parse from URL (e.g., /board-name-156cm)
    if (!lengthCm) {
      const urlMatch = partialBoard.url.match(/(\d{3})(?:cm)?(?:[/-]|$)/);
      if (urlMatch) {
        const parsed = parseInt(urlMatch[1]);
        if (parsed >= 100 && parsed <= 200) lengthCm = parsed;
      }
    }

    // Parse width
    let widthMm: number | undefined;
    const widthSpec = specs["waist width"] || specs["width"] || specs["waist"];
    if (widthSpec) {
      const widthMatch = widthSpec.match(/([\d.]+)\s*(?:mm)?/i);
      if (widthMatch) widthMm = parseFloat(widthMatch[1]);
    }

    // Fallback price parsing from HTML
    if (!salePrice) {
      const priceSelectors = [
        '[class*="sale-price"]',
        '[class*="salePrice"]',
        '[class*="price-sale"]',
        ".price-sale",
        '[data-testid*="sale-price"]',
      ];
      for (const sel of priceSelectors) {
        const priceText = $(sel).first().text();
        const parsed = parsePrice(priceText);
        if (parsed) {
          salePrice = parsed;
          break;
        }
      }
    }

    if (!originalPrice) {
      const origSelectors = [
        '[class*="regular-price"]',
        '[class*="regularPrice"]',
        '[class*="price-regular"]',
        "s .price",
        "del",
      ];
      for (const sel of origSelectors) {
        const priceText = $(sel).first().text();
        const parsed = parsePrice(priceText);
        if (parsed) {
          originalPrice = parsed;
          break;
        }
      }
    }

    // Fallback brand parsing from page title
    if (!brand) {
      const titleText = $("h1").first().text().trim();
      if (titleText) {
        const parts = titleText.split(/\s+/);
        brand = parts[0];
        model = model || titleText;
      }
    }

    if (!salePrice) return null; // Can't use a board without a price

    // Check availability
    let availability: string | undefined;
    const availText = specs["availability"];
    if (availText) {
      if (availText.includes("InStock")) availability = "in_stock";
      else if (availText.includes("OutOfStock")) availability = "out_of_stock";
      else if (availText.includes("LimitedAvailability")) availability = "low_stock";
    }
    // Check for add-to-cart button presence
    if (!availability) {
      const addToCartBtn = $('button[class*="add-to-cart"], [data-testid*="add-to-cart"], button:contains("Add to Cart")');
      availability = addToCartBtn.length > 0 ? "in_stock" : "unknown";
    }

    return {
      retailer: "evo",
      region: Region.US,
      url: partialBoard.url,
      imageUrl: imageUrl,
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
    console.error(`Failed to fetch details for ${partialBoard.url}:`, error);
    return null;
  }
}

export const evo: RetailerModule = {
  name: "evo",
  region: Region.US,
  baseUrl: EVO_BASE_URL,

  async searchBoards(constraints: SearchConstraints): Promise<RawBoard[]> {
    const searchUrl = buildSearchUrl(constraints);
    console.log(`[evo] Fetching search results from ${searchUrl}`);

    const html = await fetchPage(searchUrl);
    const partialBoards = parseProductCards(html, constraints);
    console.log(`[evo] Found ${partialBoards.length} product cards`);

    // Quick price filter before fetching details
    const maxPrice = constraints.maxPriceUsd;
    const filtered = maxPrice
      ? partialBoards.filter((b) => !b.salePrice || b.salePrice <= maxPrice)
      : partialBoards;

    console.log(`[evo] Fetching details for ${filtered.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of filtered) {
      const board = await fetchBoardDetails(partial);
      if (board) boards.push(board);
    }

    console.log(`[evo] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
