import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const JONES_BASE = "https://www.jonessnowboards.com";

/**
 * Jones Snowboards scraper.
 * Shopify store — uses /products.json API (same pattern as CAPiTA).
 */
export const jones: ManufacturerModule = {
  brand: "Jones",
  baseUrl: JONES_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
    console.log("[jones] Scraping manufacturer specs...");

    try {
      const specs = await scrapeShopifyJson();
      if (specs.length > 0) {
        console.log(`[jones] Got ${specs.length} boards from Shopify JSON`);
        return specs;
      }
    } catch (err) {
      console.warn(
        "[jones] Shopify JSON failed:",
        err instanceof Error ? err.message : err
      );
    }

    return [];
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
  }[];
}

async function scrapeShopifyJson(): Promise<ManufacturerSpec[]> {
  const specs: ManufacturerSpec[] = [];
  let page = 1;
  const seenHandles = new Set<string>();
  const products: { product: ShopifyProduct; handle: string }[] = [];

  while (page <= 5) {
    const url = `${JONES_BASE}/collections/snowboards/products.json?page=${page}&limit=250`;
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

      // Filter to snowboards by tags
      const tags = product.tags?.map((t) => t.toLowerCase()) || [];
      const isBoard = tags.some((t) => t.includes("snowboard"));

      if (isBoard) {
        products.push({ product, handle: product.handle });
      }
    }

    page++;
  }

  // Fetch detail pages for terrain ratings (concurrency 3)
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
          console.warn(
            `[jones] Failed to scrape detail page for ${handle}:`,
            err instanceof Error ? err.message : err
          );
          return { handle, data: null };
        }
      })
    );
    for (const { handle, data } of results) {
      if (data) detailData.set(handle, data);
    }
  }

  // Merge JSON API data with detail page data
  for (const { product } of products) {
    const price = product.variants?.[0]?.price
      ? parseFloat(product.variants[0].price)
      : null;

    const bodySpecs = parseBodyHtml(product.body_html);
    const detail = detailData.get(product.handle);
    const extras: Record<string, string> = { ...bodySpecs.extras };

    if (detail) {
      // Terrain ratings as extras
      for (const [key, value] of Object.entries(detail.terrainRatings)) {
        extras[key] = value;
      }
      // Category from terrain ratings (preferred over body keyword matching)
      if (detail.derivedCategory) {
        bodySpecs.category = detail.derivedCategory;
      }
      // Flex from detail page progress bar (preferred over body keyword matching)
      if (detail.flex) {
        bodySpecs.flex = detail.flex;
      }
      if (detail.flexLabel) {
        extras["flex description"] = detail.flexLabel;
      }
      // Ability level from detail page riding level section
      if (!extras["ability level"] && detail.abilityLevel) {
        extras["ability level"] = detail.abilityLevel;
      }
      // Profile from detail page shape section (preferred over body keyword matching)
      if (detail.profile) {
        bodySpecs.profile = detail.profile;
      }
      // Shape from detail page shape section (preferred over body keyword matching)
      if (detail.shape) {
        bodySpecs.shape = detail.shape;
      }
      // Additional shape extras (taper, 3D contour, etc.)
      for (const [key, value] of Object.entries(detail.shapeExtras)) {
        if (!extras[key]) extras[key] = value;
      }
    }

    const tags = product.tags?.map((t) => t.toLowerCase()) || [];
    if (tags.length > 0) {
      extras["tags"] = product.tags.join(", ");
    }

    // Determine gender from tags or title
    const gender = deriveGender(product.title, tags);
    if (gender) extras["gender"] = gender;

    specs.push({
      brand: "Jones",
      model: cleanModelName(product.title),
      year: null,
      flex: bodySpecs.flex,
      profile: bodySpecs.profile,
      shape: bodySpecs.shape,
      category: bodySpecs.category,
      gender: gender ?? undefined,
      msrpUsd: price && !isNaN(price) ? price : null,
      sourceUrl: `${JONES_BASE}/products/${product.handle}`,
      extras,
    });
  }

  return specs;
}

interface DetailPageData {
  terrainRatings: Record<string, string>; // e.g. { "on-piste": "7/10", "freeride": "10/10" }
  derivedCategory: string | null;
  flex: string | null; // 1-10 scale (converted from Jones' 1-5 scale)
  flexLabel: string | null; // e.g. "Mid-stiff & lively"
  abilityLevel: string | null; // e.g. "intermediate-expert"
  profile: string | null; // from .product-shape-content
  shape: string | null; // from .product-shape-content
  shapeExtras: Record<string, string>; // taper, 3D contour, etc.
}

async function scrapeDetailPage(handle: string): Promise<DetailPageData> {
  const url = `${JONES_BASE}/products/${handle}`;
  const html = await fetchPage(url, { timeoutMs: 15000 });
  const $ = cheerio.load(html);

  const terrainRatings: Record<string, string> = {};

  // Extract terrain ratings from .specs-container with "Terrain" title
  $(".specs-container").each((_, container) => {
    const title = $(container).find(".specs-title").text().trim();
    if (!/terrain/i.test(title)) return;
    $(container).find(".spec").each((_, spec) => {
      const label = $(spec).find(".spec-name").text().trim().toLowerCase();
      const value = $(spec).find(".spec-ratio-value").text().trim();
      const bar = $(spec).find(".progress-bar").first();
      const max = bar.attr("aria-valuemax") || "10";
      if (label && value) {
        terrainRatings[label] = `${value}/${max}`;
      }
    });
  });

  // Extract flex from Personality/Flex progress bar section
  // Jones uses a 1-5 scale; convert to 1-10 by multiplying by 2
  let flex: string | null = null;
  let flexLabel: string | null = null;
  $(".specs-container").each((_, container) => {
    const title = $(container).find(".specs-title").text().trim();
    if (/personality\s*\/?\s*flex/i.test(title)) {
      const ratioValue = $(container).find(".spec-ratio-value").first().text().trim();
      const parsed = parseInt(ratioValue, 10);
      if (parsed >= 1 && parsed <= 5) {
        flex = String(parsed * 2);
      }
      const label = $(container).find(".spec-name").first().text().trim();
      if (label) flexLabel = label;
    }
  });

  // Extract ability level from Riding Level section
  // Active levels have .progress-bar.active and spec-name without .disabled
  let abilityLevel: string | null = null;
  $(".specs-container.riding-level, .specs-container").each((_, container) => {
    const title = $(container).find(".specs-title").text().trim();
    if (!/riding\s*level/i.test(title)) return;
    const activeLevels: string[] = [];
    $(container).find(".content-riding-level").each((_, levelEl) => {
      const name = $(levelEl).find(".spec-name").first();
      if (!name.hasClass("disabled")) {
        const level = name.text().trim().toLowerCase();
        if (level) activeLevels.push(level);
      }
    });
    if (activeLevels.length > 0) {
      abilityLevel = activeLevels.length === 1
        ? activeLevels[0]
        : `${activeLevels[0]}-${activeLevels[activeLevels.length - 1]}`;
    }
  });

  // Derive category from terrain ratings
  let derivedCategory: string | null = null;
  if (Object.keys(terrainRatings).length > 0) {
    derivedCategory = deriveCategoryFromRatings(terrainRatings);
  }

  // Extract profile, shape, taper from .product-shape-content
  let profile: string | null = null;
  let shape: string | null = null;
  const shapeExtras: Record<string, string> = {};
  $(".product-shape-content div").each((_, el) => {
    const heading = $(el).find("h4").first().text().trim().toLowerCase();
    const value = $(el).find("p").first().text().trim();
    if (!heading || !value) return;
    if (heading === "profile") {
      profile = value;
    } else if (heading === "shape") {
      shape = value;
    } else {
      shapeExtras[heading] = value;
    }
  });

  return { terrainRatings, derivedCategory, flex, flexLabel, abilityLevel, profile, shape, shapeExtras };
}

/**
 * Derive board category from terrain rating scores.
 * Picks the category with the highest rating.
 */
function deriveCategoryFromRatings(
  ratings: Record<string, string>
): string | null {
  const categoryMap: Record<string, string> = {
    "on-piste": "all-mountain",
    "all-mountain": "all-mountain",
    "on-piste / all-mountain": "all-mountain",
    freeride: "freeride",
    powder: "freeride",
    "freeride / powder": "freeride",
    freestyle: "freestyle",
    park: "freestyle",
    "freestyle / park": "freestyle",
    backcountry: "freeride",
  };

  let bestCategory: string | null = null;
  let bestScore = 0;

  for (const [label, scoreStr] of Object.entries(ratings)) {
    const scoreMatch = scoreStr.match(/(\d+)\/(\d+)/);
    if (!scoreMatch) continue;
    const score = parseInt(scoreMatch[1]);
    const category = categoryMap[label];
    if (category && score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

function parseBodyHtml(bodyHtml: string): {
  flex: string | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  extras: Record<string, string>;
} {
  if (!bodyHtml)
    return { flex: null, profile: null, shape: null, category: null, extras: {} };

  const $ = cheerio.load(bodyHtml);
  const text = $.text().toLowerCase();
  const extras: Record<string, string> = {};

  // Ability level from description (fallback if detail page widget absent)
  if (text.includes("beginner") && text.includes("intermediate"))
    extras["ability level"] = "beginner-intermediate";
  else if (text.includes("intermediate") && text.includes("advanced"))
    extras["ability level"] = "intermediate-advanced";
  else if (text.includes("beginner") || text.includes("entry level"))
    extras["ability level"] = "beginner";
  else if (text.includes("intermediate"))
    extras["ability level"] = "intermediate";
  else if (text.includes("expert") || text.includes("pro level"))
    extras["ability level"] = "expert";
  else if (text.includes("advanced"))
    extras["ability level"] = "advanced";

  // Capture key: value patterns from body
  const kvMatches = $.text().matchAll(
    /([A-Za-z][A-Za-z\s]+?)\s*[:]\s*([^\n<]+)/g
  );
  for (const m of kvMatches) {
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key && val && key.length < 30 && val.length < 100) {
      if (!extras[key]) extras[key] = val;
    }
  }

  return { flex: null, profile: null, shape: null, category: null, extras };
}

function deriveGender(
  title: string,
  tags: string[]
): string | null {
  const lower = title.toLowerCase();
  if (
    lower.includes("women") ||
    lower.includes("wmns") ||
    tags.includes("women") ||
    tags.includes("womens")
  )
    return "womens";
  if (lower.includes("youth") || lower.includes("kid") || lower.includes("junior"))
    return "youth";
  // Don't use "men" tag — most unisex boards are tagged "men" in Shopify
  return null;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^(?:Men's|Women's|Youth)\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .replace(/\s+20\d{2}(?:\/20\d{2})?$/i, "") // strip year suffixes
    .trim();
}

// Test exports
export { parseBodyHtml, cleanModelName, deriveCategoryFromRatings };
