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
      // Category from terrain ratings if not found in body
      if (!bodySpecs.category && detail.derivedCategory) {
        bodySpecs.category = detail.derivedCategory;
      }
      // Flex from detail page progress bar if not found in body
      if (!bodySpecs.flex && detail.flex) {
        bodySpecs.flex = detail.flex;
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
}

async function scrapeDetailPage(handle: string): Promise<DetailPageData> {
  const url = `${JONES_BASE}/products/${handle}`;
  const html = await fetchPage(url, { timeoutMs: 15000 });
  const $ = cheerio.load(html);

  const terrainRatings: Record<string, string> = {};

  // Look for terrain ratings in .spec .spec-details or similar structures
  $(".spec, [class*='spec-detail'], [class*='terrain']").each((_, el) => {
    const text = $(el).text().trim();
    // Match patterns like "On-piste / All-mountain: 7/10" or "Freeride / Powder: 10/10"
    const ratingMatch = text.match(
      /([\w\s/-]+?):\s*(\d+)\s*\/\s*(\d+)/
    );
    if (ratingMatch) {
      const label = ratingMatch[1].trim().toLowerCase();
      const score = `${ratingMatch[2]}/${ratingMatch[3]}`;
      terrainRatings[label] = score;
    }
  });

  // Also try broader search for terrain rating patterns anywhere on the page
  if (Object.keys(terrainRatings).length === 0) {
    const bodyText = $("body").text();
    const ratingPattern =
      /(on-piste|all-mountain|freeride|powder|freestyle|park|backcountry)[^:]*:\s*(\d+)\s*\/\s*(\d+)/gi;
    let match;
    while ((match = ratingPattern.exec(bodyText)) !== null) {
      const label = match[1].toLowerCase();
      terrainRatings[label] = `${match[2]}/${match[3]}`;
    }
  }

  // Extract flex from Personality/Flex progress bar section
  // Jones uses a 1-5 scale; convert to 1-10 by multiplying by 2
  let flex: string | null = null;
  $(".specs-container").each((_, container) => {
    const title = $(container).find(".specs-title").text().trim();
    if (/personality\s*\/?\s*flex/i.test(title)) {
      const ratioValue = $(container).find(".spec-ratio-value").first().text().trim();
      const parsed = parseInt(ratioValue, 10);
      if (parsed >= 1 && parsed <= 5) {
        flex = String(parsed * 2);
      }
    }
  });

  // Derive category from terrain ratings
  let derivedCategory: string | null = null;
  if (Object.keys(terrainRatings).length > 0) {
    derivedCategory = deriveCategoryFromRatings(terrainRatings);
  }

  return { terrainRatings, derivedCategory, flex };
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

  let flex: string | null = null;
  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;

  // Flex
  const flexMatch =
    text.match(/flex[:\s]+(\d+(?:\.\d+)?(?:\s*(?:\/|out of)\s*10)?)/i) ||
    text.match(/flex[:\s]+(soft|medium|stiff|very\s+(?:soft|stiff))/i);
  if (flexMatch) flex = flexMatch[1].trim();

  // Profile — Jones uses CamRock, camber, rocker
  const profilePatterns = [
    /\b(camrock)\b/i,
    /\b(directional rocker)\b/i,
    /\b(directional camber)\b/i,
    /\b(camber)\b/i,
    /\b(rocker)\b/i,
    /\b(flat)\b/i,
  ];
  for (const pat of profilePatterns) {
    const m = text.match(pat);
    if (m) {
      profile = m[1].trim();
      break;
    }
  }

  // Shape
  const shapePatterns = [
    /\b(tapered directional)\b/i,
    /\b(directional twin)\b/i,
    /\b(true twin)\b/i,
    /\b(directional)\b/i,
    /\b(twin)\b/i,
  ];
  for (const pat of shapePatterns) {
    const m = text.match(pat);
    if (m) {
      shape = m[1].trim();
      break;
    }
  }

  // Category from description keywords
  if (text.includes("all-mountain") || text.includes("all mountain"))
    category = "all-mountain";
  else if (text.includes("freeride")) category = "freeride";
  else if (text.includes("freestyle")) category = "freestyle";
  else if (text.includes("park")) category = "park";
  else if (text.includes("powder")) category = "powder";
  else if (text.includes("backcountry")) category = "freeride";

  // Ability level from description
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

  return { flex, profile, shape, category, extras };
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
