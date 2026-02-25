import { Currency } from "../types";
import { ScrapedListing } from "../scrapers/types";

export interface ShopifyVariant {
  title: string;
  price: string;
  compare_at_price: string | null;
  available: boolean;
}

/**
 * Convert Shopify product variants into ScrapedListing[] and an MSRP.
 *
 * - `compare_at_price` non-null → on sale: originalPrice = compare_at_price, salePrice = price
 * - `compare_at_price` null → not on sale: salePrice = price, originalPrice omitted
 * - MSRP = compare_at_price ?? price (first variant's non-discounted price)
 * - Variant title is parsed for lengthCm and wide detection
 */
export function extractShopifyListings(
  variants: ShopifyVariant[],
  productUrl: string,
  currency: Currency
): { listings: ScrapedListing[]; msrpUsd: number | null } {
  const listings: ScrapedListing[] = [];
  let msrpUsd: number | null = null;

  for (const variant of variants) {
    const price = parseFloat(variant.price);
    if (isNaN(price)) continue;

    const compareAt = variant.compare_at_price
      ? parseFloat(variant.compare_at_price)
      : null;

    // MSRP from first valid variant: prefer compare_at_price, fall back to price
    if (msrpUsd === null) {
      msrpUsd = (compareAt && !isNaN(compareAt)) ? compareAt : price;
    }

    // Parse size from variant title: "154", "159W", "156 UW", "Default Title"
    const sizeMatch = variant.title.match(/(\d+(?:\.\d+)?)\s*([Ww]|UW)?/);
    const lengthCm = sizeMatch ? parseFloat(sizeMatch[1]) : undefined;
    const isWide = sizeMatch ? !!sizeMatch[2] : false;

    // Skip non-size variants (e.g. "Default Title" with no number)
    if (!lengthCm) continue;

    const extras: Record<string, string> = {};
    if (isWide) extras["wide"] = "true";

    const onSale = compareAt !== null && !isNaN(compareAt) && compareAt > price;

    listings.push({
      url: productUrl,
      lengthCm,
      originalPrice: onSale ? compareAt : undefined,
      salePrice: price,
      currency,
      availability: variant.available ? "in_stock" : "out_of_stock",
      condition: "new",
      scrapedAt: new Date().toISOString(),
    });
  }

  return { listings, msrpUsd };
}
