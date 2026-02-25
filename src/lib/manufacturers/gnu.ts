import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const GNU_BASE = "https://www.gnu.com";
const CATALOG_URLS = [
  `${GNU_BASE}/snowboards/mens`,
  `${GNU_BASE}/snowboards/womens`,
];

/**
 * GNU scraper.
 * Server-rendered Magento store (Mervin Mfg — same platform as Lib Tech).
 * Plain fetch + cheerio, no browser needed.
 */
export const gnu: ManufacturerModule = {
  brand: "GNU",
  baseUrl: GNU_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
    console.log("[gnu] Scraping manufacturer specs...");
    const specs: ManufacturerSpec[] = [];

    // Scrape both men's and women's catalog pages
    const productLinks: { url: string; name: string; price: number | null; gender: string }[] =
      [];
    const seenUrls = new Set<string>();

    for (const catalogUrl of CATALOG_URLS) {
      const catalogGender = catalogUrl.includes("/womens") ? "womens" : "unisex";
      try {
        const html = await fetchPage(catalogUrl, { timeoutMs: 20000 });
        const $ = cheerio.load(html);

        $(
          '.product-item, .product-card, [class*="product-item"], li.item'
        ).each((_, el) => {
          const $el = $(el);
          const link = $el.find("a[href]").first();
          const href = link.attr("href");
          if (!href || !href.includes("gnu.com")) return;

          const fullUrl = href.startsWith("http")
            ? href
            : `${GNU_BASE}${href}`;
          if (seenUrls.has(fullUrl)) return;
          seenUrls.add(fullUrl);

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
              url: fullUrl,
              name,
              price: price && !isNaN(price) ? price : null,
              gender: catalogGender,
            });
          }
        });
      } catch (err) {
        console.warn(
          `[gnu] Failed to scrape catalog ${catalogUrl}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    console.log(`[gnu] Found ${productLinks.length} product links`);

    // Fetch detail pages with limited concurrency
    const CONCURRENCY = 3;
    for (let i = 0; i < productLinks.length; i += CONCURRENCY) {
      const batch = productLinks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (product) => {
          try {
            const spec = await scrapeDetailPage(
              product.url,
              product.name,
              product.price
            );
            spec.gender = product.gender;
            return spec;
          } catch (err) {
            console.warn(
              `[gnu] Failed to scrape ${product.name}:`,
              err instanceof Error ? err.message : err
            );
            return {
              brand: "GNU",
              model: cleanModelName(product.name),
              year: null,
              flex: null,
              profile: null,
              shape: null,
              category: null,
              gender: product.gender,
              msrpUsd: product.price,
              sourceUrl: product.url,
              extras: {},
            };
          }
        })
      );
      specs.push(...results);
    }

    console.log(`[gnu] Finished scraping ${specs.length} boards`);
    return specs;
  },
};

function parseDetailHtml(
  html: string,
  url: string,
  fallbackName: string,
  fallbackPrice: number | null
): ManufacturerSpec {
  const $ = cheerio.load(html);

  const name =
    $("h1.page-title, h1[class*='product-name'], h1").first().text().trim() ||
    fallbackName;

  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;
  let msrp = fallbackPrice;
  const extras: Record<string, string> = {};

  // GNU uses the same columnar spec table as Lib Tech.
  // Flex, terrain, and ability level are extracted from infographic
  // pixel analysis instead (see task 12).
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table)
      .find("th")
      .each((__, th) => {
        headers.push($(th).text().toLowerCase().trim());
      });

    const firstRow: string[] = [];
    $(table)
      .find("tbody tr")
      .first()
      .find("td")
      .each((__, td) => {
        firstRow.push($(td).text().trim());
      });

    for (let i = 0; i < headers.length && i < firstRow.length; i++) {
      if (headers[i] && firstRow[i]) {
        extras[headers[i]] = firstRow[i];
      }
    }
  });

  // Extract category and shape from [itemprop="description"] first line
  // GNU format: "FREESTYLE / PARK / TWIN SHAPE" or "ALL MOUNTAIN / DIRECTIONAL SHAPE"
  // or "FREESTYLE / ALL MOUNTAIN / ASYM TWIN SHAPE" or "FREESTYLE / ALL MOUNTAIN - TWIN"
  const descriptionDiv = $('[itemprop="description"]').first();
  const descText = descriptionDiv.text().trim();
  const firstLine = descText.split("\n")[0].trim();

  if (firstLine && /^[A-Z\s\/\-!]+$/.test(firstLine) && !firstLine.includes("SPECIAL RELEASE")) {
    // First try dash-separated format (same as Lib Tech)
    const dashParts = firstLine.split(/\s+-\s+/);
    if (dashParts.length >= 2) {
      category = mapGnuCategory(dashParts[0].trim());
      shape = mapGnuShape(dashParts.slice(1).join(" - ").trim());
    } else {
      // GNU slash-separated format: shape term is last, categories before it
      const slashParts = firstLine.split(/\s*\/\s*/);
      if (slashParts.length >= 2) {
        const lastPart = slashParts[slashParts.length - 1].trim();
        if (isGnuShapeTerm(lastPart)) {
          shape = mapGnuShape(lastPart);
          category = mapGnuCategory(slashParts.slice(0, -1).join(" / "));
        } else {
          category = mapGnuCategory(firstLine);
        }
      } else {
        category = mapGnuCategory(firstLine);
      }
    }
  }

  // Extract profile from contour image alt text
  // e.g. "GNU C2e Snowboard Technology" → "C2e"
  // e.g. "GNU C3 Camber Snowboard Technology" → "C3 Camber"
  // e.g. "GNU Original Banana Technology" → "Original Banana"
  if (!profile) {
    const contourImg = $("img[alt*='Technology'], img[alt*='Contour']").first();
    const contourAlt = contourImg.attr("alt") || "";
    const techMatch = contourAlt.match(/GNU (.+?) (?:Snowboard |SNowboard )?(?:Technology|Contour)/i);
    if (techMatch) {
      profile = techMatch[1].trim();
    } else {
      // Fallback to src-based detection
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

  return {
    brand: "GNU",
    model: cleanModelName(name),
    year: null,
    flex: null,
    profile,
    shape,
    category,
    msrpUsd: msrp && !isNaN(msrp) ? msrp : null,
    sourceUrl: url,
    extras,
  };
}

function isGnuShapeTerm(s: string): boolean {
  const lower = s.toLowerCase().replace(/\s*shape$/, "");
  return lower.includes("twin") || lower.includes("directional") ||
    lower === "tapered" || lower.includes("asymmetric") || lower.includes("splitboard");
}

function mapGnuCategory(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("all mountain") && lower.includes("freestyle")) return "freestyle/all-mountain";
  if (lower.includes("all mountain") && lower.includes("freeride")) return "all-mountain/freeride";
  if (lower.includes("all mountain")) return "all-mountain";
  if (lower.includes("freestyle") && lower.includes("park")) return "park";
  if (lower.includes("freestyle")) return "freestyle";
  if (lower.includes("freeride")) return "freeride";
  if (lower.includes("park")) return "park";
  if (lower.includes("powder")) return "powder";
  return raw;
}

function mapGnuShape(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s*shape$/, "");
  if (lower === "twin" || lower.includes("true twin")) return "true twin";
  if (lower.includes("asym twin") || lower.includes("asymmetric twin")) return "asymmetric twin";
  if (lower.includes("directional twin")) return "directional twin";
  if (lower.includes("directional splitboard")) return "directional";
  if (lower.includes("directional")) return "directional";
  if (lower.includes("tapered")) return "tapered";
  return raw.toLowerCase().replace(/\s*shape$/, "");
}

async function scrapeDetailPage(
  url: string,
  fallbackName: string,
  fallbackPrice: number | null
): Promise<ManufacturerSpec> {
  const html = await fetchPage(url, { timeoutMs: 15000 });
  return parseDetailHtml(html, url, fallbackName, fallbackPrice);
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^GNU\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}

// Test exports
export { cleanModelName, parseDetailHtml, mapGnuCategory, mapGnuShape };
