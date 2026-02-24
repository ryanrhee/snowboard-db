import { RawBoard, ScrapeScope, Currency, Region } from "../types";
import { RetailerModule } from "./types";
import { fetchPageWithBrowser, normalizeBrand } from "../scraping/utils";
import { delay } from "../scraping/utils";
import { config } from "../config";

const REI_BASE_URL = "https://www.rei.com";

function buildSearchUrl(page?: number): string {
  const base = `${REI_BASE_URL}/c/snowboards`;
  return page && page > 1 ? `${base}?page=${page}` : base;
}

interface ReiProduct {
  prodId: string;
  brand: string;
  title: string;
  cleanTitle: string;
  link: string;
  thumbnailImageLink: string;
  description: string;
  benefit: string;
  rating: string;
  reviewCount: string;
  regularPrice: string;
  percentageOff: string;
  available: boolean;
  sale: boolean;
  clearance: boolean;
  displayPrice: {
    min: number;
    max: number;
    compareAt: number | null;
  };
  tileAttributes?: {
    title: string;
    values: string[];
  }[];
}

function extractProductsFromHtml(html: string): ReiProduct[] {
  const products: ReiProduct[] = [];

  // REI embeds product data as inline JS objects in Vue.js templates.
  // Each product has a "link":"/product/..." field we can use to find them.
  const linkPattern = /"link":"\/product\/\d+\//g;
  const matches = [...html.matchAll(linkPattern)];

  for (const match of matches) {
    const startIdx = match.index!;

    // Walk backwards to find the opening { of this product object
    let depth = 0;
    let objStart = startIdx;
    for (let i = startIdx; i >= Math.max(0, startIdx - 5000); i--) {
      if (html[i] === "}") depth++;
      if (html[i] === "{") {
        depth--;
        if (depth < 0) {
          objStart = i;
          break;
        }
      }
    }

    // Walk forwards to find the closing }
    depth = 0;
    let objEnd = startIdx;
    for (let i = objStart; i < Math.min(html.length, objStart + 10000); i++) {
      if (html[i] === "{") depth++;
      if (html[i] === "}") {
        depth--;
        if (depth === 0) {
          objEnd = i + 1;
          break;
        }
      }
    }

    try {
      const product = JSON.parse(html.slice(objStart, objEnd)) as ReiProduct;
      if (product.link && product.displayPrice) {
        products.push(product);
      }
    } catch {
      // Skip malformed objects
    }
  }

  return products;
}

function extractTotalPages(html: string): number {
  const match = html.match(/"totalPages":(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

export const rei: RetailerModule = {
  name: "rei",
  region: Region.US,
  baseUrl: REI_BASE_URL,

  async searchBoards(_scope: ScrapeScope): Promise<RawBoard[]> {
    const page1Url = buildSearchUrl();
    console.log(`[rei] Fetching page 1 from ${page1Url}`);

    const page1Html = await fetchPageWithBrowser(page1Url, {
      waitUntil: "domcontentloaded",
      channel: "chrome",
    });

    const totalPages = extractTotalPages(page1Html);
    console.log(`[rei] ${totalPages} total pages`);

    let allProducts = extractProductsFromHtml(page1Html);

    for (let page = 2; page <= totalPages; page++) {
      await delay(config.scrapeDelayMs);
      const pageUrl = buildSearchUrl(page);
      console.log(`[rei] Fetching page ${page} from ${pageUrl}`);
      const html = await fetchPageWithBrowser(pageUrl, {
        waitUntil: "domcontentloaded",
        channel: "chrome",
      });
      const products = extractProductsFromHtml(html);
      console.log(`[rei] Page ${page}: ${products.length} products`);
      allProducts = allProducts.concat(products);
    }

    console.log(`[rei] Found ${allProducts.length} total product entries`);

    // Deduplicate by prodId (products can appear on multiple pages)
    const seen = new Set<string>();
    const uniqueProducts = allProducts.filter((p) => {
      if (seen.has(p.prodId)) return false;
      seen.add(p.prodId);
      return true;
    });

    console.log(`[rei] ${uniqueProducts.length} unique products after dedup`);

    const boards: RawBoard[] = uniqueProducts
      .filter((p) => {
        if (!p.displayPrice?.min) return false;
        // Only include boards that are actually discounted
        if (!p.sale && !p.clearance && !parseFloat(p.percentageOff || "0")) return false;
        return true;
      })
      .map((p) => {
        const salePrice = p.displayPrice.min;
        const originalPrice = p.displayPrice.compareAt || parseFloat(p.regularPrice) || undefined;

        // Capture available metadata into specs
        const specs: Record<string, string> = {};
        if (p.rating) specs["rating"] = p.rating;
        if (p.reviewCount) specs["review count"] = p.reviewCount;

        // Extract specs from tileAttributes (Style, Shape, Profile, Flex)
        let flex: string | undefined;
        let profile: string | undefined;
        let shape: string | undefined;
        let category: string | undefined;
        if (p.tileAttributes) {
          for (const attr of p.tileAttributes) {
            const val = attr.values.join(", ");
            const key = attr.title.toLowerCase();
            specs[key] = val;
            if (key === "flex") flex = val;
            else if (key === "profile") profile = val;
            else if (key === "shape") shape = val;
            else if (key === "style" || key === "terrain" || key === "best for") category = val;
          }
        }

        return {
          retailer: "rei",
          region: Region.US,
          url: `${REI_BASE_URL}${p.link}`,
          imageUrl: p.thumbnailImageLink || undefined,
          brand: normalizeBrand(p.brand || "Unknown"),
          model: (p.cleanTitle || p.title || "Unknown").replace(/\/+$/, ""),
          year: undefined,
          lengthCm: undefined,
          widthMm: undefined,
          flex,
          profile,
          shape,
          category,
          originalPrice,
          salePrice,
          currency: Currency.USD,
          availability: p.available ? "in_stock" : "out_of_stock",
          description: (p.benefit || p.description || "").slice(0, 1000) || undefined,
          specs,
          scrapedAt: new Date().toISOString(),
          condition: p.clearance ? "closeout" : undefined,
        };
      });

    console.log(`[rei] Successfully scraped ${boards.length} boards`);
    return boards;
  },
};
