/**
 * Integration tests for Mervin (GNU + Lib Tech) profile variant board identification.
 *
 * These tests read actual cached HTML from data/http-cache.db and run it through
 * the real scraper parsing and adapter pipeline, then verify that identifyBoards()
 * correctly groups and splits profile variants.
 *
 * Each test case corresponds to a known bug from task 39's data audit:
 *   1. GNU Ladies Choice — C2X vs Camber/C3
 *   2. Lib Tech Skunk Ape — C2X vs C3 (+ Twin as separate board)
 *   3. GNU Money — C2E (/money) vs C3 (/c-money)
 *   4. GNU Gloss — C2E (/gloss) vs C3 (/gloss-c)
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import path from "path";
import { identifyBoards } from "../lib/scrapers/coalesce";
import { adaptRetailerOutput, adaptManufacturerOutput } from "../lib/scrapers/adapters";
import type { ManufacturerSpec } from "../lib/scrapers/adapters";
import type { ScrapedBoard } from "../lib/scrapers/types";
import type { RawBoard } from "../lib/types";
import { Currency } from "../lib/types";

// Manufacturer scraper parseDetailHtml exports
import { parseDetailHtml as parseGnuDetailHtml } from "../lib/manufacturers/gnu";
import { parseDetailHtml as parseLibTechDetailHtml } from "../lib/manufacturers/lib-tech";

// Retailer scraper parseDetailHtml exports
import { parseDetailHtml as parseEvoDetailHtml } from "../lib/retailers/evo";
import { parseDetailHtml as parseBackcountryDetailHtml } from "../lib/retailers/backcountry";
import { parseDetailHtml as parseTacticsDetailHtml } from "../lib/retailers/tactics";

// Mock only DB side-effect functions — use real specKey for proper strategy dispatch
vi.mock("../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/db")>();
  return {
    ...actual,
    setSpecSource: vi.fn(),
    generateListingId: vi.fn(
      (retailer: string, url: string, lengthCm?: number) =>
        `${retailer}|${url}|${lengthCm ?? ""}`
    ),
    setCachedSpecs: vi.fn(),
    getCachedSpecs: vi.fn(() => null),
  };
});

vi.mock("../lib/scoring", () => ({
  calcBeginnerScoreForBoard: vi.fn(() => 0.5),
}));

// ─── Test infrastructure ─────────────────────────────────────────────────

let db: Database.Database;
let getHtml: (url: string) => string | undefined;

beforeAll(() => {
  const dbPath = path.resolve(__dirname, "../../data/http-cache.db");
  db = new Database(dbPath, { readonly: true });
  const stmt = db.prepare("SELECT body FROM http_cache WHERE url = ?");
  getHtml = (url: string) => (stmt.get(url) as { body: string } | undefined)?.body;
});

afterAll(() => {
  db?.close();
});

/**
 * Parse a manufacturer page and adapt to ScrapedBoard[].
 *
 * catalogGender mirrors the real pipeline where gnu.ts scrape() sets
 * spec.gender from the catalog URL context (/snowboards/womens vs /snowboards/mens),
 * since individual detail pages don't contain gender information.
 */
async function parseMfr(
  url: string,
  brand: "GNU" | "Lib Tech",
  catalogGender?: string
): Promise<ScrapedBoard[]> {
  const html = getHtml(url);
  if (!html) return [];
  const parse = brand === "GNU" ? parseGnuDetailHtml : parseLibTechDetailHtml;
  const spec: ManufacturerSpec = await parse(html, url, "", null);
  if (catalogGender) spec.gender = catalogGender;
  return adaptManufacturerOutput([spec], brand);
}

/** Parse a retailer detail page and adapt to ScrapedBoard[] */
function parseRetailer(
  url: string,
  retailer: "evo" | "backcountry" | "tactics"
): ScrapedBoard[] {
  const html = getHtml(url);
  if (!html) return [];
  const partial: Partial<RawBoard> = { url, currency: Currency.USD };
  let rawBoards: RawBoard | RawBoard[] | null;
  if (retailer === "evo") {
    rawBoards = parseEvoDetailHtml(html, partial);
  } else if (retailer === "backcountry") {
    rawBoards = parseBackcountryDetailHtml(html, partial);
  } else {
    rawBoards = parseTacticsDetailHtml(html, partial);
  }
  if (!rawBoards) return [];
  const arr = Array.isArray(rawBoards) ? rawBoards : [rawBoards];
  return adaptRetailerOutput(arr, retailer);
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe("Mervin profile variant integration (cached HTML)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =======================================================================
  // 1. GNU Ladies Choice — C2X vs C3
  // =======================================================================
  describe("GNU Ladies Choice", () => {
    it("splits C2X and C3 variants from manufacturer + retailer sources", async () => {
      const scraped: ScrapedBoard[] = [
        ...(await parseMfr("https://www.gnu.com/ladies-choice", "GNU", "womens")),
        ...(await parseMfr("https://www.gnu.com/ladies-choice-camber", "GNU", "womens")),
        ...parseRetailer("https://www.evo.com/snowboards/gnu-asym-ladies-choice-c2x-snowboard-womens", "evo"),
        ...parseRetailer("https://www.backcountry.com/gnu-ladies-choice-snowboard-2026-womens", "backcountry"),
      ];

      expect(scraped.length).toBeGreaterThanOrEqual(2);

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      expect(keys).toContain("gnu|ladies choice c2x|womens");
      expect(keys).toContain("gnu|ladies choice c3|womens");

      const c2xGroup = groups.get("gnu|ladies choice c2x|womens")!;
      expect(c2xGroup).toBeDefined();
      expect(
        c2xGroup.scraped.some((s) =>
          s.sourceUrl.includes("gnu.com/ladies-choice") &&
          !s.sourceUrl.includes("camber")
        )
      ).toBe(true);

      const c3Group = groups.get("gnu|ladies choice c3|womens")!;
      expect(c3Group).toBeDefined();
      expect(
        c3Group.scraped.some((s) =>
          s.sourceUrl.includes("ladies-choice-camber")
        )
      ).toBe(true);
    });
  });

  // =======================================================================
  // 2. Lib Tech Skunk Ape — C2X vs C3 (+ Twin as separate board)
  // =======================================================================
  describe("Lib Tech Skunk Ape", () => {
    it("splits C2X and C3 variants, with Twin as a separate board", async () => {
      const scraped: ScrapedBoard[] = [
        ...(await parseMfr("https://www.lib-tech.com/skunk-ape", "Lib Tech")),
        ...(await parseMfr("https://www.lib-tech.com/skunk-ape-camber", "Lib Tech")),
        ...(await parseMfr("https://www.lib-tech.com/skunk-ape-twin", "Lib Tech")),
        ...parseRetailer("https://www.evo.com/snowboards/lib-tech-skunk-ape-c2x-snowboard", "evo"),
        ...parseRetailer("https://www.evo.com/snowboards/lib-tech-skunk-ape-c3-snowboard", "evo"),
        ...parseRetailer("https://www.backcountry.com/lib-technologies-skunk-ape-snowboard-2026", "backcountry"),
        ...parseRetailer("https://www.backcountry.com/lib-technologies-skunk-ape-camber-snowboard-2026", "backcountry"),
        ...parseRetailer("https://www.tactics.com/lib-tech/skunk-ape-camber-snowboard", "tactics"),
      ];

      expect(scraped.length).toBeGreaterThanOrEqual(3);

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      expect(keys).toContain("lib tech|skunk ape c2x|unisex");
      expect(keys).toContain("lib tech|skunk ape c3|unisex");
      expect(keys.some((k) => k.includes("skunk ape twin"))).toBe(true);

      const c2xGroup = groups.get("lib tech|skunk ape c2x|unisex")!;
      expect(c2xGroup).toBeDefined();
      expect(
        c2xGroup.scraped.some(
          (s) =>
            s.sourceUrl.includes("lib-tech.com/skunk-ape") &&
            !s.sourceUrl.includes("camber") &&
            !s.sourceUrl.includes("twin")
        )
      ).toBe(true);

      const c3Group = groups.get("lib tech|skunk ape c3|unisex")!;
      expect(c3Group).toBeDefined();
      expect(
        c3Group.scraped.some((s) =>
          s.sourceUrl.includes("skunk-ape-camber")
        )
      ).toBe(true);
    });
  });

  // =======================================================================
  // 3. GNU Money — C2E (/money) vs C3 (/c-money)
  // =======================================================================
  describe("GNU Money", () => {
    it("splits /money (C2E) and /c-money (C3) into separate boards", async () => {
      const scraped: ScrapedBoard[] = [
        ...(await parseMfr("https://www.gnu.com/money", "GNU")),
        ...(await parseMfr("https://www.gnu.com/c-money", "GNU")),
        ...parseRetailer("https://www.evo.com/snowboards/gnu-money-c2e-snowboard-2025", "evo"),
        ...parseRetailer("https://www.tactics.com/gnu/c-money-c3-snowboard", "tactics"),
        ...parseRetailer("https://www.backcountry.com/gnu-money-snowboard-2026", "backcountry"),
      ];

      expect(scraped.length).toBeGreaterThanOrEqual(2);

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      expect(keys).toContain("gnu|money c2e|unisex");
      expect(keys).toContain("gnu|money c3|unisex");

      const c2eGroup = groups.get("gnu|money c2e|unisex")!;
      expect(c2eGroup).toBeDefined();
      expect(
        c2eGroup.scraped.some((s) => s.sourceUrl === "https://www.gnu.com/money")
      ).toBe(true);

      const c3Group = groups.get("gnu|money c3|unisex")!;
      expect(c3Group).toBeDefined();
      expect(
        c3Group.scraped.some((s) => s.sourceUrl === "https://www.gnu.com/c-money")
      ).toBe(true);
    });
  });

  // =======================================================================
  // 4. GNU Gloss — C2E (/gloss) vs C3 (/gloss-c)
  // =======================================================================
  describe("GNU Gloss", () => {
    it("splits /gloss (C2E) and /gloss-c (C3) into separate boards", async () => {
      const scraped: ScrapedBoard[] = [
        ...(await parseMfr("https://www.gnu.com/gloss", "GNU", "womens")),
        ...(await parseMfr("https://www.gnu.com/gloss-c", "GNU", "womens")),
        ...parseRetailer("https://www.evo.com/snowboards/gnu-gloss-c-c3-snowboard-womens-2025", "evo"),
        ...parseRetailer("https://www.backcountry.com/gnu-gloss-snowboard-2026-womens", "backcountry"),
        ...parseRetailer("https://www.backcountry.com/gnu-gloss-c-snowboard-2026-womens", "backcountry"),
      ];

      expect(scraped.length).toBeGreaterThanOrEqual(2);

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      expect(keys).toContain("gnu|gloss c2e|womens");
      expect(keys).toContain("gnu|gloss c3|womens");

      const c2eGroup = groups.get("gnu|gloss c2e|womens")!;
      expect(c2eGroup).toBeDefined();
      expect(
        c2eGroup.scraped.some((s) =>
          s.sourceUrl === "https://www.gnu.com/gloss"
        )
      ).toBe(true);

      const c3Group = groups.get("gnu|gloss c3|womens")!;
      expect(c3Group).toBeDefined();
      expect(
        c3Group.scraped.some((s) =>
          s.sourceUrl === "https://www.gnu.com/gloss-c"
        )
      ).toBe(true);
    });
  });
});
