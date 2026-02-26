import * as cheerio from "cheerio";
import { ScraperModule, ScrapedBoard, ScrapedListing } from "../scrapers/types";
import { ManufacturerSpec, adaptManufacturerOutput } from "../scrapers/adapters";
import { fetchPage } from "../scraping/utils";
import { Currency } from "../types";
import {
  analyzeInfographic,
  mapBarToAbilityLevel,
  mapBarToTerrainScores,
  mapBarToFlex,
} from "./lib-tech-infographic";

const LIB_TECH_BASE = "https://www.lib-tech.com";
const CATALOG_URL = `${LIB_TECH_BASE}/snowboards`;

/**
 * Lib Tech scraper.
 * Server-rendered Magento store — plain fetch + cheerio.
 * Profile terms (c2, c2x, c3, btx) are already in our normalization maps.
 */
export const libTech: ScraperModule = {
  name: "manufacturer:lib tech",
  sourceType: "manufacturer",
  baseUrl: LIB_TECH_BASE,

  async scrape(): Promise<ScrapedBoard[]> {
    console.log("[lib-tech] Scraping manufacturer specs...");
    const specs: ManufacturerSpec[] = [];

    const html = await fetchPage(CATALOG_URL, { timeoutMs: 20000 });
    const $ = cheerio.load(html);

    // Collect product links from the listing page
    const productLinks: { url: string; name: string; price: number | null }[] = [];

    $(
      '.product-item, .product-card, [class*="product-item"], li.item'
    ).each((_, el) => {
      const $el = $(el);
      const link = $el.find("a[href]").first();
      const href = link.attr("href");
      if (!href || !href.includes("lib-tech.com")) return;

      const name = $el
        .find(
          '.product-item-name, .product-name, [class*="product-name"], .product-item-link'
        )
        .text()
        .trim();

      const priceText = $el
        .find('[class*="price"], .price')
        .first()
        .text()
        .trim();
      const price = priceText
        ? parseFloat(priceText.replace(/[^0-9.]/g, ""))
        : null;

      if (name) {
        productLinks.push({
          url: href.startsWith("http") ? href : `${LIB_TECH_BASE}${href}`,
          name,
          price: price && !isNaN(price) ? price : null,
        });
      }
    });

    console.log(`[lib-tech] Found ${productLinks.length} product links`);

    // Fetch detail pages with limited concurrency
    const CONCURRENCY = 3;
    for (let i = 0; i < productLinks.length; i += CONCURRENCY) {
      const batch = productLinks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (product) => {
          try {
            return await scrapeDetailPage(product.url, product.name, product.price);
          } catch (err) {
            console.warn(
              `[lib-tech] Failed to scrape ${product.name}:`,
              err instanceof Error ? err.message : err
            );
            // Return a basic spec with just name and price
            return {
              brand: "Lib Tech",
              model: cleanModelName(product.name),
              year: null,
              flex: null,
              profile: null,
              shape: null,
              category: null,
              gender: deriveGender(product.name, "") ?? undefined,
              msrpUsd: product.price,
              sourceUrl: product.url,
              extras: {},
            };
          }
        })
      );
      specs.push(...results);
    }

    console.log(`[lib-tech] Finished scraping ${specs.length} boards`);
    return adaptManufacturerOutput(specs, "Lib Tech");
  },
};

async function parseDetailHtml(
  html: string,
  url: string,
  fallbackName: string,
  fallbackPrice: number | null
): Promise<ManufacturerSpec> {
  const $ = cheerio.load(html);

  const name =
    $("h1.page-title, h1[class*='product-name'], h1").first().text().trim() ||
    fallbackName;

  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;
  let msrp = fallbackPrice;
  const extras: Record<string, string> = {};

  // Lib Tech uses a columnar spec table with headers like:
  //   Size | Contact Length | ... | Flex (10 = Firm) | Weight Range
  // Capture ALL columns into extras (flex, terrain, ability level are
  // extracted from infographic pixel analysis instead — see task 12).
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("th").each((__, th) => { headers.push($(th).text().toLowerCase().trim()); });

    // Read the first data row for representative values
    const firstRow: string[] = [];
    $(table).find("tbody tr").first().find("td").each((__, td) => { firstRow.push($(td).text().trim()); });

    // Capture all columns into extras
    for (let i = 0; i < headers.length && i < firstRow.length; i++) {
      if (headers[i] && firstRow[i]) {
        extras[headers[i]] = firstRow[i];
      }
    }
  });

  // Extract category and shape from [itemprop="description"] first line
  // Format: "ALL MOUNTAIN - DIRECTIONAL" or "FREESTYLE / ALL MOUNTAIN - TWIN"
  const descriptionDiv = $('[itemprop="description"]').first();
  const descText = descriptionDiv.text().trim();
  const firstLine = descText.split("\n")[0].trim();

  if (firstLine && /^[A-Z\s\/\-]+$/.test(firstLine)) {
    // Split on " - " to get category (left) and shape (right)
    const dashParts = firstLine.split(/\s+-\s+/);
    if (dashParts.length >= 2) {
      const categoryPart = dashParts[0].trim();
      const shapePart = dashParts.slice(1).join(" - ").trim();
      category = mapLibTechCategory(categoryPart);
      shape = mapLibTechShape(shapePart);
    } else {
      // No dash separator — try splitting on last "/" for shape
      // e.g. "ALL MOUNTAIN / DIRECTIONAL" (mayhem-libzilla format)
      const slashParts = firstLine.split(/\s*\/\s*/);
      if (slashParts.length >= 2) {
        const lastPart = slashParts[slashParts.length - 1].trim();
        if (isShapeTerm(lastPart)) {
          shape = mapLibTechShape(lastPart);
          category = mapLibTechCategory(slashParts.slice(0, -1).join(" / "));
        } else {
          category = mapLibTechCategory(firstLine);
        }
      } else {
        category = mapLibTechCategory(firstLine);
      }
    }
  }

  // Extract profile from contour image alt text or src filename.
  // Lib Tech's contour/profile images encode the profile type in the alt text
  // (e.g. "Lib Tech Directional C2X Snowboard Contour") or filename (e.g.
  // "c2x.png"). Regex on these strings is the correct approach — the image
  // metadata IS the structured data source for profile information.
  if (!profile) {
    const contourImg = $("img[alt*='Contour']").first();
    const contourAlt = contourImg.attr("alt") || "";
    const contourMatch = contourAlt.match(/Lib Tech (.+?) Snowboard Contour/i);
    if (contourMatch) {
      profile = contourMatch[1].trim();
    } else {
      // Try src-based fallback
      const contourSrc = (contourImg.attr("src") || "").toLowerCase();
      if (contourSrc) {
        if (contourSrc.includes("c2x")) profile = "C2x";
        else if (contourSrc.includes("c2e")) profile = "C2e";
        else if (contourSrc.includes("c2")) profile = "C2";
        else if (contourSrc.includes("c3")) profile = "C3";
        else if (contourSrc.includes("btx") || contourSrc.includes("banana")) profile = "BTX";
      }
    }
  }

  // Price from JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      if (data["@type"] === "Product" && data.offers) {
        const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
        if (offer?.price) msrp = parseFloat(offer.price);
      }
    } catch {
      /* skip */
    }
  });

  // Extract per-size listings from Magento's jsonConfig JS variable
  const listings = extractMagentoListings(html, url, msrp ?? undefined);

  // Extract flex, ability level, and terrain from infographic image
  let flex: string | null = null;
  const infographicImg = $("img").filter((_, el) => {
    const src = ($(el).attr("src") || "").toLowerCase();
    return src.includes("terrain") && src.includes("riderlevel");
  }).first();
  const infographicSrc = infographicImg.attr("src");

  if (infographicSrc) {
    try {
      const imgUrl = infographicSrc.startsWith("http")
        ? infographicSrc
        : `${LIB_TECH_BASE}${infographicSrc}`;
      const resp = await fetch(imgUrl);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        const analysis = await analyzeInfographic(buf);

        // Ability level from rider level bar
        extras["ability level"] = mapBarToAbilityLevel(
          analysis.riderLevel.colorStartPct,
          analysis.riderLevel.colorEndPct
        );

        // Terrain scores from terrain bar
        const terrain = mapBarToTerrainScores(
          analysis.terrain.colorStartPct,
          analysis.terrain.colorEndPct
        );
        extras["terrain_piste"] = String(terrain.piste);
        extras["terrain_powder"] = String(terrain.powder);
        extras["terrain_park"] = String(terrain.park);
        extras["terrain_freeride"] = String(terrain.freeride);
        extras["terrain_freestyle"] = String(terrain.freestyle);

        // Flex from flex bar
        flex = String(mapBarToFlex(
          analysis.flex.colorStartPct,
          analysis.flex.colorEndPct
        ));
      }
    } catch (err) {
      console.warn(
        `[lib-tech] Failed to analyze infographic for ${fallbackName}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return {
    brand: "Lib Tech",
    model: cleanModelName(name),
    year: null,
    flex,
    profile,
    shape,
    category,
    gender: deriveGender(name, descText?.toLowerCase() || "") ?? undefined,
    msrpUsd: msrp && !isNaN(msrp) ? msrp : null,
    sourceUrl: url,
    extras,
    listings,
  };
}

/**
 * Extract per-size listings from the spec table.
 * Lib Tech uses simple (non-configurable) Magento products with a single price.
 * Size data comes from the spec table rows — each row is a size variant.
 * All sizes share the same price (from JSON-LD or page price).
 *
 * @param jsonLdPrice - Price already extracted from JSON-LD in parseDetailHtml,
 *   passed through to avoid re-parsing the same script tags.
 */
function extractMagentoListings(html: string, productUrl: string, jsonLdPrice?: number): ScrapedListing[] {
  const listings: ScrapedListing[] = [];
  const $ = cheerio.load(html);

  // Prefer JSON-LD price already extracted by parseDetailHtml
  let price = jsonLdPrice ?? 0;
  let oldPrice: number | undefined;

  // If no price from JSON-LD, try extracting here as fallback
  if (price === 0) {
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data["@type"] === "Product" && data.offers) {
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          if (offer?.price) price = parseFloat(offer.price);
        }
      } catch { /* skip */ }
    });
  }

  // Check for old/special price via Magento's inline pricing JSON.
  // These regex patterns match Magento's require.js config object which embeds
  // pricing as {"oldPrice":{"amount":N},"finalPrice":{"amount":N}}.
  // There is no structured DOM alternative — the prices live in inline JS.
  const oldPriceMatch = html.match(/"oldPrice"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/);
  const finalPriceMatch = html.match(/"finalPrice"\s*:\s*\{\s*"amount"\s*:\s*([\d.]+)/);
  if (finalPriceMatch) {
    const finalAmt = parseFloat(finalPriceMatch[1]);
    if (finalAmt > 0) price = finalAmt;
  }
  if (oldPriceMatch) {
    const oldAmt = parseFloat(oldPriceMatch[1]);
    if (oldAmt > price) oldPrice = oldAmt;
  }

  if (price === 0) return listings;

  // Parse sizes from spec table — look for the "size" column
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("th").each((__, th) => {
      headers.push($(th).text().toLowerCase().trim());
    });

    const sizeIdx = headers.findIndex((h) => h === "size" || h.startsWith("size") || h === "length" || h === "board size");
    if (sizeIdx < 0) return;

    const now = new Date().toISOString();

    $(table).find("tbody tr").each((__, tr) => {
      const cells: string[] = [];
      $(tr).find("td").each((___, td) => {
        cells.push($(td).text().trim());
      });

      if (sizeIdx >= cells.length) return;
      const sizeLabel = cells[sizeIdx];
      const isBGrade = /b-?\s*grade/i.test(sizeLabel);
      const sizeStr = sizeLabel.replace(/\s*-?\s*b-?\s*grade/i, "").trim();
      const sizeMatch = sizeStr.match(/(\d+(?:\.\d+)?)\s*([Ww]|UW)?/);
      if (!sizeMatch) return;

      const lengthCm = parseFloat(sizeMatch[1]);

      listings.push({
        url: productUrl,
        lengthCm,
        originalPrice: oldPrice,
        salePrice: price,
        currency: Currency.USD,
        availability: "in_stock", // Lib Tech doesn't expose per-size stock
        condition: isBGrade ? "blemished" : "new",
        scrapedAt: now,
      });
    });
  });

  return listings;
}

function isShapeTerm(s: string): boolean {
  const lower = s.toLowerCase();
  return lower.includes("twin") || lower.includes("directional") ||
    lower === "tapered" || lower === "asymmetric";
}

function mapLibTechCategory(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("all mountain") && lower.includes("freestyle")) return "freestyle/all-mountain";
  if (lower.includes("all mountain") && lower.includes("freeride")) return "all-mountain/freeride";
  if (lower.includes("all mountain") && lower.includes("split")) return "all-mountain";
  if (lower.includes("all mountain")) return "all-mountain";
  if (lower.includes("freestyle") && lower.includes("park")) return "park";
  if (lower.includes("freestyle")) return "freestyle";
  if (lower.includes("freeride")) return "freeride";
  if (lower.includes("park")) return "park";
  if (lower.includes("powder")) return "powder";
  return raw;
}

function mapLibTechShape(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "twin" || lower.includes("true twin")) return "true twin";
  if (lower.includes("directional twin")) return "directional twin";
  if (lower.includes("freestyle twin")) return "true twin";
  if (lower.includes("directional")) return "directional";
  if (lower.includes("tapered")) return "tapered";
  return raw.toLowerCase();
}

async function scrapeDetailPage(
  url: string,
  fallbackName: string,
  fallbackPrice: number | null
): Promise<ManufacturerSpec> {
  const html = await fetchPage(url, { timeoutMs: 15000 });
  return parseDetailHtml(html, url, fallbackName, fallbackPrice);
}

function deriveGender(name: string, descLower: string): string | null {
  const lower = name.toLowerCase();
  if (lower.includes("women") || lower.includes("wmns") || descLower.includes("women's"))
    return "womens";
  if (lower.includes("youth") || lower.includes("kid"))
    return "kids";
  return null;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^Lib\s*Tech\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}

// Test exports
export { cleanModelName, parseDetailHtml, mapLibTechCategory, mapLibTechShape };
