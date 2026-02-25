import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";
import { capitaToTerrain } from "../terrain";

const CAPITA_BASE = "https://www.capitasnowboarding.com";

/**
 * CAPiTA scraper.
 * Shopify store — try /products.json first (structured data), fall back to HTML.
 */
export const capita: ManufacturerModule = {
  brand: "CAPiTA",
  baseUrl: CAPITA_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
    console.log("[capita] Scraping manufacturer specs...");

    // Try Shopify products.json API first
    try {
      const specs = await scrapeShopifyJson();
      if (specs.length > 0) {
        console.log(`[capita] Got ${specs.length} boards from Shopify JSON`);
        return specs;
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
    return specs;
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
    const price = product.variants?.[0]?.price
      ? parseFloat(product.variants[0].price)
      : null;

    // Parse specs from body HTML
    const bodySpecs = parseBodyHtml(product.body_html);
    const tags = product.tags?.map((t) => t.toLowerCase()) || [];

    // Fall back to tags for profile/shape if body parsing didn't find them
    const profileFromTags = bodySpecs.profile || parseProfileFromTags(tags);
    const shapeFromTags = bodySpecs.shape || parseShapeFromTags(tags);

    // Merge detail page hexagon data
    const detail = detailData.get(product.handle);
    const extras = { ...bodySpecs.extras };
    if (tags.length > 0) {
      extras["tags"] = product.tags.join(", ");
    }

    if (detail) {
      // Store all hexagon values as extras
      for (const [key, value] of Object.entries(detail.hexagonScores)) {
        extras[key] = String(value);
      }
      // Store all spec bar values
      for (const [key, value] of Object.entries(detail.specBars)) {
        if (!extras[key]) extras[key] = String(value);
      }
      // Use skill level from hexagon if we don't have ability level from body text
      if (!bodySpecs.abilityLevel && detail.skillLevel !== null) {
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

    // Determine gender from tags or title
    const gender = deriveGender(product.title, tags);

    specs.push({
      brand: "CAPiTA",
      model: cleanModelName(product.title),
      year: null,
      flex: bodySpecs.flex,
      profile: profileFromTags,
      shape: shapeFromTags,
      category: bodySpecs.category,
      gender: gender ?? undefined,
      msrpUsd: price && !isNaN(price) ? price : null,
      sourceUrl: `${CAPITA_BASE}/products/${product.handle}`,
      extras,
    });
  }

  return specs;
}

interface DetailPageData {
  hexagonScores: Record<string, number>;  // e.g. { jibbing: 3, "skill level": 4, ... }
  specBars: Record<string, number>;        // from --dot-position CSS vars
  skillLevel: number | null;               // 1-5 scale
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

  // Also extract from individual c-spec elements with --dot-position
  const specBars: Record<string, number> = {};
  $(".c-spec, .js-c-spec-line").each((_, el) => {
    const label = $(el).find(".c-spec__type").text().trim().toLowerCase();
    const levelDiv = $(el).find("[style*='--dot-position']");
    const style = levelDiv.attr("style") || "";
    const posMatch = style.match(/--dot-position:\s*(\d+)/);
    if (label && posMatch) {
      const value = parseInt(posMatch[1]);
      specBars[label] = value;
      if ((label === "skill level" || label.includes("skill")) && skillLevel === null) {
        skillLevel = value;
      }
    }
  });

  return { hexagonScores, specBars, skillLevel };
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

function parseBodyHtml(bodyHtml: string): {
  flex: string | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  abilityLevel: string | null;
  extras: Record<string, string>;
} {
  if (!bodyHtml) return { flex: null, profile: null, shape: null, category: null, abilityLevel: null, extras: {} };

  const $ = cheerio.load(bodyHtml);
  const text = $.text().toLowerCase();
  const extras: Record<string, string> = {};

  let flex: string | null = null;
  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;
  let abilityLevel: string | null = null;

  // Look for spec patterns in body text
  const flexMatch = text.match(/flex[:\s]+(\d+(?:\.\d+)?(?:\s*(?:\/|out of)\s*10)?)/i) ||
    text.match(/flex[:\s]+(soft|medium|stiff|very\s+(?:soft|stiff))/i);
  if (flexMatch) flex = flexMatch[1].trim();

  const profileMatch = text.match(
    /(?:profile|camber)[:\s]+([\w\s-]+?)(?:\.|,|\n|<)/i
  );
  if (profileMatch) profile = profileMatch[1].trim();

  const shapeMatch = text.match(
    /shape[:\s]+([\w\s-]+?)(?:\.|,|\n|<)/i
  );
  if (shapeMatch) shape = shapeMatch[1].trim();

  // Category from tags/keywords
  if (text.includes("all-mountain") || text.includes("all mountain")) category = "all-mountain";
  else if (text.includes("freestyle")) category = "freestyle";
  else if (text.includes("freeride")) category = "freeride";
  else if (text.includes("park")) category = "park";
  else if (text.includes("powder")) category = "powder";

  // Ability level
  if (text.includes("beginner") && text.includes("intermediate")) abilityLevel = "beginner-intermediate";
  else if (text.includes("intermediate") && text.includes("advanced")) abilityLevel = "intermediate-advanced";
  else if (text.includes("beginner") || text.includes("entry level")) abilityLevel = "beginner";
  else if (text.includes("intermediate")) abilityLevel = "intermediate";
  else if (text.includes("expert") || text.includes("pro level")) abilityLevel = "expert";
  else if (text.includes("advanced")) abilityLevel = "advanced";

  if (abilityLevel) extras["ability level"] = abilityLevel;

  // Capture any "key: value" patterns from the body
  const kvMatches = $.text().matchAll(/([A-Za-z][A-Za-z\s]+?)\s*[:]\s*([^\n<]+)/g);
  for (const m of kvMatches) {
    const key = m[1].trim().toLowerCase();
    const val = m[2].trim();
    if (key && val && key.length < 30 && val.length < 100) {
      if (!extras[key]) extras[key] = val;
    }
  }

  return { flex, profile, shape, category, abilityLevel, extras };
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
  if (lower.includes("women") || lower.includes("wmns") || tags.includes("women") || tags.includes("womens"))
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

// Test exports
export { skillLevelToAbility, parseBodyHtml, cleanModelName };
