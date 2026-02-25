import { ScraperModule, ScrapedBoard } from "../scrapers/types";
import { ManufacturerSpec, adaptManufacturerOutput } from "../scrapers/adapters";
import { fetchPage } from "../scraping/utils";

const BURTON_BASE = "https://www.burton.com";
const MENS_URL = `${BURTON_BASE}/us/en/c/mens-boards?start=0&sz=100`;
const WOMENS_URL = `${BURTON_BASE}/us/en/c/womens-boards?start=0&sz=100`;

/**
 * Burton scraper.
 * Catalog pages have a `window.__bootstrap` JSON blob with product listings.
 * Detail pages also have `__bootstrap` with rich structured attributes
 * (Board Skill Level, Board Terrain, Board Bend, Board Shape, sizing, etc.).
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

interface CatalogBoard {
  name: string;
  sourceUrl: string;
  msrp: number | null;
  description: string;
}

/**
 * Extract flex rating from Burton's "Personality" slider in __bootstrap JSON.
 * The slider has lowerValue/upperValue on a 0–100 scale (soft→stiff).
 * We take the midpoint and map to a 1–10 flex rating.
 *
 * Example: {"title":"Personality",...,"lowerValue":"40","upperValue":"70"} → midpoint 55 → flex 6
 */
function extractPersonalityFlex(html: string): number | null {
  const m = html.match(
    /"title"\s*:\s*"Personality"[^}]*"lowerValue"\s*:\s*"(\d+)"[^}]*"upperValue"\s*:\s*"(\d+)"/
  );
  if (!m) return null;
  const lower = parseInt(m[1], 10);
  const upper = parseInt(m[2], 10);
  const midpoint = (lower + upper) / 2;
  // Map 0–100 → 1–10, clamping to valid range
  return Math.max(1, Math.min(10, Math.round(midpoint / 10)));
}

/**
 * Extract label/value attribute pairs from a Burton detail page's __bootstrap JSON.
 * Full JSON parsing fails on detail pages (malformed JSON), so we use regex.
 */
function extractDetailAttrs(html: string): Record<string, string[]> {
  const attrs: Record<string, string[]> = {};
  const regex = /"label"\s*:\s*"([^"]+)"\s*,\s*"value"\s*:\s*(\[[^\]]*\])/g;
  const seen = new Set<string>();
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      try {
        attrs[m[1]] = JSON.parse(m[2]);
      } catch {
        attrs[m[1]] = [m[2]];
      }
    }
  }
  return attrs;
}

interface DetailPageResult {
  attrs: Record<string, string[]>;
  flex: number | null;
}

async function scrapeDetailPage(boardUrl: string): Promise<DetailPageResult> {
  const html = await fetchPage(boardUrl, { timeoutMs: 20000 });
  return {
    attrs: extractDetailAttrs(html),
    flex: extractPersonalityFlex(html),
  };
}

function parseCatalogHtml(html: string): CatalogBoard[] {
  const boards: CatalogBoard[] = [];

  const startMarker = "window.__bootstrap = ";
  const startIdx = html.indexOf(startMarker);
  if (startIdx < 0) {
    console.warn("[burton] No __bootstrap found in page");
    return boards;
  }

  const jsonStart = startIdx + startMarker.length;
  const endMarker = "};\n</script>";
  const endIdx = html.indexOf(endMarker, jsonStart);
  if (endIdx < 0) {
    console.warn("[burton] Could not find end of __bootstrap JSON");
    return boards;
  }

  const jsonStr = html.slice(jsonStart, endIdx + 1);

  let data: { data?: { productSearch?: { productIds?: { productSearchHit?: BootstrapProduct }[] } } };
  try {
    const cleanedJson = jsonStr.replace(/,\s*([}\]])/g, "$1");
    data = JSON.parse(cleanedJson);
  } catch (err) {
    console.warn("[burton] Failed to parse __bootstrap JSON:", err instanceof Error ? err.message : err);
    return boards;
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
    const description = (p.shortDescriptionValue || "") + " " + (p.longDescription || "");

    boards.push({ name, sourceUrl, msrp, description });
  }

  return boards;
}

async function scrapeListingPage(url: string): Promise<CatalogBoard[]> {
  const html = await fetchPage(url, { timeoutMs: 20000 });
  return parseCatalogHtml(html);
}

/**
 * Map Burton's "Board Skill Level" array to a combined ability level string.
 * e.g. ["Intermediate", "Expert"] → "intermediate-expert"
 */
function mapSkillLevel(values: string[]): string {
  const levels = values.map(v => v.toLowerCase());
  if (levels.length === 1) return levels[0];
  // Sort by progression order and return min-max
  const ORDER = ["beginner", "intermediate", "advanced", "expert"];
  const sorted = levels.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

/**
 * Map Burton's "Board Bend" to a normalized profile string.
 */
function mapBend(value: string): string | null {
  const lower = value.toLowerCase();
  if (lower.includes("purepop") || lower === "purepop camber") return "hybrid_rocker";
  if (lower.includes("flying v")) return "flying v";
  if (lower === "directional flat top") return "directional flat top";
  if (lower.includes("flat top")) return "flat top";
  if (lower.includes("camber")) return "camber";
  return value;
}

/**
 * Map Burton's "Board Terrain" to a normalized category.
 */
function mapTerrain(value: string): string | null {
  const lower = value.toLowerCase();
  if (lower.includes("all mountain")) return "all-mountain";
  if (lower === "park" || lower.includes("park")) return "park";
  if (lower.includes("freestyle")) return "freestyle";
  if (lower.includes("freeride") || lower.includes("backcountry")) return "freeride";
  if (lower.includes("powder")) return "powder";
  return value;
}

/**
 * Map Burton's "Board Shape" to a normalized shape.
 */
function mapShape(value: string): string | null {
  const lower = value.toLowerCase();
  if (lower.includes("true twin") || lower === "twin") return "true twin";
  if (lower.includes("directional twin")) return "directional twin";
  if (lower.includes("directional")) return "directional";
  if (lower.includes("tapered")) return "tapered directional";
  return value;
}

/**
 * Derive gender from Burton product name prefix.
 * Burton names start with "Men's", "Women's", or "Kids'" —
 * only tag as gendered if the name explicitly says so.
 */
function deriveGenderFromName(name: string): string | undefined {
  if (/^Women's\b/i.test(name)) return "womens";
  if (/^Kids'\b/i.test(name) || /^Boy's\b/i.test(name) || /^Girl's\b/i.test(name)) return "kids";
  // Don't tag "Men's" as mens — Burton lists most unisex boards under men's
  return undefined;
}

function cleanModelName(raw: string): string {
  return raw
    .replace(/^(?:Men's|Women's|Kids'|Boy's|Girl's)\s+/i, "")
    .replace(/^Burton\s+/i, "")
    .replace(/\s+Snowboard$/i, "")
    .replace(/\s+Splitboard$/i, " Splitboard")
    .trim();
}

/** Attribute labels we store as extras */
const EXTRA_ATTRS = [
  "Board Terrain", "Board Bend", "Board Shape", "Board Skill Level",
  "Rider Weight Range", "Effective Edge", "Waist Width", "Sidecut Radius",
  "Taper", "Stance Width", "Stance Location", "Nose Width", "Tail Width",
  "Camber",
];

export const burton: ScraperModule = {
  name: "manufacturer:burton",
  sourceType: "manufacturer",
  baseUrl: BURTON_BASE,

  async scrape(): Promise<ScrapedBoard[]> {
    console.log("[burton] Scraping manufacturer specs...");

    // Phase 1: Get board list from catalog pages
    const [mensBoards, womensBoards] = await Promise.all([
      scrapeListingPage(MENS_URL).catch((err) => {
        console.warn("[burton] Failed to scrape men's catalog:", err instanceof Error ? err.message : err);
        return [] as CatalogBoard[];
      }),
      scrapeListingPage(WOMENS_URL).catch((err) => {
        console.warn("[burton] Failed to scrape women's catalog:", err instanceof Error ? err.message : err);
        return [] as CatalogBoard[];
      }),
    ]);

    const allBoards = [...mensBoards, ...womensBoards];
    console.log(`[burton] Found ${allBoards.length} boards from catalog pages`);

    // Phase 2: Fetch detail pages (concurrency 3)
    const CONCURRENCY = 3;
    const detailData = new Map<string, DetailPageResult>();
    for (let i = 0; i < allBoards.length; i += CONCURRENCY) {
      const batch = allBoards.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (board) => {
          try {
            const result = await scrapeDetailPage(board.sourceUrl);
            return { url: board.sourceUrl, result };
          } catch (err) {
            console.warn(`[burton] Failed to scrape detail page ${board.sourceUrl}:`, err instanceof Error ? err.message : err);
            return { url: board.sourceUrl, result: null };
          }
        })
      );
      for (const { url, result } of results) {
        if (result) detailData.set(url, result);
      }
    }

    console.log(`[burton] Fetched ${detailData.size}/${allBoards.length} detail pages`);

    // Phase 3: Merge catalog + detail page data
    const specs: ManufacturerSpec[] = [];
    for (const board of allBoards) {
      const detail = detailData.get(board.sourceUrl);
      const extras: Record<string, string> = {};

      let flex: number | null = null;
      let profile: string | null = null;
      let shape: string | null = null;
      let category: string | null = null;

      if (detail) {
        flex = detail.flex;

        const attrs = detail.attrs;

        // Use structured detail page attributes (much more reliable than text parsing)
        const bend = attrs["Board Bend"];
        if (bend?.[0]) profile = mapBend(bend[0]);

        const shapeVal = attrs["Board Shape"];
        if (shapeVal?.[0]) shape = mapShape(shapeVal[0]);

        const terrain = attrs["Board Terrain"];
        if (terrain?.[0]) category = mapTerrain(terrain[0]);

        const skillLevel = attrs["Board Skill Level"];
        if (skillLevel && skillLevel.length > 0) {
          extras["ability level"] = mapSkillLevel(skillLevel);
        }

        // Store all interesting attributes as extras
        for (const label of EXTRA_ATTRS) {
          const vals = attrs[label];
          if (vals && vals.length > 0) {
            const key = label.toLowerCase().replace(/^board\s+/, "");
            if (!extras[key]) {
              extras[key] = vals.join(", ");
            }
          }
        }
      }

      specs.push({
        brand: "Burton",
        model: cleanModelName(board.name),
        year: null,
        flex: flex != null ? String(flex) : null,
        profile,
        shape,
        category,
        gender: deriveGenderFromName(board.name),
        msrpUsd: board.msrp,
        sourceUrl: board.sourceUrl,
        extras,
      });
    }

    return adaptManufacturerOutput(specs, "Burton");
  },
};

// Test exports
export { extractDetailAttrs, extractPersonalityFlex, mapSkillLevel, mapBend, mapTerrain, mapShape, cleanModelName, parseCatalogHtml };
