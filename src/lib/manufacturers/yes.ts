import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const YES_BASE = "https://www.yessnowboards.com";

/**
 * Yes. Snowboards scraper.
 * Shopify store — uses /collections/snowboards/products.json API
 * plus detail page scraping for flex, shape, and profile.
 */
export const yes: ManufacturerModule = {
  brand: "Yes.",
  baseUrl: YES_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
    console.log("[yes] Scraping manufacturer specs...");

    try {
      const specs = await scrapeShopifyJson();
      if (specs.length > 0) {
        console.log(`[yes] Got ${specs.length} boards from Shopify JSON`);
        return specs;
      }
    } catch (err) {
      console.warn(
        "[yes] Shopify JSON failed:",
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
  category: string | null;
}

async function scrapeShopifyJson(): Promise<ManufacturerSpec[]> {
  const specs: ManufacturerSpec[] = [];
  let page = 1;
  const seenHandles = new Set<string>();
  const products: { product: ShopifyProduct; handle: string }[] = [];

  while (page <= 5) {
    const url = `${YES_BASE}/collections/snowboards/products.json?page=${page}&limit=250`;
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

      // Filter: skip non-board products (bindings, apparel, etc.)
      const titleLower = product.title.toLowerCase();
      if (
        titleLower.includes("binding") ||
        titleLower.includes("jacket") ||
        titleLower.includes("pant") ||
        titleLower.includes("hoodie") ||
        titleLower.includes("t-shirt") ||
        titleLower.includes("hat") ||
        titleLower.includes("beanie") ||
        titleLower.includes("glove") ||
        titleLower.includes("goggle") ||
        titleLower.includes("boot")
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
            `[yes] Failed to scrape detail page for ${handle}:`,
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

    const tags = product.tags?.map((t) => t.toLowerCase()) || [];
    const extras: Record<string, string> = {};

    if (tags.length > 0) {
      extras["tags"] = product.tags.join(", ");
    }

    const detail = detailData.get(product.handle);

    const gender = deriveGender(product.title, tags);
    if (gender) extras["gender"] = gender;

    specs.push({
      brand: "Yes.",
      model: cleanModelName(product.title),
      year: null,
      flex: detail?.flex ?? null,
      profile: null,
      shape: detail?.shape ?? null,
      category: detail?.category ?? null,
      gender: gender ?? undefined,
      msrpUsd: price && !isNaN(price) ? price : null,
      sourceUrl: `${YES_BASE}/products/${product.handle}`,
      extras,
    });
  }

  return specs;
}

async function scrapeDetailPage(handle: string): Promise<DetailPageData> {
  const url = `${YES_BASE}/products/${handle}`;
  const html = await fetchPage(url, { timeoutMs: 15000 });
  const $ = cheerio.load(html);

  let flex: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;

  // Flex: extract from bar chart data-total attribute (0-100 → 1-10)
  // e.g. <div class="bar-chart" data-total="60"> → 6
  const barChart = $(".bar-chart[data-total]").first();
  const dataTotal = barChart.attr("data-total");
  if (dataTotal) {
    const totalNum = parseInt(dataTotal, 10);
    if (!isNaN(totalNum) && totalNum >= 0 && totalNum <= 100) {
      flex = String(Math.round(totalNum / 10));
    }
  }
  // Fallback: look for text like "6/10" in the bar chart area
  if (!flex) {
    const flexText = $(".bar-chart-indice, .bar-chart").text();
    const flexMatch = flexText.match(/(\d+)\s*\/\s*10/);
    if (flexMatch) {
      flex = flexMatch[1];
    }
  }

  // Shape: extract from heading in #contentShape
  // e.g. <h3>Shape: True Twin</h3>
  const shapeSection = $("#contentShape");
  if (shapeSection.length) {
    const shapeText = shapeSection.find("h3, h4, .shape-title").text().trim();
    const shapeMatch = shapeText.match(/shape\s*:\s*(.+)/i);
    if (shapeMatch) {
      shape = normalizeShape(shapeMatch[1].trim());
    } else if (shapeText) {
      shape = normalizeShape(shapeText);
    }
  }

  // Category: look in #contentTerrain or page-wide terrain sections
  const terrainSection = $("#contentTerrain");
  if (terrainSection.length) {
    const terrainText = terrainSection.text().toLowerCase();
    category = categorizeFromText(terrainText);
  }

  // If no category from dedicated section, scan the whole page's tab content
  if (!category) {
    const tabText = $(".tab-content, .product-tabs").text().toLowerCase();
    category = categorizeFromText(tabText);
  }

  console.log(
    `[yes] Detail ${handle}: flex=${flex}, shape=${shape}, category=${category}`
  );

  return { flex, shape, category };
}

function normalizeShape(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (/\btrue\s+twin\b/.test(lower) || /\basym(?:metrical)?\s+twin\b/.test(lower))
    return "true twin";
  if (/\bdirectional\s+twin\b/.test(lower)) return "directional twin";
  if (/\btapered\s+directional\b/.test(lower)) return "directional";
  if (/\bdirectional\b/.test(lower)) return "directional";
  if (/\btwin\b/.test(lower)) return "true twin";
  // Return the raw text if it looks like a shape name
  if (lower.length > 0 && lower.length < 40) return raw.trim();
  return null;
}

function categorizeFromText(text: string): string | null {
  if (/\ball[- ]mountain\s+freestyle\b/.test(text)) return "all-mountain";
  if (/\bfreestyle\s+park\b/.test(text)) return "freestyle";
  if (/\ball[- ]mountain\b/.test(text)) return "all-mountain";
  if (/\bfreeride\b/.test(text)) return "freeride";
  if (/\bfreestyle\b/.test(text)) return "freestyle";
  if (/\bpark\b/.test(text)) return "freestyle";
  if (/\bpowder\b/.test(text)) return "freeride";
  if (/\bbackcountry\b/.test(text)) return "freeride";
  return null;
}

function deriveGender(title: string, tags: string[]): string | null {
  const lower = title.toLowerCase();
  if (
    lower.includes("women") ||
    lower.includes("wmns") ||
    tags.some((t) => t.includes("snowboards-women"))
  )
    return "womens";
  if (
    lower.includes("youth") ||
    lower.includes("kid") ||
    lower.includes("junior") ||
    tags.some((t) => t.includes("snowboards-kids"))
  )
    return "youth";
  return null;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^(?:Yes\.?\s+)/i, "")
    .replace(/^(?:Men's|Women's|Youth)\s+/i, "")
    .replace(/\s+(?:Men's|Women's|Youth|Kid's)\s+Snowboard$/i, "")
    .replace(/\s+(?:Men's|Women's|Youth|Kid's)$/i, "")
    .replace(/\s+Snowboard$/i, "")
    .replace(/\s+20\d{2}(?:\/20\d{2})?$/i, "")
    .trim();
}

// Test exports
export { cleanModelName, deriveGender };
