import * as cheerio from "cheerio";
import { ScraperModule, ScrapedBoard } from "../scrapers/types";
import { ManufacturerSpec, adaptManufacturerOutput } from "../scrapers/adapters";
import { fetchPage } from "../scraping/utils";
import { extractShopifyListings } from "./shopify-utils";
import { Currency } from "../types";

const SEASON_BASE = "https://seasoneqpt.com";

/**
 * Season Eqpt scraper.
 * Shopify store — uses /collections/snowboards/products.json API
 * plus detail page scraping for flex (from SVG filename).
 */
export const season: ScraperModule = {
  name: "manufacturer:season",
  sourceType: "manufacturer",
  baseUrl: SEASON_BASE,

  async scrape(): Promise<ScrapedBoard[]> {
    console.log("[season] Scraping manufacturer specs...");

    try {
      const specs = await scrapeShopifyJson();
      if (specs.length > 0) {
        console.log(`[season] Got ${specs.length} boards from Shopify JSON`);
        return adaptManufacturerOutput(specs, "Season");
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
    compare_at_price: string | null;
    available: boolean;
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
    const { listings, msrpUsd } = extractShopifyListings(
      product.variants ?? [],
      `${SEASON_BASE}/products/${product.handle}`,
      Currency.USD
    );

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
      msrpUsd: msrpUsd ?? null,
      sourceUrl: `${SEASON_BASE}/products/${product.handle}`,
      extras,
      listings,
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
  // Season embeds flex ratings as named SVG files rather than text or data
  // attributes, so regex on the filename is the correct extraction method.
  $("img[src*='flex-']").each((_, el) => {
    if (flex) return;
    const src = $(el).attr("src") || "";
    const flexMatch = src.match(/flex-(\d+)of(\d+)\.svg/);
    if (flexMatch) {
      flex = flexMatch[1];
    }
  });

  // Shape and profile: extract from image src/alt attributes.
  // Season uses named image files (shape-*, profile-*, camber-*) to display
  // these specs visually. The filename/alt text IS the structured data source,
  // so regex extraction here is intentional — there is no text or JSON alternative.
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
