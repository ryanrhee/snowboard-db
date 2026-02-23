import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const LIB_TECH_BASE = "https://www.lib-tech.com";
const CATALOG_URL = `${LIB_TECH_BASE}/snowboards`;

/**
 * Lib Tech scraper.
 * Server-rendered Magento store — plain fetch + cheerio.
 * Profile terms (c2, c2x, c3, btx) are already in our normalization maps.
 */
export const libTech: ManufacturerModule = {
  brand: "Lib Tech",
  baseUrl: LIB_TECH_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
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

  // Lib Tech uses a columnar spec table with headers like:
  //   Size | Contact Length | ... | Flex (10 = Firm) | Weight Range
  // Capture ALL columns into extras, and pull flex out specifically.
  $("table").each((_, table) => {
    const headers: string[] = [];
    $(table).find("th").each((__, th) => { headers.push($(th).text().toLowerCase().trim()); });

    const flexCol = headers.findIndex((h) => h.includes("flex"));

    // Read the first data row for representative values
    const firstRow: string[] = [];
    $(table).find("tbody tr").first().find("td").each((__, td) => { firstRow.push($(td).text().trim()); });

    // Capture all columns into extras
    for (let i = 0; i < headers.length && i < firstRow.length; i++) {
      if (headers[i] && firstRow[i]) {
        extras[headers[i]] = firstRow[i];
      }
    }

    if (flexCol >= 0 && firstRow[flexCol]) {
      flex = firstRow[flexCol];
    }
  });

  // Extract profile and shape from description text.
  // Lib Tech uses terms like "Banana Tech", "C2", "C2x", "BTX", "C3".
  const description = $(".product.attribute.description .value, .product-description").text();
  if (description && !profile) {
    const descLower = description.toLowerCase();
    // Profile detection
    if (descLower.includes("c2x")) profile = "C2x";
    else if (descLower.includes("c2e")) profile = "C2e";
    else if (descLower.includes("c2")) profile = "C2";
    else if (descLower.includes("c3")) profile = "C3";
    else if (descLower.includes("banana tech") || descLower.includes("btx")) profile = "BTX";
    else if (descLower.includes("b.c.")) profile = "B.C.";

    // Shape detection
    if (!shape) {
      if (descLower.includes("true twin") || descLower.includes("perfectly twin")) shape = "true twin";
      else if (descLower.includes("directional twin")) shape = "directional twin";
      else if (descLower.includes("directional")) shape = "directional";
    }

    // Category from description keywords
    if (!category) {
      if (descLower.includes("all-mountain") || descLower.includes("all mountain")) category = "all-mountain";
      else if (descLower.includes("freestyle") || descLower.includes("jib")) category = "freestyle";
      else if (descLower.includes("freeride") || descLower.includes("backcountry")) category = "freeride";
      else if (descLower.includes("powder") || descLower.includes("float")) category = "powder";
      else if (descLower.includes("park") || descLower.includes("pipe")) category = "park";
    }

    // Ability level from description (conservative — only clear ability phrases)
    if (!descLower.includes("all ability level")) {
      if (descLower.includes("beginner") && descLower.includes("intermediate")) {
        extras["ability level"] = "beginner-intermediate";
      } else if (descLower.includes("intermediate") && descLower.includes("advanced")) {
        extras["ability level"] = "intermediate-advanced";
      } else if (descLower.includes("beginner") || descLower.includes("entry level")) {
        extras["ability level"] = "beginner";
      } else if (descLower.includes("advanced")) {
        extras["ability level"] = "advanced";
      }
      // Note: "pro" and "expert" are NOT matched here because Lib Tech uses
      // "pro" in model names and tech descriptions (ProTech, Pro Model, etc.)
    }
  }

  // Infer rider level from the infographic image
  // Lib Tech encodes rider level visually in per-product PNG infographics;
  // no structured data exists. We extract the image URL and use a mapping
  // derived from visual analysis of the gradient ranges.
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
    brand: "Lib Tech",
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
 * Infer rider level from the Lib Tech infographic image filename.
 * Each board has a unique terrain-riderlevel-flex PNG/JPG.
 * The mapping was built by visual analysis of the gradient ranges:
 *   - Color covers Day 1→Advanced = "beginner-advanced"
 *   - Color covers Day 1→Intermediate = "beginner-intermediate"
 *   - Color covers Intermediate→Advanced = "intermediate-advanced"
 */
function inferRiderLevelFromInfographic(src: string): string | null {
  const lower = src.toLowerCase();

  // Intermediate-Advanced boards (color emphasizes right side)
  const intAdv = [
    "golden-orca", "trice-golden-orca",
    "t-rice-orca",                        // Orca family
    "apex-orca", "t-rice-apex-orca",
    "dynamo",
    "ejack-knife",
    "tr-orca-techno-split", "orca-techno-split",
  ];
  for (const slug of intAdv) {
    if (lower.includes(slug)) return "intermediate-advanced";
  }

  // All-levels / Beginner-Advanced boards (color covers full range)
  const allLevels = [
    "skate-banana",
    "t-rice-pro",
    "terrain-wrecker",
    "jamie-lynn",
    "rasman",
    "skunkape-terrain",   // Skunk Ape (BTX)
  ];
  for (const slug of allLevels) {
    if (lower.includes(slug)) return "beginner-advanced";
  }

  // Beginner-Intermediate boards (color emphasizes left/center)
  const begInt = [
    "libzilla",
    "dough-boy", "doughboy",
    "legitimizer",
    "offramp", "off-ramp",
    "mayhem-rad-ripper", "rad-ripper",
    "dpr-terrain", "dpr-",
    "coldbrew", "cold-brew",
    "lib-rig",
    "mayhem-rocket",
    "skunkapecamber", "skunk-ape-camber",
    "escalator",
  ];
  for (const slug of begInt) {
    if (lower.includes(slug)) return "beginner-intermediate";
  }

  return null;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^Lib\s*Tech\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}

// Test exports
export { inferRiderLevelFromInfographic, cleanModelName, parseDetailHtml };
