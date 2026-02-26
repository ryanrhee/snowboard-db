import * as cheerio from "cheerio";
import { ScraperModule, ScrapedBoard } from "../scrapers/types";
import { ManufacturerSpec, adaptManufacturerOutput } from "../scrapers/adapters";
import { fetchPage } from "../scraping/utils";
import { capitaToTerrain } from "../terrain";
import { extractShopifyListings } from "./shopify-utils";
import { Currency } from "../types";

const CAPITA_BASE = "https://www.capitasnowboarding.com";

/**
 * CAPiTA scraper.
 * Shopify store — try /products.json first (structured data), fall back to HTML.
 */
export const capita: ScraperModule = {
  name: "manufacturer:capita",
  sourceType: "manufacturer",
  baseUrl: CAPITA_BASE,

  async scrape(): Promise<ScrapedBoard[]> {
    console.log("[capita] Scraping manufacturer specs...");

    // Try Shopify products.json API first
    try {
      const specs = await scrapeShopifyJson();
      if (specs.length > 0) {
        console.log(`[capita] Got ${specs.length} boards from Shopify JSON`);
        return adaptManufacturerOutput(specs, "CAPiTA");
      }
    } catch (err) {
      console.warn(
        "[capita] Shopify JSON failed, falling back to HTML:",
        err instanceof Error ? err.message : err
      );
    }

    // Fallback: HTML scraping
    const specs = await scrapeHtmlCatalog();
    console.log(`[capita] Got ${specs.length} boards from HTML catalog`);
    return adaptManufacturerOutput(specs, "CAPiTA");
  },
};

interface ShopifyProduct {
  title: string;
  handle: string;
  product_type: string;
  body_html: string;
  tags: string[];
  variants: {
    title: string;
    price: string;
    compare_at_price: string | null;
    available: boolean;
  }[];
}

async function scrapeShopifyJson(): Promise<ManufacturerSpec[]> {
  const specs: ManufacturerSpec[] = [];
  let page = 1;
  const seenHandles = new Set<string>();
  const products: { product: ShopifyProduct; handle: string }[] = [];

  while (page <= 5) {
    const url = `${CAPITA_BASE}/collections/all-snowboards/products.json?page=${page}&limit=250`;
    const raw = await fetchPage(url, { timeoutMs: 15000 });

    let data: { products: ShopifyProduct[] };
    try {
      data = JSON.parse(raw);
    } catch {
      break;
    }

    if (!data.products || data.products.length === 0) break;

    for (const product of data.products) {
      if (seenHandles.has(product.handle)) continue;
      seenHandles.add(product.handle);

      // Filter to snowboards only
      const type = product.product_type?.toLowerCase() || "";
      const tags = product.tags?.map((t) => t.toLowerCase()) || [];
      const isBoard =
        type.includes("snowboard") ||
        tags.some((t) => t.includes("snowboard")) ||
        type === ""; // CAPiTA only sells boards

      if (isBoard) {
        products.push({ product, handle: product.handle });
      }
    }

    page++;
  }

  // Fetch detail pages to get hexagon chart data (concurrency 3)
  const CONCURRENCY = 3;
  const detailData = new Map<string, DetailPageData>();
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ handle }) => {
        try {
          const data = await scrapeDetailPage(handle);
          return { handle, data };
        } catch (err) {
          console.warn(`[capita] Failed to scrape detail page for ${handle}:`, err instanceof Error ? err.message : err);
          return { handle, data: null };
        }
      })
    );
    for (const { handle, data } of results) {
      if (data) detailData.set(handle, data);
    }
  }

  // Merge Shopify JSON with detail page data
  for (const { product } of products) {
    const { listings, msrpUsd } = extractShopifyListings(
      product.variants ?? [],
      `${CAPITA_BASE}/products/${product.handle}`,
      Currency.USD
    );

    const tags = product.tags?.map((t) => t.toLowerCase()) || [];

    // Merge detail page data
    const detail = detailData.get(product.handle);
    const extras: Record<string, string> = {};
    if (tags.length > 0) {
      extras["tags"] = product.tags.join(", ");
    }

    // Use detail page structured data as primary source, tags as fallback
    let profile: string | null = null;
    let shape: string | null = null;
    let category: string | null = null;
    let flex: string | null = null;

    if (detail) {
      profile = detail.profile;
      shape = detail.shape;
      category = detail.category;
      flex = detail.flex;

      // Store all hexagon values as extras
      for (const [key, value] of Object.entries(detail.hexagonScores)) {
        extras[key] = String(value);
      }
      // Use skill level for ability level
      if (detail.skillLevel !== null) {
        extras["ability level"] = skillLevelToAbility(detail.skillLevel);
      }
      // Convert hexagon scores to terrain scores
      const terrain = capitaToTerrain(detail.hexagonScores);
      if (terrain.piste !== null) extras["terrain_piste"] = String(terrain.piste);
      if (terrain.powder !== null) extras["terrain_powder"] = String(terrain.powder);
      if (terrain.park !== null) extras["terrain_park"] = String(terrain.park);
      if (terrain.freeride !== null) extras["terrain_freeride"] = String(terrain.freeride);
      if (terrain.freestyle !== null) extras["terrain_freestyle"] = String(terrain.freestyle);
    }

    // Fall back to tags if detail page didn't provide profile/shape
    if (!profile) profile = parseProfileFromTags(tags);
    if (!shape) shape = parseShapeFromTags(tags);

    // Determine gender: detail page categories > title/tags
    const gender = detail?.gender ?? deriveGender(product.title, tags);

    specs.push({
      brand: "CAPiTA",
      model: cleanModelName(product.title),
      year: null,
      flex,
      profile,
      shape,
      category,
      gender: gender ?? undefined,
      msrpUsd: msrpUsd ?? null,
      sourceUrl: `${CAPITA_BASE}/products/${product.handle}`,
      extras,
      listings,
    });
  }

  return specs;
}

interface DetailPageData {
  hexagonScores: Record<string, number>;  // e.g. { jibbing: 3, "skill level": 4, ... }
  skillLevel: number | null;               // 1-5 scale
  // Structured specs from DOM elements
  profile: string | null;
  shape: string | null;
  category: string | null;
  flex: string | null;
  gender: string | null;
}

const HEXAGON_LABELS = ["jibbing", "skill level", "powder", "groomers", "versatility", "jumps"];

async function scrapeDetailPage(handle: string): Promise<DetailPageData> {
  const url = `${CAPITA_BASE}/products/${handle}`;
  const html = await fetchPage(url, { timeoutMs: 15000 });
  const $ = cheerio.load(html);

  const hexagonScores: Record<string, number> = {};
  let skillLevel: number | null = null;

  // Extract from data-skills attribute: "3,4,2,5,5,4"
  const hexDiv = $(".c-hexagon.js-hexagon, [data-skills]").first();
  const dataSkills = hexDiv.attr("data-skills");
  if (dataSkills) {
    const values = dataSkills.split(",").map(Number);
    for (let i = 0; i < HEXAGON_LABELS.length && i < values.length; i++) {
      if (!isNaN(values[i])) {
        hexagonScores[HEXAGON_LABELS[i]] = values[i];
        if (HEXAGON_LABELS[i] === "skill level") {
          skillLevel = values[i];
        }
      }
    }
  }

  // Extract flex and other text values from c-spec elements
  let flexFromSpec: string | null = null;

  $(".c-spec, .js-c-spec-line").each((_, el) => {
    const label = $(el).find(".c-spec__type").text().trim().toLowerCase();
    const value = $(el).find(".c-spec__value").text().trim();

    // Extract flex numeric value from e.g. "TWIN 5.5" or "DIRECTIONAL 7"
    if (label === "flex" && value) {
      const numMatch = value.match(/(\d+(?:\.\d+)?)/);
      if (numMatch) flexFromSpec = numMatch[1];
    }
  });

  // Extract profile, shape, category, gender from .c-product-info__categories span
  // Format: "Resort / True Twin / Hybrid Camber" or "Women's / Resort / True Twin / Hybrid Camber"
  const categoriesText = $(".c-product-info__categories").text().trim();
  const parsed = parseCategoriesText(categoriesText);

  return {
    hexagonScores,
    skillLevel,
    profile: parsed.profile,
    shape: parsed.shape,
    category: parsed.category,
    flex: flexFromSpec,
    gender: parsed.gender,
  };
}

/**
 * Map a 1-5 skill level rating to an ability level range.
 */
function skillLevelToAbility(level: number): string {
  switch (level) {
    case 1: return "beginner";
    case 2: return "beginner-intermediate";
    case 3: return "intermediate";
    case 4: return "intermediate-advanced";
    case 5: return "advanced-expert";
    default: return "intermediate";
  }
}

async function scrapeHtmlCatalog(): Promise<ManufacturerSpec[]> {
  const specs: ManufacturerSpec[] = [];
  const html = await fetchPage(`${CAPITA_BASE}/collections/all-snowboards`, {
    timeoutMs: 20000,
  });
  const $ = cheerio.load(html);

  $(
    '.product-card, [class*="product-card"], .grid-item, [class*="grid-product"]'
  ).each((_, el) => {
    const $el = $(el);
    const link = $el.find("a[href]").first();
    const href = link.attr("href");
    if (!href) return;

    const fullUrl = href.startsWith("http")
      ? href
      : `${CAPITA_BASE}${href}`;
    const name = $el
      .find(
        '[class*="product-title"], [class*="product-name"], .title, h3, h2'
      )
      .first()
      .text()
      .trim();
    const priceText = $el
      .find('[class*="price"]')
      .first()
      .text()
      .trim();
    const price = priceText
      ? parseFloat(priceText.replace(/[^0-9.]/g, ""))
      : null;

    if (name) {
      specs.push({
        brand: "CAPiTA",
        model: cleanModelName(name),
        year: null,
        flex: null,
        profile: null,
        shape: null,
        category: null,
        msrpUsd: price && !isNaN(price) ? price : null,
        sourceUrl: fullUrl,
        extras: {},
      });
    }
  });

  return specs;
}

function parseProfileFromTags(tags: string[]): string | null {
  // Order matters — check more specific terms first
  if (tags.includes("hybrid camber")) return "hybrid camber";
  if (tags.includes("hybrid rocker")) return "hybrid rocker";
  if (tags.includes("camber")) return "camber";
  if (tags.includes("rocker")) return "rocker";
  if (tags.includes("flat")) return "flat";
  return null;
}

function parseShapeFromTags(tags: string[]): string | null {
  if (tags.includes("true twin")) return "true twin";
  if (tags.includes("directional twin")) return "directional twin";
  if (tags.includes("directional")) return "directional";
  if (tags.includes("tapered")) return "tapered";
  return null;
}

function deriveGender(title: string, tags: string[]): string | null {
  const lower = title.toLowerCase();
  if (lower.includes("women") || lower.includes("wmns") || lower.includes("wmn") || tags.some(t => t.replace(/[\u2018\u2019]/g, "'") === "women's") || tags.includes("women") || tags.includes("womens"))
    return "womens";
  if (lower.includes("youth") || lower.includes("kid") || tags.includes("youth") || tags.includes("kids"))
    return "kids";
  return null;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^CAPiTA\s+/i, "")
    .replace(/^Capita\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}

function parseCategoriesText(text: string): {
  profile: string | null;
  shape: string | null;
  category: string | null;
  gender: string | null;
} {
  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;
  let gender: string | null = null;

  if (!text) return { profile, shape, category, gender };

  // Normalize curly/smart apostrophes (U+2018, U+2019) to ASCII
  const normalized = text.replace(/[\u2018\u2019]/g, "'");
  const parts = normalized.split(/\s*\/\s*/);
  for (const part of parts) {
    const lower = part.toLowerCase();
    // Capture gender from category labels
    if (lower === "women's") { gender = "womens"; continue; }
    if (lower === "youth") { gender = "kids"; continue; }
    // Skip product-type labels
    if (lower === "split board" || lower === "snowboard") continue;

    // Profile detection
    if (lower.includes("hybrid camber") || lower === "hybrid") {
      profile = part;
    } else if (lower.includes("traditional camber")) {
      profile = part;
    } else if (lower.includes("reverse camber")) {
      profile = part;
    } else if (lower.includes("camber")) {
      profile = part;
    }
    // Shape detection
    else if (lower.includes("true twin") || lower === "twin") {
      shape = part;
    } else if (lower.includes("directional twin")) {
      shape = part;
    } else if (lower === "directional") {
      shape = part;
    }
    // Category detection (what's left: Resort, All-Mtn, Park, Freestyle, Powder, etc.)
    else if (!category) {
      category = part;
    }
  }

  return { profile, shape, category, gender };
}

// Test exports
export { skillLevelToAbility, cleanModelName, parseCategoriesText, deriveGender };
