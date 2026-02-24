import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const SEASON_BASE = "https://seasoneqpt.com";

/**
 * Season Eqpt scraper.
 * Shopify store — uses /collections/snowboards/products.json API.
 * No detail page scraping needed.
 */
export const season: ManufacturerModule = {
  brand: "Season",
  baseUrl: SEASON_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
    console.log("[season] Scraping manufacturer specs...");

    try {
      const specs = await scrapeShopifyJson();
      if (specs.length > 0) {
        console.log(`[season] Got ${specs.length} boards from Shopify JSON`);
        return specs;
      }
    } catch (err) {
      console.warn(
        "[season] Shopify JSON failed:",
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

  while (page <= 5) {
    const url = `${SEASON_BASE}/collections/snowboards/products.json?page=${page}&limit=250`;
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

      // Filter: keep only snowboards, skip bundles and non-board items
      const productType = (product.product_type || "").toLowerCase();
      if (productType === "bundle") continue;
      if (productType && productType !== "snowboards") continue;

      const titleLower = product.title.toLowerCase();
      if (
        titleLower.includes("binding") ||
        titleLower.includes("splitboard") ||
        titleLower.includes("bundle")
      ) {
        continue;
      }

      const price = product.variants?.[0]?.price
        ? parseFloat(product.variants[0].price)
        : null;

      const bodySpecs = parseBodyHtml(product.body_html);
      const extras: Record<string, string> = { ...bodySpecs.extras };

      specs.push({
        brand: "Season",
        model: cleanModelName(product.title),
        year: null,
        flex: bodySpecs.flex,
        profile: bodySpecs.profile,
        shape: bodySpecs.shape,
        category: bodySpecs.category,
        msrpUsd: price && !isNaN(price) ? price : null,
        sourceUrl: `${SEASON_BASE}/products/${product.handle}`,
        extras,
      });
    }

    page++;
  }

  return specs;
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

  // Flex — check compound terms first, then single keywords
  if (/\bmedium[- ]stiff\b/.test(text)) {
    flex = "medium-stiff";
  } else if (/\bmedium[- ]soft\b/.test(text)) {
    flex = "medium-soft";
  } else if (/\bsoft[- ]flexing\b/.test(text) || /\bsofter\s+flex\b/.test(text) || /\bsoft\s+flex\b/.test(text)) {
    flex = "soft";
  } else if (/\bstiff\b/.test(text) && !/\bstiff\s+(?:boot|binding)/i.test(text)) {
    flex = "stiff";
  } else if (/\bsoft\b/.test(text) && !/\bsoft\s+(?:boot|binding|snow|goods)/i.test(text)) {
    flex = "soft";
  } else if (/\bmedium\b/.test(text) && /\bflex\b/.test(text)) {
    flex = "medium";
  }

  // Shape — order matters, check specific shapes first
  const shapePatterns: [RegExp, string][] = [
    [/\btrue\s+twin\b/, "true twin"],
    [/\bfreestyle\s+twin\b/, "true twin"],
    [/\bdirectional\s+twin\b/, "directional twin"],
    [/\bdirectional\b/, "directional"],
    [/\btwin\b/, "true twin"],
  ];
  for (const [pat, val] of shapePatterns) {
    if (pat.test(text)) {
      shape = val;
      break;
    }
  }

  // Profile
  const profilePatterns: [RegExp, string][] = [
    [/\bhybrid\s+camber\b/, "hybrid camber"],
    [/\bhybrid\s+rocker\b/, "hybrid rocker"],
    [/\brocker[/-]camber[/-]rocker\b/, "hybrid camber"],
    [/\bcamber[/-]rocker[/-]camber\b/, "hybrid camber"],
    [/\bcamber\b/, "camber"],
    [/\brocker\b/, "rocker"],
    [/\bflat\b/, "flat"],
  ];
  for (const [pat, val] of profilePatterns) {
    if (pat.test(text)) {
      profile = val;
      break;
    }
  }

  // Category — check compound terms first
  if (/\ball[- ]mountain\s+freestyle\b/.test(text)) category = "all-mountain";
  else if (/\bfreestyle\s+park\b/.test(text)) category = "freestyle";
  else if (/\ball[- ]mountain\b/.test(text)) category = "all-mountain";
  else if (/\bfreeride\b/.test(text)) category = "freeride";
  else if (/\bfreestyle\b/.test(text)) category = "freestyle";
  else if (/\bpark\b/.test(text)) category = "freestyle";
  else if (/\bpowder\b/.test(text)) category = "freeride";
  else if (/\bbackcountry\b/.test(text)) category = "freeride";

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

function cleanModelName(raw: string): string {
  return raw
    .replace(/^(?:Season\s+)/i, "")
    .replace(/\s+Snowboard$/i, "")
    .replace(/\s+20\d{2}(?:\/20\d{2})?$/i, "")
    .trim();
}

// Test exports
export { parseBodyHtml, cleanModelName };
