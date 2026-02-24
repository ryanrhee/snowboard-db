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
    const productLinks: { url: string; name: string; price: number | null }[] =
      [];
    const seenUrls = new Set<string>();

    for (const catalogUrl of CATALOG_URLS) {
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
            return await scrapeDetailPage(
              product.url,
              product.name,
              product.price
            );
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

  let flex: string | null = null;
  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;
  let msrp = fallbackPrice;
  const extras: Record<string, string> = {};

  // GNU uses the same columnar spec table as Lib Tech
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table)
      .find("th")
      .each((__, th) => {
        headers.push($(th).text().toLowerCase().trim());
      });

    const flexCol = headers.findIndex((h) => h.includes("flex"));

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

    if (flexCol >= 0 && firstRow[flexCol]) {
      flex = firstRow[flexCol];
    }
  });

  // Extract profile and shape from description text
  const description = $(
    ".product.attribute.description .value, .product-description"
  ).text();
  const descLower = description?.toLowerCase() || "";
  const fullText = $.text().toLowerCase();
  const searchText = descLower || fullText;

  if (!profile) {
    const profileText = descLower || fullText;
    // GNU profile terms (same Mervin tech as Lib Tech)
    if (profileText.includes("c2x")) profile = "C2x";
    else if (profileText.includes("c2e")) profile = "C2e";
    else if (/\bc2\b/.test(profileText)) profile = "C2";
    else if (/\bc3\b/.test(profileText)) profile = "C3";
    else if (
      profileText.includes("banana tech") ||
      /\bbtx\b/.test(profileText)
    )
      profile = "BTX";
    else if (profileText.includes("b.c.")) profile = "B.C.";
  }

  // Check contour image filenames
  if (!profile) {
    const contourImg = $("img[src*='Contour'], img[alt*='Contour']").first();
    const contourSrc = (
      contourImg.attr("src") ||
      contourImg.attr("alt") ||
      ""
    ).toLowerCase();
    if (contourSrc.includes("c2x")) profile = "C2x";
    else if (contourSrc.includes("c2e")) profile = "C2e";
    else if (contourSrc.includes("c2")) profile = "C2";
    else if (contourSrc.includes("c3")) profile = "C3";
    else if (contourSrc.includes("btx") || contourSrc.includes("banana"))
      profile = "BTX";
  }

  if (!shape) {
    if (
      searchText.includes("true twin") ||
      searchText.includes("perfectly twin")
    )
      shape = "true twin";
    else if (searchText.includes("directional twin"))
      shape = "directional twin";
    else if (searchText.includes("directional")) shape = "directional";
  }

  if (!category) {
    if (
      searchText.includes("all-mountain") ||
      searchText.includes("all mountain")
    )
      category = "all-mountain";
    else if (
      searchText.includes("freestyle") ||
      searchText.includes("jib")
    )
      category = "freestyle";
    else if (
      searchText.includes("freeride") ||
      searchText.includes("backcountry")
    )
      category = "freeride";
    else if (
      searchText.includes("powder") ||
      searchText.includes("float")
    )
      category = "powder";
    else if (searchText.includes("park") || searchText.includes("pipe"))
      category = "park";
  }

  // Ability level from description
  if (descLower && !descLower.includes("all ability level")) {
    if (descLower.includes("beginner") && descLower.includes("intermediate")) {
      extras["ability level"] = "beginner-intermediate";
    } else if (
      descLower.includes("intermediate") &&
      descLower.includes("advanced")
    ) {
      extras["ability level"] = "intermediate-advanced";
    } else if (
      descLower.includes("beginner") ||
      descLower.includes("entry level")
    ) {
      extras["ability level"] = "beginner";
    } else if (descLower.includes("advanced")) {
      extras["ability level"] = "advanced";
    }
  }

  // Infer rider level from infographic image (same system as Lib Tech)
  const infographicImg = $("img[src*='terrain'][src*='riderlevel']").first();
  const infographicSrc = (infographicImg.attr("src") || "").toLowerCase();
  if (infographicSrc && !extras["ability level"]) {
    const level = inferRiderLevelFromInfographic(infographicSrc);
    if (level) extras["ability level"] = level;
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
    flex,
    profile,
    shape,
    category,
    msrpUsd: msrp && !isNaN(msrp) ? msrp : null,
    sourceUrl: url,
    extras,
  };
}

async function scrapeDetailPage(
  url: string,
  fallbackName: string,
  fallbackPrice: number | null
): Promise<ManufacturerSpec> {
  const html = await fetchPage(url, { timeoutMs: 15000 });
  return parseDetailHtml(html, url, fallbackName, fallbackPrice);
}

/**
 * Infer rider level from GNU infographic image filename.
 * GNU uses the same Mervin infographic system as Lib Tech.
 * Mapping built from GNU product page visual analysis.
 */
function inferRiderLevelFromInfographic(src: string): string | null {
  const lower = src.toLowerCase();

  // Intermediate-Advanced boards
  const intAdv = [
    "hyper",
    "pro-choice",
    "riders-choice",
  ];
  for (const slug of intAdv) {
    if (lower.includes(slug)) return "intermediate-advanced";
  }

  // All-levels / Beginner-Advanced boards
  const allLevels = [
    "headspace",
    "money",
    "antigravity",
    "ladies-choice",
    "b-nice",
  ];
  for (const slug of allLevels) {
    if (lower.includes(slug)) return "beginner-advanced";
  }

  // Beginner-Intermediate boards
  const begInt = [
    "frosting",
    "gloss",
    "young-money",
    "klassy",
    "forest-bailey-head",
  ];
  for (const slug of begInt) {
    if (lower.includes(slug)) return "beginner-intermediate";
  }

  return null;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^GNU\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}

// Test exports
export { inferRiderLevelFromInfographic, cleanModelName, parseDetailHtml };
