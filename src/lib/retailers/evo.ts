import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, ScrapeScope, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPageWithBrowser, parsePrice, parseLengthCm, normalizeBrand, delay } from "../scraping/utils";

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

async function fetchBoardDetails(partial: Partial<RawBoard>): Promise<RawBoard | RawBoard[] | null> {
  if (!partial.url) return null;

  try {
    await delay(config.scrapeDelayMs);
    const html = await fetchPageWithBrowser(partial.url);
    const $ = cheerio.load(html);

    let brand = partial.brand;
    let model = partial.model;
    let salePrice = partial.salePrice;
    let originalPrice = partial.originalPrice;
    let imageUrl = partial.imageUrl;
    let description: string | undefined;
    const specs: Record<string, string> = {};

    // JSON-LD for brand, name, price, availability
    let availability: string | undefined;
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
          if (offer?.availability?.includes("InStock")) availability = "in_stock";
          else if (offer?.availability?.includes("OutOfStock")) availability = "out_of_stock";
        }
      } catch { /* skip */ }
    });

    // Evo spec list items: .pdp-spec-list-item with title/description pairs
    $(".pdp-spec-list-item").each((_, el) => {
      const title = $(el).find(".pdp-spec-list-title strong").text().trim().replace(/:$/, "");
      const value = $(el).find(".pdp-spec-list-description").text().trim();
      if (title && value) {
        specs[title.toLowerCase()] = value;
      }
    });

    // Evo feature sections: .pdp-feature with h5 title and description
    $(".pdp-feature").each((_, el) => {
      const title = $(el).find("h5").text().trim();
      const value = $(el).find(".pdp-feature-description em").text().trim()
        || $(el).find(".pdp-feature-description").text().trim();
      if (title && value && !specs[title.toLowerCase()]) {
        specs[title.toLowerCase()] = value;
      }
    });

    // Also try table rows
    $("table tr").each((_, row) => {
      const cells = $(row).find("td, th");
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim().toLowerCase();
        const val = $(cells[1]).text().trim();
        if (key && val && !specs[key]) specs[key] = val;
      }
    });

    // Map spec fields
    const flex = specs["flex rating"] || specs["flex"] || specs["stiffness"];
    const profile = specs["rocker type"] || specs["profile"] || specs["bend"] || specs["camber type"];
    const shape = specs["shape"] || specs["shape type"];
    const category = specs["terrain"] || specs["best for"] || specs["riding style"];
    const abilityLevel = specs["ability level"] || specs["rider level"] || specs["skill level"];

    let lengthCm: number | undefined;
    const lengthSpec = specs["size"] || specs["length"] || specs["board length"];
    if (lengthSpec) lengthCm = parseLengthCm(lengthSpec) || undefined;
    if (!lengthCm && partial.url) {
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

    // PowerReviews rating/review count
    const ratingEl = $(".pr-snippet-rating-decimal").first();
    if (ratingEl.length) {
      const ratingText = ratingEl.text().trim();
      if (ratingText) specs["rating"] = ratingText;
    }
    const reviewCountEl = $(".pr-snippet-review-count").first();
    if (reviewCountEl.length) {
      const countText = reviewCountEl.text().trim();
      const countMatch = countText.match(/(\d+)/);
      if (countMatch) specs["review count"] = countMatch[1];
    }

    if (!salePrice) return null;

    // Description fallback
    if (!description) {
      const descEl = $(".pdp-description, .product-description").first();
      if (descEl.length) description = descEl.text().trim().slice(0, 1000);
    }

    // Parse size chart from .spec-table for per-size widthMm and rider weight
    const sizeChart: { sizeCm: number; widthMm?: number; riderWeight?: string }[] = [];
    const specTable = $(".spec-table").first();
    if (specTable.length) {
      const rows = specTable.find("tr");
      // Build column-indexed data: first row has size labels
      const sizeLabels: string[] = [];
      const rowData: { label: string; values: string[] }[] = [];

      rows.each((i, row) => {
        const cells = $(row).find("td, th");
        if (i === 0) {
          // Size row — skip first cell (header), rest are sizes
          cells.each((j, cell) => {
            if (j === 0) return;
            sizeLabels.push($(cell).text().trim());
          });
        } else {
          const label = $(cells[0]).text().trim().toLowerCase();
          const values: string[] = [];
          cells.each((j, cell) => {
            if (j === 0) return;
            values.push($(cell).text().trim());
          });
          rowData.push({ label, values });
        }
      });

      // Find waist width and rider weight rows
      const waistRow = rowData.find(r => r.label.includes("waist width") || r.label.includes("waist"));
      const weightRow = rowData.find(r => r.label.includes("rider weight") || r.label.includes("weight range"));

      for (let i = 0; i < sizeLabels.length; i++) {
        const sizeLabel = sizeLabels[i];
        const parsed = parseLengthCm(sizeLabel);
        if (!parsed) continue;

        const width = waistRow?.values[i];
        const weight = weightRow?.values[i];
        const widthVal = width ? parseFloat(width) : undefined;

        sizeChart.push({
          sizeCm: parsed,
          widthMm: widthVal && !isNaN(widthVal) ? widthVal : undefined,
          riderWeight: weight || undefined,
        });
      }
    }

    // If we have a size chart with multiple entries, return one board per size
    if (sizeChart.length > 1) {
      const results: RawBoard[] = [];
      for (const entry of sizeChart) {
        const sizeSpecs = { ...specs };
        if (entry.riderWeight) sizeSpecs["rider weight"] = entry.riderWeight;

        results.push({
          retailer: "evo",
          region: Region.US,
          url: partial.url,
          imageUrl,
          brand: brand ? normalizeBrand(brand) : "Unknown",
          model: model || "Unknown",
          year: undefined,
          lengthCm: entry.sizeCm,
          widthMm: entry.widthMm,
          flex,
          profile,
          shape,
          category,
          abilityLevel,
          originalPrice,
          salePrice,
          currency: Currency.USD,
          availability: availability || "in_stock",
          description: description?.slice(0, 1000),
          specs: sizeSpecs,
          scrapedAt: new Date().toISOString(),
        });
      }
      return results;
    }

    // Single board return (no size chart or only one entry)
    if (sizeChart.length === 1) {
      lengthCm = lengthCm || sizeChart[0].sizeCm;
      widthMm = widthMm || sizeChart[0].widthMm;
      if (sizeChart[0].riderWeight) specs["rider weight"] = sizeChart[0].riderWeight;
    }

    return {
      retailer: "evo",
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
      abilityLevel,
      originalPrice,
      salePrice,
      currency: Currency.USD,
      availability: availability || "in_stock",
      description: description?.slice(0, 1000),
      specs,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[evo] Failed to fetch details for ${partial.url}:`, error);
    return null;
  }
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

    const withUrls = partialBoards.filter((p) => p.salePrice && p.url);
    console.log(`[evo] Fetching details for ${withUrls.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of withUrls) {
      const result = await fetchBoardDetails(partial);
      if (result) {
        if (Array.isArray(result)) boards.push(...result);
        else boards.push(result);
      }
    }

    console.log(`[evo] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
