import * as cheerio from "cheerio";
import { config } from "../config";
import { RawBoard, ScrapeScope, Currency, Region } from "../types";
import { ScraperModule, ScrapedBoard } from "../scrapers/types";
import { adaptRetailerOutput } from "../scrapers/adapters";
import { fetchPageWithBrowser, parsePrice, parseLengthCm, normalizeBrand, delay } from "../scraping/utils";

const BC_BASE_URL = "https://www.backcountry.com";

function buildSearchUrl(): string {
  return `${BC_BASE_URL}/snowboards`;
}

function parseProductsFromHtml(html: string): Partial<RawBoard>[] {
  const $ = cheerio.load(html);
  const boards: Partial<RawBoard>[] = [];

  // Parse from __NEXT_DATA__ Apollo state (primary method)
  const nextDataScript = $("#__NEXT_DATA__");
  if (nextDataScript.length > 0) {
    try {
      const nextData = JSON.parse(nextDataScript.text());
      const pageProps = nextData?.props?.pageProps || {};

      // Products are in the Apollo cache as "Product:ID" keys
      const apollo = pageProps.__APOLLO_STATE__;
      if (apollo) {
        for (const [key, value] of Object.entries(apollo)) {
          if (!key.startsWith("Product:")) continue;
          const product = value as Record<string, unknown>;
          if (product.__typename !== "Product") continue;

          const aggregates = product.aggregates as Record<string, unknown> | undefined;
          const brand = product.brand as Record<string, string> | undefined;
          const url = product.url as string | undefined;

          boards.push({
            retailer: "backcountry",
            region: Region.US,
            url: url
              ? (url.startsWith("http") ? url : `${BC_BASE_URL}${url}`)
              : undefined,
            brand: brand?.name,
            model: product.name as string,
            salePrice: aggregates?.minSalePrice as number | undefined,
            originalPrice: aggregates?.minListPrice as number | undefined,
            currency: Currency.USD,
          });
        }
      }

      if (boards.length > 0) return boards;

      // Fallback: try older data shapes
      const products =
        pageProps.initialState?.products?.items ||
        pageProps.products ||
        [];

      for (const product of products) {
        if (!product) continue;
        boards.push({
          retailer: "backcountry",
          region: Region.US,
          url: product.url
            ? (product.url.startsWith("http") ? product.url : `${BC_BASE_URL}${product.url}`)
            : undefined,
          imageUrl: product.imageUrl || product.image || undefined,
          brand: product.brand?.name || product.brandName || product.brand,
          model: product.title || product.name,
          salePrice: product.salePrice || product.price?.sale || product.price?.current,
          originalPrice: product.originalPrice || product.price?.original || product.price?.regular,
          currency: Currency.USD,
        });
      }

      if (boards.length > 0) return boards;
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Try JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = data["@type"] === "ItemList" ? data.itemListElement : [data];
      for (const item of items) {
        const product = item.item || item;
        if (product["@type"] !== "Product") continue;
        const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
        boards.push({
          retailer: "backcountry",
          region: Region.US,
          url: product.url,
          imageUrl: product.image,
          brand: product.brand?.name || product.brand,
          model: product.name,
          salePrice: offer?.price ? parseFloat(offer.price) : undefined,
          currency: Currency.USD,
        });
      }
    } catch {
      // skip
    }
  });

  if (boards.length > 0) return boards;

  // HTML fallback: product cards
  const cardSelectors = [
    '[data-id="productCard"]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    ".product-listing-item",
  ];

  for (const selector of cardSelectors) {
    const cards = $(selector);
    if (cards.length === 0) continue;

    cards.each((_, el) => {
      const $el = $(el);
      const link = $el.find("a[href]").first();
      const href = link.attr("href");
      if (!href) return;

      const fullUrl = href.startsWith("http") ? href : `${BC_BASE_URL}${href}`;
      const imgEl = $el.find("img").first();
      const brandEl = $el.find('[class*="brand"], [class*="Brand"]').first();
      const nameEl = $el.find('[class*="name"], [class*="title"], [class*="Name"]').first();

      const priceEls = $el.find('[class*="price"], [class*="Price"]');
      let salePrice: number | undefined;
      let originalPrice: number | undefined;

      priceEls.each((_, priceEl) => {
        const text = $(priceEl).text();
        const cls = $(priceEl).attr("class") || "";
        const parsed = parsePrice(text);
        if (!parsed) return;

        if (cls.includes("sale") || cls.includes("Sale") || cls.includes("current")) {
          salePrice = parsed;
        } else if (cls.includes("original") || cls.includes("regular") || cls.includes("compare")) {
          originalPrice = parsed;
        } else if (!salePrice) {
          salePrice = parsed;
        }
      });

      boards.push({
        retailer: "backcountry",
        region: Region.US,
        url: fullUrl,
        imageUrl: imgEl.attr("src") || imgEl.attr("data-src"),
        brand: brandEl.text().trim() || undefined,
        model: nameEl.text().trim() || link.text().trim() || undefined,
        salePrice,
        originalPrice,
        currency: Currency.USD,
      });
    });
    break;
  }

  return boards;
}

async function fetchBoardDetails(partial: Partial<RawBoard>): Promise<RawBoard | RawBoard[] | null> {
  if (!partial.url) return null;

  try {
    await delay(config.scrapeDelayMs);
    const html = await fetchPageWithBrowser(partial.url);
    const $ = cheerio.load(html);

    let brand = partial.brand;
    let model = partial.model;
    let salePrice = partial.salePrice;
    let originalPrice = partial.originalPrice;
    let imageUrl = partial.imageUrl;
    let description: string | undefined;
    const specs: Record<string, string> = {};
    const variants: { size: string; price: number; availability: string }[] = [];

    // JSON-LD on product page — handle both Product and ProductGroup
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data["@type"] === "Product") {
          brand = brand || data.brand?.name || data.brand;
          model = model || data.name;
          description = description || data.description;
          imageUrl = imageUrl || data.image;
          const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
          if (offer?.price && !salePrice) salePrice = parseFloat(offer.price);
          if (offer?.availability) specs["availability"] = offer.availability;
        } else if (data["@type"] === "ProductGroup") {
          brand = brand || data.brand?.name;
          model = model || data.name;
          description = description || data.description;
          if (Array.isArray(data.image)) imageUrl = imageUrl || data.image[0];

          // Extract size variants
          if (Array.isArray(data.hasVariant)) {
            for (const v of data.hasVariant) {
              if (v["@type"] !== "Product") continue;
              const offer = Array.isArray(v.offers) ? v.offers[0] : v.offers;
              const price = offer?.price ? parseFloat(offer.price) : undefined;
              const avail = offer?.availability?.includes("InStock") ? "in_stock" : "out_of_stock";
              if (v.size && price) {
                variants.push({ size: v.size, price, availability: avail });
              }
            }
          }
        }
      } catch { /* skip */ }
    });

    // Parse structured specs from __NEXT_DATA__ → pageProps.product
    const nextDataScript = $("#__NEXT_DATA__");
    if (nextDataScript.length > 0) {
      try {
        const nextData = JSON.parse(nextDataScript.text());
        const product = nextData?.props?.pageProps?.product;
        if (product) {
          brand = brand || product.brand?.name || product.brand;
          model = model || product.title;
          description = description || product.description;

          // attributes: [{name, value}, ...] — e.g. Profile, Shape, Recommended Use
          // Some attributes have multiple values (e.g. Skill Level: Advanced + Beginner),
          // so we combine duplicates with ", " to avoid losing data
          if (Array.isArray(product.attributes)) {
            for (const attr of product.attributes) {
              if (attr.name && attr.value) {
                const key = attr.name.toLowerCase().trim();
                const val = attr.value.trim();
                if (!specs[key]) specs[key] = val;
                else if (!specs[key].toLowerCase().includes(val.toLowerCase())) {
                  specs[key] = `${specs[key]}, ${val}`;
                }
              }
            }
          }

          // features: [{name, value}, ...] — e.g. Flex, Profile, Shape, Effective Edge
          if (Array.isArray(product.features)) {
            for (const feat of product.features) {
              if (feat.name && feat.value) {
                const key = feat.name.toLowerCase().trim();
                if (!specs[key]) specs[key] = feat.value.trim();
              }
            }
          }

          // Customer reviews
          const reviews = product.customerReviews;
          if (reviews) {
            if (reviews.average != null) specs["rating"] = String(reviews.average);
            if (reviews.count != null) specs["review count"] = String(reviews.count);
          }
        }
      } catch { /* skip */ }
    }

    // Fallback: parse specs from HTML elements
    $('[class*="spec"] li, [class*="Spec"] li, [class*="detail"] li').each((_, el) => {
      const text = $(el).text().trim();
      const parts = text.split(/:\s*/);
      if (parts.length === 2) {
        const key = parts[0].toLowerCase().trim();
        if (!specs[key]) specs[key] = parts[1].trim();
      }
    });

    // Also try table rows
    $("table tr").each((_, row) => {
      const cells = $(row).find("td, th");
      if (cells.length >= 2) {
        const key = $(cells[0]).text().trim().toLowerCase();
        const val = $(cells[1]).text().trim();
        if (key && val && !specs[key]) specs[key] = val;
      }
    });

    const flex = specs["flex rating"] || specs["flex"] || specs["stiffness"];
    const profile = specs["profile"] || specs["bend"] || specs["camber type"];
    const shape = specs["shape"] || specs["shape type"];
    const category = specs["terrain"] || specs["best for"] || specs["recommended use"] || specs["intended use"];
    const abilityLevel = specs["ability level"] || specs["rider level"] || specs["skill level"];

    if (!salePrice && variants.length === 0) return null;

    // If we have size variants, return one board per variant (like tactics)
    if (variants.length > 0) {
      const results: RawBoard[] = [];
      for (const v of variants) {
        const sizeCm = parseLengthCm(v.size) || undefined;
        let widthMm: number | undefined;
        if (v.size.toLowerCase().includes("wide") || v.size.toLowerCase().includes("wid")) {
          // Mark wide boards but we can't know exact width from "166cm wide"
          specs["width"] = "wide";
        }
        results.push({
          retailer: "backcountry",
          region: Region.US,
          url: partial.url,
          imageUrl,
          brand: brand ? normalizeBrand(brand) : "Unknown",
          model: model || "Unknown",
          year: undefined,
          lengthCm: sizeCm,
          widthMm,
          flex,
          profile,
          shape,
          category,
          abilityLevel,
          originalPrice: originalPrice || v.price,
          salePrice: salePrice || v.price,
          currency: Currency.USD,
          availability: v.availability,
          description: description?.slice(0, 1000),
          specs,
          scrapedAt: new Date().toISOString(),
        });
      }
      return results;
    }

    // Single board (no variant data)
    let availability: string | undefined;
    if (specs["availability"]?.includes("InStock")) availability = "in_stock";
    else if (specs["availability"]?.includes("OutOfStock")) availability = "out_of_stock";

    return {
      retailer: "backcountry",
      region: Region.US,
      url: partial.url,
      imageUrl,
      brand: brand ? normalizeBrand(brand) : "Unknown",
      model: model || "Unknown",
      year: undefined,
      lengthCm: undefined,
      widthMm: undefined,
      flex,
      profile,
      shape,
      category,
      abilityLevel,
      originalPrice,
      salePrice: salePrice || 0,
      currency: Currency.USD,
      availability,
      description: description?.slice(0, 1000),
      specs,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[backcountry] Failed to fetch details for ${partial.url}:`, error);
    return null;
  }
}

export const backcountry: ScraperModule = {
  name: "retailer:backcountry",
  sourceType: "retailer",
  baseUrl: BC_BASE_URL,
  region: Region.US,

  async scrape(_scope?: ScrapeScope): Promise<ScrapedBoard[]> {
    const searchUrl = buildSearchUrl();
    console.log(`[backcountry] Fetching search results from ${searchUrl}`);

    const html = await fetchPageWithBrowser(searchUrl);
    const partials = parseProductsFromHtml(html);
    console.log(`[backcountry] Found ${partials.length} product cards`);

    const withUrls = partials.filter((p) => p.salePrice && p.url);
    console.log(`[backcountry] Fetching details for ${withUrls.length} boards`);

    const boards: RawBoard[] = [];
    for (const partial of withUrls) {
      const result = await fetchBoardDetails(partial);
      if (result) {
        if (Array.isArray(result)) boards.push(...result);
        else boards.push(result);
      }
    }

    console.log(`[backcountry] Successfully scraped ${boards.length} boards`);
    return adaptRetailerOutput(boards, "backcountry");
  },
};
