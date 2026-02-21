import * as cheerio from "cheerio";
import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

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

      if (!isBoard) continue;

      const price = product.variants?.[0]?.price
        ? parseFloat(product.variants[0].price)
        : null;

      // Parse specs from body HTML
      const bodySpecs = parseBodyHtml(product.body_html);

      specs.push({
        brand: "CAPiTA",
        model: cleanModelName(product.title),
        year: null,
        flex: bodySpecs.flex,
        profile: bodySpecs.profile,
        shape: bodySpecs.shape,
        category: bodySpecs.category,
        msrpUsd: price && !isNaN(price) ? price : null,
        sourceUrl: `${CAPITA_BASE}/products/${product.handle}`,
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
} {
  if (!bodyHtml) return { flex: null, profile: null, shape: null, category: null };

  const $ = cheerio.load(bodyHtml);
  const text = $.text().toLowerCase();

  let flex: string | null = null;
  let profile: string | null = null;
  let shape: string | null = null;
  let category: string | null = null;

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

  return { flex, profile, shape, category };
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
      });
    }
  });

  return specs;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^CAPiTA\s+/i, "")
    .replace(/^Capita\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}
