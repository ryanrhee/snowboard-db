import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, ScrapeScope, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPage, parsePrice, normalizeBrand, delay } from "../scraping/utils";

const TACTICS_BASE_URL = "https://www.tactics.com";

function buildSearchUrl(): string {
  return `${TACTICS_BASE_URL}/snowboards/sale`;
}

function parseProductCards(html: string): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  $("div.browse-grid-item").each((_, el) => {
    const $el = $(el);

    const link = $el.find("a[href]").first();
    const href = link.attr("href");
    if (!href) return;

    // Skip non-snowboard items (bindings, accessories, etc.)
    if (!href.includes("snowboard")) return;

    const fullUrl = `${TACTICS_BASE_URL}${href}`;

    // Image
    const imgEl = $el.find("img").first();
    const imageUrl = imgEl.attr("src")
      ? `${TACTICS_BASE_URL}${imgEl.attr("src")}`
      : undefined;

    // Brand
    const brandEl = $el.find(".browse-grid-item-brand").first();
    const brand = brandEl.text().trim() || undefined;

    // Full link text = brand + model + year
    const fullText = link.text().trim();
    // Remove brand name from start to get model
    let model = fullText;
    if (brand && model.startsWith(brand)) {
      model = model.slice(brand.length).trim();
    }

    // Price parsing
    let salePrice: number | undefined;
    let originalPrice: number | undefined;

    const salePriceEl = $el.find(".browse-grid-item-sale-price").first();
    if (salePriceEl.length) {
      const salePriceText = salePriceEl.clone().children().remove().end().text();
      salePrice = parsePrice(salePriceText) || undefined;

      // Derive original from discount percentage
      const discountEl = $el.find(".browse-grid-item-discount").first();
      const discountMatch = discountEl.text().match(/(\d+)%\s*off/i);
      if (discountMatch && salePrice) {
        const pct = parseInt(discountMatch[1]);
        originalPrice = Math.round((salePrice / (1 - pct / 100)) * 100) / 100;
      }
    } else {
      const priceEl = $el.find(".browse-grid-item-price").first();
      salePrice = parsePrice(priceEl.text()) || undefined;
    }

    boards.push({
      retailer: "tactics",
      region: Region.US,
      url: fullUrl,
      imageUrl,
      brand,
      model,
      salePrice,
      originalPrice,
      currency: Currency.USD,
    });
  });

  return boards;
}

async function fetchBoardDetails(
  partial: Partial<RawBoard>
): Promise<RawBoard[]> {
  if (!partial.url) return [];

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
    let year: number | undefined;
    let flex: string | undefined;
    let profile: string | undefined;
    let shape: string | undefined;
    let category: string | undefined;
    let abilityLevel: string | undefined;
    let availability: string = "unknown";
    const specs: Record<string, string> = {};
    const sizes: { cm: number; salePrice: number; originalPrice: number; stock: number }[] = [];

    // JSON-LD for brand, name, price, availability
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data["@type"] === "Product") {
          brand = brand || data.brand?.name;
          model = model || data.name;
          if (Array.isArray(data.image) && data.image[0]) {
            imageUrl = imageUrl || data.image[0];
          }
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          if (offer) {
            if (!salePrice && offer.price) salePrice = parseFloat(offer.price);
            if (offer.availability?.includes("InStock")) availability = "in_stock";
            else if (offer.availability?.includes("OutOfStock")) availability = "out_of_stock";
          }
        }
      } catch { /* skip */ }
    });

    // Spec icons: capture ALL into specs, then pull known fields out
    $(".product-spec-icon-container").each((_, el) => {
      const name = $(el).find(".product-spec-icon-name").text().trim().toLowerCase();
      const img = $(el).find("img");
      const value = img.attr("alt")?.trim() || "";
      if (!name || !value) return;

      specs[name] = value;

      if (name === "ride style" || name === "riding style") category = value;
      else if (name === "profile") profile = value;
      else if (name === "shape") shape = value;
      else if (name === "flex") flex = value;
      else if (name === "ability level" || name === "rider level" || name === "level") abilityLevel = value;
    });

    // Spec detail lists (e.g. "Terrain: All-Mountain", "Ability Level: Intermediate")
    $(".product-spec-list li, .product-specs li, .product-details li").each((_, el) => {
      const text = $(el).text().trim();
      const parts = text.split(/:\s*/);
      if (parts.length === 2 && parts[0] && parts[1]) {
        const key = parts[0].toLowerCase().trim();
        const val = parts[1].trim();
        if (!specs[key]) specs[key] = val;
        if ((key === "ability level" || key === "rider level") && !abilityLevel) abilityLevel = val;
        if (key === "terrain" && !category) category = val;
      }
    });

    // Parse product.init() JS for sizes, prices, and stock
    // Format: product.init(id, [[size, ?, salePrice, origPrice, stock, [locations]], ...], {...})
    const scriptContent = $("script")
      .map((_, el) => $(el).html())
      .get()
      .join("\n");

    const initIdx = scriptContent.indexOf("product.init(");
    if (initIdx >= 0) {
      try {
        // Find the size array using bracket counting
        const firstBracket = scriptContent.indexOf("[", initIdx);
        if (firstBracket >= 0) {
          let depth = 0;
          let end = firstBracket;
          for (let i = firstBracket; i < Math.min(firstBracket + 10000, scriptContent.length); i++) {
            if (scriptContent[i] === "[") depth++;
            else if (scriptContent[i] === "]") {
              depth--;
              if (depth === 0) { end = i + 1; break; }
            }
          }
          const raw = scriptContent.slice(firstBracket, end);
          const sizeData = JSON.parse(raw);
          for (const entry of sizeData) {
            if (!Array.isArray(entry) || entry.length < 5) continue;
            const sizeStr = String(entry[0]);
            const sizeCm = parseFloat(sizeStr);
            const entrySale = parsePrice(String(entry[2]));
            const entryOrig = parsePrice(String(entry[3]));
            const stock = parseInt(String(entry[4])) || 0;

            if (!isNaN(sizeCm) && sizeCm >= 100 && sizeCm <= 200 && entrySale) {
              sizes.push({
                cm: sizeCm,
                salePrice: entrySale,
                originalPrice: entryOrig || 0,
                stock,
              });
            }
          }
        }
      } catch { /* skip */ }
    }

    // Description
    const descEl = $(".product-description-text, .product-description").first();
    if (descEl.length) {
      description = descEl.text().trim().slice(0, 1000);
    }

    // Year from model name
    if (model) {
      const yearMatch = model.match(/\b(20[1-2]\d)\b/);
      if (yearMatch) year = parseInt(yearMatch[1]);
    }

    // If we have size data, return one board per in-stock size
    if (sizes.length > 0) {
      const inStock = sizes.filter((s) => s.stock > 0);
      const available = inStock.length > 0 ? inStock : sizes;
      const results: RawBoard[] = [];

      for (const s of available) {
        results.push({
          retailer: "tactics",
          region: Region.US,
          url: partial.url,
          imageUrl,
          brand: brand ? normalizeBrand(brand) : "Unknown",
          model: model || "Unknown",
          year,
          lengthCm: s.cm,
          widthMm: undefined,
          flex,
          profile,
          shape,
          category,
          abilityLevel,
          originalPrice: s.originalPrice || originalPrice,
          salePrice: s.salePrice || salePrice || 0,
          currency: Currency.USD,
          availability: s.stock > 0 ? "in_stock" : "out_of_stock",
          description,
          specs,
          scrapedAt: new Date().toISOString(),
          stockCount: s.stock,
        });
      }

      return results;
    }

    if (!salePrice) return [];

    return [{
      retailer: "tactics",
      region: Region.US,
      url: partial.url,
      imageUrl,
      brand: brand ? normalizeBrand(brand) : "Unknown",
      model: model || "Unknown",
      year,
      lengthCm: undefined,
      widthMm: undefined,
      flex,
      profile,
      shape,
      category,
      abilityLevel,
      originalPrice,
      salePrice,
      currency: Currency.USD,
      availability,
      description,
      specs,
      scrapedAt: new Date().toISOString(),
    }];
  } catch (error) {
    console.error(
      `[tactics] Failed to fetch details for ${partial.url}:`,
      error
    );
    return [];
  }
}

export const tactics: RetailerModule = {
  name: "tactics",
  region: Region.US,
  baseUrl: TACTICS_BASE_URL,

  async searchBoards(_scope: ScrapeScope): Promise<RawBoard[]> {
    const searchUrl = buildSearchUrl();
    console.log(`[tactics] Fetching search results from ${searchUrl}`);

    const html = await fetchPage(searchUrl);
    const partialBoards = parseProductCards(html);
    console.log(`[tactics] Found ${partialBoards.length} product cards`);

    console.log(`[tactics] Fetching details for ${partialBoards.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of partialBoards) {
      const results = await fetchBoardDetails(partial);
      boards.push(...results);
    }

    console.log(`[tactics] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
