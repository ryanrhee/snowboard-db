import * as cheerio from "cheerio";
import { fetchPage } from "../scraping/utils";
import {
  getSitemapCache,
  setSitemapCache,
  getReviewUrlMap,
  setReviewUrlMap,
  SitemapEntry,
} from "../db";

// ===== Types =====

export interface ReviewSiteSpec {
  flex: string | null;
  profile: string | null;
  shape: string | null;
  category: string | null;
  msrpUsd: number | null;
  sourceUrl: string;
  abilityLevel: string | null;
  extras: Record<string, string>;
}

// ===== Constants =====

const SITEMAP_URL = "https://www.thegoodride.com/snowboardreviews-sitemap.xml";
const REVIEW_URL_PATTERN = /\/snowboard-reviews\/(.+)-snowboard-review\/?$/;
const MATCH_THRESHOLD = 0.6;
const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Multi-word brands whose slug uses hyphens within the brand name.
 * Order matters: longer prefixes first so "never-summer" matches before "never".
 */
const KNOWN_SLUG_BRANDS: [string, string][] = [
  ["dinosaurs-will-die", "Dinosaurs Will Die"],
  ["academy-snowboards", "Academy"],
  ["never-summer", "Never Summer"],
  ["lib-tech", "Lib Tech"],
  ["gnu-snowboards", "GNU"],
  ["jones-snowboards", "Jones"],
  ["yes-snowboards", "Yes."],
  ["niche-snowboards", "Niche"],
  ["rome-sds", "Rome"],
  ["k2-snowboarding", "K2"],
  ["signal-snowboards", "Signal"],
  ["weston-snowboards", "Weston"],
  ["arbor-snowboards", "Arbor"],
  ["marhar-snowboards", "Marhar"],
  ["united-shapes", "United Shapes"],
  ["korua-shapes", "Korua"],
  ["moss-snowstick", "Moss Snowstick"],
  ["spring-break", "Spring Break"],
];

// ===== Bigram / Dice Coefficient =====

function bigrams(s: string): Set<string> {
  const lower = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const set = new Set<string>();
  for (let i = 0; i < lower.length - 1; i++) {
    set.add(lower.slice(i, i + 2));
  }
  return set;
}

function diceCoefficient(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

// ===== Sitemap Loading =====

/**
 * Parse a sitemap XML string and extract <loc> URLs.
 * Handles both sitemap-index (sub-sitemaps) and regular sitemaps.
 */
function parseSitemapUrls(xml: string): { urls: string[]; subSitemaps: string[] } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls: string[] = [];
  const subSitemaps: string[] = [];

  // Check for sitemap index
  $("sitemapindex sitemap loc").each((_, el) => {
    subSitemaps.push($(el).text().trim());
  });

  // Regular sitemap URLs
  $("urlset url loc").each((_, el) => {
    urls.push($(el).text().trim());
  });

  return { urls, subSitemaps };
}

/**
 * Parse a review URL slug into brand + model.
 * e.g. "lib-tech-skate-banana" → { brand: "Lib Tech", model: "skate banana" }
 */
function parseSlug(slug: string): { brand: string; model: string } | null {
  // Try known multi-word brands first
  for (const [prefix, brandName] of KNOWN_SLUG_BRANDS) {
    if (slug.startsWith(prefix + "-")) {
      const model = slug.slice(prefix.length + 1).replace(/-/g, " ").trim();
      if (model) return { brand: brandName, model };
    }
    if (slug === prefix) {
      return null; // Brand-only slug, no model
    }
  }

  // Default: first segment is brand, rest is model
  const parts = slug.split("-");
  if (parts.length < 2) return null;

  const brand = parts[0];
  const model = parts.slice(1).join(" ");
  return { brand, model };
}

/**
 * Fetch and parse the sitemap, handling sub-sitemaps if present.
 * Returns only review URLs matching the expected pattern.
 * Results are cached in SQLite with 24h TTL.
 */
export async function getSitemapIndex(): Promise<SitemapEntry[]> {
  // Check DB cache freshness
  const cached = getSitemapCache();
  if (cached.length > 0) {
    const oldest = cached[0];
    const age = Date.now() - new Date(oldest.fetchedAt).getTime();
    if (age < SITEMAP_TTL_MS) {
      return cached;
    }
  }

  console.log("[the-good-ride] Fetching sitemap...");

  const entries: SitemapEntry[] = [];
  const xml = await fetchPage(SITEMAP_URL, { timeoutMs: 30000 });
  const { urls, subSitemaps } = parseSitemapUrls(xml);

  // Collect all review URLs (from index or direct)
  let allUrls = urls;
  if (subSitemaps.length > 0) {
    const subResults = await Promise.all(
      subSitemaps
        .filter((u) => u.includes("snowboardreview"))
        .map(async (subUrl) => {
          try {
            const subXml = await fetchPage(subUrl, { timeoutMs: 30000 });
            return parseSitemapUrls(subXml).urls;
          } catch (err) {
            console.warn(`[the-good-ride] Failed to fetch sub-sitemap: ${subUrl}`);
            return [];
          }
        })
    );
    allUrls = allUrls.concat(subResults.flat());
  }

  // Filter to review URLs and parse slugs
  for (const url of allUrls) {
    const match = url.match(REVIEW_URL_PATTERN);
    if (!match) continue;

    const slug = match[1];
    const parsed = parseSlug(slug);
    if (!parsed) continue;

    entries.push({
      url,
      slug,
      brand: parsed.brand,
      model: parsed.model,
      fetchedAt: new Date().toISOString(),
    });
  }

  console.log(`[the-good-ride] Found ${entries.length} review URLs in sitemap`);
  setSitemapCache(entries);
  return entries;
}

// ===== URL Resolution =====

/**
 * Find the best-matching review URL for a given brand + model.
 * Uses Dice coefficient on the model portion of the slug.
 * Caches results (including misses) in review_url_map.
 */
export async function resolveReviewUrl(
  brand: string,
  model: string
): Promise<string | null> {
  const brandModel = `${brand.toLowerCase()}|${model.toLowerCase()}`;

  // Check URL map cache
  const cached = getReviewUrlMap(brandModel);
  if (cached !== undefined) {
    if (cached === null) {
      // Cached miss — check TTL
      return null;
    }
    return cached;
  }

  let entries: SitemapEntry[];
  try {
    entries = await getSitemapIndex();
  } catch (err) {
    console.warn("[the-good-ride] Sitemap fetch failed:", (err as Error).message);
    return null;
  }

  if (entries.length === 0) return null;

  // Filter by brand (case-insensitive)
  const brandLower = brand.toLowerCase();
  const brandEntries = entries.filter(
    (e) => e.brand.toLowerCase() === brandLower
  );

  if (brandEntries.length === 0) {
    // No entries for this brand — cache the miss
    setReviewUrlMap(brandModel, null);
    return null;
  }

  // Score by Dice coefficient on model portion
  let bestUrl: string | null = null;
  let bestScore = 0;

  for (const entry of brandEntries) {
    const score = diceCoefficient(model, entry.model);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = entry.url;
    }
  }

  if (bestScore >= MATCH_THRESHOLD && bestUrl) {
    setReviewUrlMap(brandModel, bestUrl);
    return bestUrl;
  }

  // Cache the miss
  setReviewUrlMap(brandModel, null);
  return null;
}

// ===== Spec Parsing =====

/**
 * Scrape specs from a Good Ride review page.
 * Extracts: shape, camber profile, riding style (→ category), flex, MSRP.
 */
function parseReviewHtml(html: string, url: string): ReviewSiteSpec | null {
  const $ = cheerio.load(html);

  let shape: string | null = null;
  let profile: string | null = null;
  let category: string | null = null;
  let flex: string | null = null;
  let msrpUsd: number | null = null;
  let abilityLevel: string | null = null;
  const extras: Record<string, string> = {};

  // Parse table specs: <td>Label</td><td class="rating-align-right">Value</td>
  $("td").each((_, el) => {
    const $td = $(el);
    const label = $td.text().trim().toLowerCase();
    const $valueTd = $td.next("td.rating-align-right");
    if ($valueTd.length === 0) return;
    const value = $valueTd.text().trim();
    if (!value) return;

    // Capture everything into extras
    extras[label] = value;

    if (label === "shape") {
      shape = value;
    } else if (label === "camber profile") {
      profile = value;
    } else if (label === "riding style") {
      category = value;
    } else if (label === "ability level" || label === "rider level" || label === "riding level") {
      abilityLevel = value;
    }
  });

  // Parse flex from rating bar image: <img class="rating-bar" src=".../img/60.png">
  $("img.rating-bar").each((_, el) => {
    const src = $(el).attr("src") || "";
    const match = src.match(/\/img\/(\d+)\.png/);
    if (match && flex === null) {
      const pct = parseInt(match[1], 10);
      // Convert percentage to 1-10 scale
      const flexVal = Math.round(pct / 10);
      if (flexVal >= 1 && flexVal <= 10) {
        flex = String(flexVal);
      }
    }
  });

  // Parse MSRP: <strong>List Price</strong> $529 (USD)
  $("strong").each((_, el) => {
    const $strong = $(el);
    if ($strong.text().trim().toLowerCase().includes("list price") && msrpUsd === null) {
      // Get text after the <strong> tag
      const parent = $strong.parent();
      if (!parent) return;
      const fullText = parent.text();
      const priceMatch = fullText.match(/\$\s*([\d,]+(?:\.\d+)?)/);
      if (priceMatch) {
        msrpUsd = parseFloat(priceMatch[1].replace(/,/g, ""));
      }
    }
  });

  // Only return if we found at least one useful spec
  if (!shape && !profile && !category && flex === null && msrpUsd === null) {
    return null;
  }

  return {
    flex,
    profile,
    shape,
    category,
    msrpUsd,
    sourceUrl: url,
    abilityLevel,
    extras,
  };
}

export async function scrapeReviewSpecs(url: string): Promise<ReviewSiteSpec | null> {
  let html: string;
  try {
    html = await fetchPage(url);
  } catch (err) {
    console.warn(`[the-good-ride] Failed to fetch review: ${url}`, (err as Error).message);
    return null;
  }

  return parseReviewHtml(html, url);
}

// ===== Main Entry Point =====

/**
 * Try to look up specs for a board from The Good Ride.
 * Returns normalized specs or null if no review found.
 */
// Test exports
export { parseSlug, diceCoefficient, parseReviewHtml };

export async function tryReviewSiteLookup(
  brand: string,
  model: string
): Promise<ReviewSiteSpec | null> {
  const url = await resolveReviewUrl(brand, model);
  if (!url) return null;

  console.log(`[the-good-ride] Found review: ${url}`);
  const specs = await scrapeReviewSpecs(url);
  if (!specs) {
    console.warn(`[the-good-ride] No specs parsed from: ${url}`);
    return null;
  }

  return specs;
}
