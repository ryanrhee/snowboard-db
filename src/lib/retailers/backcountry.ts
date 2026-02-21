import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, SearchConstraints, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPage, parsePrice, parseLengthCm, normalizeBrand, delay } from "../scraping/utils";

const BC_BASE_URL = "https://www.backcountry.com";

function buildSearchUrl(constraints: SearchConstraints): string {
  const params = new URLSearchParams();
  params.set("q", "snowboard");
  params.set("p", "sale"); // sale items
  if (constraints.maxPriceUsd) {
    params.set("priceMax", String(constraints.maxPriceUsd));
  }
  return `${BC_BASE_URL}/rc/snowboards?${params}`;
}

function parseProductsFromHtml(html: string): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  // Try __NEXT_DATA__ JSON first (Next.js app)
  const nextDataScript = $("#__NEXT_DATA__");
  if (nextDataScript.length > 0) {
    try {
      const nextData = JSON.parse(nextDataScript.text());
      const products =
        nextData?.props?.pageProps?.initialState?.products?.items ||
        nextData?.props?.pageProps?.products ||
        [];

      for (const product of products) {
        if (!product) continue;
        boards.push({
          retailer: "backcountry",
          region: Region.US,
          url: product.url
            ? (product.url.startsWith("http") ? product.url : `${BC_BASE_URL}${product.url}`)
            : undefined,
          imageUrl: product.imageUrl || product.image || undefined,
          brand: product.brand?.name || product.brandName || product.brand,
          model: product.title || product.name,
          salePrice: product.salePrice || product.price?.sale || product.price?.current,
          originalPrice: product.originalPrice || product.price?.original || product.price?.regular,
          currency: Currency.USD,
        });
      }

      if (boards.length > 0) return boards;
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Try JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = data["@type"] === "ItemList" ? data.itemListElement : [data];
      for (const item of items) {
        const product = item.item || item;
        if (product["@type"] !== "Product") continue;
        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        boards.push({
          retailer: "backcountry",
          region: Region.US,
          url: product.url,
          imageUrl: product.image,
          brand: product.brand?.name || product.brand,
          model: product.name,
          salePrice: offer?.price ? parseFloat(offer.price) : undefined,
          currency: Currency.USD,
        });
      }
    } catch {
      // skip
    }
  });

  if (boards.length > 0) return boards;

  // HTML fallback: product cards
  const cardSelectors = [
    '[data-id="productCard"]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    ".product-listing-item",
  ];

  for (const selector of cardSelectors) {
    const cards = $(selector);
    if (cards.length === 0) continue;

    cards.each((_, el) => {
      const $el = $(el);
      const link = $el.find("a[href]").first();
      const href = link.attr("href");
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : `${BC_BASE_URL}${href}`;
      const imgEl = $el.find("img").first();
      const brandEl = $el.find('[class*="brand"], [class*="Brand"]').first();
      const nameEl = $el.find('[class*="name"], [class*="title"], [class*="Name"]').first();

      const priceEls = $el.find('[class*="price"], [class*="Price"]');
      let salePrice: number | undefined;
      let originalPrice: number | undefined;

      priceEls.each((_, priceEl) => {
        const text = $(priceEl).text();
        const cls = $(priceEl).attr("class") || "";
        const parsed = parsePrice(text);
        if (!parsed) return;

        if (cls.includes("sale") || cls.includes("Sale") || cls.includes("current")) {
          salePrice = parsed;
        } else if (cls.includes("original") || cls.includes("regular") || cls.includes("compare")) {
          originalPrice = parsed;
        } else if (!salePrice) {
          salePrice = parsed;
        }
      });

      boards.push({
        retailer: "backcountry",
        region: Region.US,
        url: fullUrl,
        imageUrl: imgEl.attr("src") || imgEl.attr("data-src"),
        brand: brandEl.text().trim() || undefined,
        model: nameEl.text().trim() || link.text().trim() || undefined,
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

    // JSON-LD on product page
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

    // Parse specs
    $('[class*="spec"] li, [class*="Spec"] li, [class*="detail"] li').each((_, el) => {
      const text = $(el).text().trim();
      const parts = text.split(/:\s*/);
      if (parts.length === 2) {
        specs[parts[0].toLowerCase().trim()] = parts[1].trim();
      }
    });

    // Also try table rows
    $("table tr").each((_, row) => {
      const cells = $(row).find("td, th");
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim().toLowerCase();
        const val = $(cells[1]).text().trim();
        if (key && val) specs[key] = val;
      }
    });

    const flex = specs["flex rating"] || specs["flex"] || specs["stiffness"];
    const profile = specs["profile"] || specs["bend"] || specs["camber type"];
    const shape = specs["shape"] || specs["shape type"];
    const category = specs["terrain"] || specs["best for"] || specs["ability level"];

    let lengthCm: number | undefined;
    const lengthSpec = specs["size"] || specs["length"] || specs["board length"];
    if (lengthSpec) lengthCm = parseLengthCm(lengthSpec) || undefined;
    if (!lengthCm) {
      const urlMatch = partial.url.match(/(\d{3})(?:cm)?(?:[/-]|$)/);
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
      retailer: "backcountry",
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
    console.error(`[backcountry] Failed to fetch details for ${partial.url}:`, error);
    return null;
  }
}

export const backcountry: RetailerModule = {
  name: "backcountry",
  region: Region.US,
  baseUrl: BC_BASE_URL,

  async searchBoards(constraints: SearchConstraints): Promise<RawBoard[]> {
    const searchUrl = buildSearchUrl(constraints);
    console.log(`[backcountry] Fetching search results from ${searchUrl}`);

    const html = await fetchPage(searchUrl);
    const partials = parseProductsFromHtml(html);
    console.log(`[backcountry] Found ${partials.length} product cards`);

    const maxPrice = constraints.maxPriceUsd;
    const filtered = maxPrice
      ? partials.filter((b) => !b.salePrice || b.salePrice <= maxPrice)
      : partials;

    console.log(`[backcountry] Fetching details for ${filtered.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of filtered) {
      const board = await fetchBoardDetails(partial);
      if (board) boards.push(board);
    }

    console.log(`[backcountry] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
