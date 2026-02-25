import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const SEASON_BASE = "https://seasoneqpt.com";

/**
 * Season Eqpt scraper.
 * Shopify store — uses /collections/snowboards/products.json API
 * plus detail page scraping for flex (from SVG filename).
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

interface DetailPageData {
  flex: string | null;
  shape: string | null;
  profile: string | null;
  category: string | null;
}

async function scrapeShopifyJson(): Promise<ManufacturerSpec[]> {
  const specs: ManufacturerSpec[] = [];
  let page = 1;
  const seenHandles = new Set<string>();
  const products: { product: ShopifyProduct; handle: string }[] = [];

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

      products.push({ product, handle: product.handle });
    }

    page++;
  }

  // Fetch detail pages with concurrency 3
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
            `[season] Failed to scrape detail page for ${handle}:`,
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

  // Merge Shopify JSON with detail page data
  for (const { product } of products) {
    const price = product.variants?.[0]?.price
      ? parseFloat(product.variants[0].price)
      : null;

    const extras: Record<string, string> = {};
    const detail = detailData.get(product.handle);

    specs.push({
      brand: "Season",
      model: cleanModelName(product.title),
      year: null,
      flex: detail?.flex ?? null,
      profile: detail?.profile ?? null,
      shape: detail?.shape ?? null,
      category: detail?.category ?? null,
      msrpUsd: price && !isNaN(price) ? price : null,
      sourceUrl: `${SEASON_BASE}/products/${product.handle}`,
      extras,
    });
  }

  return specs;
}

async function scrapeDetailPage(handle: string): Promise<DetailPageData> {
  const url = `${SEASON_BASE}/products/${handle}`;
  const html = await fetchPage(url, { timeoutMs: 15000 });
  const $ = cheerio.load(html);

  let flex: string | null = null;
  let shape: string | null = null;
  let profile: string | null = null;
  let category: string | null = null;

  // Flex: extract from SVG image filename pattern flex-Nof10.svg
  // e.g. <img src="...flex-9of10.svg"> → "9"
  $("img[src*='flex-']").each((_, el) => {
    if (flex) return;
    const src = $(el).attr("src") || "";
    const flexMatch = src.match(/flex-(\d+)of(\d+)\.svg/);
    if (flexMatch) {
      flex = flexMatch[1];
    }
  });

  // Also check for shape/profile/category in structured elements
  // Look for spec-like sections with labeled values
  $("img[src*='shape-'], img[src*='profile-'], img[src*='camber-']").each((_, el) => {
    const src = $(el).attr("src") || "";
    const alt = ($(el).attr("alt") || "").toLowerCase();

    // Shape from image filename or alt text
    if (src.includes("shape-") || alt.includes("shape")) {
      if (!shape) {
        if (/\btrue.?twin\b/i.test(alt)) shape = "true twin";
        else if (/\bdirectional.?twin\b/i.test(alt)) shape = "directional twin";
        else if (/\bdirectional\b/i.test(alt)) shape = "directional";
        else if (/\btwin\b/i.test(alt)) shape = "true twin";
      }
    }

    // Profile from image filename or alt text
    if (src.includes("profile-") || src.includes("camber-") || alt.includes("profile") || alt.includes("camber")) {
      if (!profile) {
        if (/\bhybrid.?camber\b/i.test(alt)) profile = "hybrid camber";
        else if (/\bhybrid.?rocker\b/i.test(alt)) profile = "hybrid rocker";
        else if (/\bcamber\b/i.test(alt)) profile = "camber";
        else if (/\brocker\b/i.test(alt)) profile = "rocker";
      }
    }
  });

  console.log(
    `[season] Detail ${handle}: flex=${flex}, shape=${shape}, profile=${profile}, category=${category}`
  );

  return { flex, shape, profile, category };
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^(?:Season\s+)/i, "")
    .replace(/\s+Snowboard$/i, "")
    .replace(/\s+20\d{2}(?:\/20\d{2})?$/i, "")
    .trim();
}

// Test exports
export { cleanModelName };
