import { ManufacturerModule, ManufacturerSpec } from "./types";
import { fetchPage } from "../scraping/utils";

const BURTON_BASE = "https://www.burton.com";
const MENS_URL = `${BURTON_BASE}/us/en/c/mens-boards?start=0&sz=100`;
const WOMENS_URL = `${BURTON_BASE}/us/en/c/womens-boards?start=0&sz=100`;

/**
 * Burton scraper.
 * Catalog pages are server-rendered with a `window.__bootstrap` JSON blob
 * containing full product data (name, price, description, URLs).
 * Plain fetch works — no browser needed for the catalog.
 *
 * For detail page enrichment (flex/profile from PDP), use the
 * POST /api/scrape-specs?detail=1 endpoint which runs inside the
 * dev server (outside Claude's sandbox, so Playwright works).
 */

interface BootstrapProduct {
  product: {
    productName: string;
    longDescription: string;
    shortDescription: string;
    shortDescriptionValue: string;
    price: { list: { value: number | null }; sales: { value: number | null } };
  };
  urls: { product: string };
}

async function scrapeListingPage(url: string): Promise<ManufacturerSpec[]> {
  const html = await fetchPage(url, { timeoutMs: 20000 });
  const specs: ManufacturerSpec[] = [];

  // Extract window.__bootstrap JSON — use greedy match since the blob is large
  const startMarker = "window.__bootstrap = ";
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) {
    console.warn("[burton] No __bootstrap found in page");
    return specs;
  }

  // Find the matching closing by looking for };\n</script>
  const jsonStart = startIdx + startMarker.length;
  const endMarker = "};\n</script>";
  const endIdx = html.indexOf(endMarker, jsonStart);
  if (endIdx < 0) {
    console.warn("[burton] Could not find end of __bootstrap JSON");
    return specs;
  }

  const jsonStr = html.slice(jsonStart, endIdx + 1); // include the final }

  let data: { data?: { productSearch?: { productIds?: { productSearchHit?: BootstrapProduct }[] } } };
  try {
    // Burton's __bootstrap has trailing commas in arrays/objects — strip them
    const cleanedJson = jsonStr
      .replace(/,\s*([}\]])/g, "$1");
    data = JSON.parse(cleanedJson);
  } catch (err) {
    console.warn("[burton] Failed to parse __bootstrap JSON:", err instanceof Error ? err.message : err);
    return specs;
  }

  const products = data?.data?.productSearch?.productIds ?? [];
  for (const entry of products) {
    const hit = entry.productSearchHit;
    if (!hit) continue;

    const p = hit.product;
    const name = p.productName || "";
    if (!name) continue;

    const productPath = hit.urls?.product || "";
    const sourceUrl = productPath.startsWith("http") ? productPath : `${BURTON_BASE}${productPath}`;

    const msrp = p.price?.list?.value ?? p.price?.sales?.value ?? null;

    // Extract profile from product name — Burton encodes bend in the name:
    // "Custom Camber", "Process Flying V", "Instigator PurePop Camber"
    const cleanedName = cleanModelName(name);
    const { profile, shape, category } = extractSpecsFromText(
      name + " " + (p.shortDescriptionValue || "") + " " + (p.longDescription || "")
    );

    specs.push({
      brand: "Burton",
      model: cleanedName,
      year: null,
      flex: null, // Not available from catalog page
      profile,
      shape,
      category,
      msrpUsd: msrp,
      sourceUrl,
    });
  }

  return specs;
}

function extractSpecsFromText(text: string): {
  profile: string | null;
  shape: string | null;
  category: string | null;
} {
  const lower = text.toLowerCase();

  // Profile — Burton bend names
  let profile: string | null = null;
  if (lower.includes("purepop camber") || lower.includes("pure pop camber")) profile = "hybrid_rocker";
  else if (lower.includes("flying v")) profile = "flying v";
  else if (lower.includes("directional flat top")) profile = "directional flat top";
  else if (lower.includes("flat top")) profile = "flat top";
  else if (lower.includes("camber")) profile = "camber";
  else if (lower.includes("bend")) profile = "bend";

  // Shape
  let shape: string | null = null;
  if (lower.includes("true twin") || lower.includes("twin flex")) shape = "true twin";
  else if (lower.includes("directional twin")) shape = "directional twin";
  else if (lower.includes("directional shape") || lower.includes("directional board")) shape = "directional";
  else if (lower.includes("tapered")) shape = "tapered";
  // Infer from description keywords
  else if (lower.includes("twin") && lower.includes("freestyle")) shape = "true twin";
  else if (lower.includes("directional")) shape = "directional";

  // Category
  let category: string | null = null;
  if (lower.includes("all-mountain") || lower.includes("all mountain") || lower.includes("quiver-of-one") || lower.includes("quiver of one")) category = "all-mountain";
  else if (lower.includes("park") && lower.includes("pipe")) category = "park";
  else if (lower.includes("freestyle") || lower.includes("playful")) category = "freestyle";
  else if (lower.includes("freeride") || lower.includes("backcountry") || lower.includes("big mountain")) category = "freeride";
  else if (lower.includes("powder") || lower.includes("deep snow") || lower.includes("float")) category = "powder";
  else if (lower.includes("park")) category = "park";
  else if (lower.includes("beginner") || lower.includes("learning curve")) category = "all-mountain";

  return { profile, shape, category };
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^(?:Men's|Women's|Kids'|Boy's|Girl's)\s+/i, "")
    .replace(/^Burton\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .trim();
}

export const burton: ManufacturerModule = {
  brand: "Burton",
  baseUrl: BURTON_BASE,

  async scrapeSpecs(): Promise<ManufacturerSpec[]> {
    console.log("[burton] Scraping manufacturer specs...");

    const [mensSpecs, womensSpecs] = await Promise.all([
      scrapeListingPage(MENS_URL).catch((err) => {
        console.warn("[burton] Failed to scrape men's catalog:", err instanceof Error ? err.message : err);
        return [] as ManufacturerSpec[];
      }),
      scrapeListingPage(WOMENS_URL).catch((err) => {
        console.warn("[burton] Failed to scrape women's catalog:", err instanceof Error ? err.message : err);
        return [] as ManufacturerSpec[];
      }),
    ]);

    const allSpecs = [...mensSpecs, ...womensSpecs];
    console.log(`[burton] Found ${allSpecs.length} boards from catalog pages`);

    return allSpecs;
  },
};
