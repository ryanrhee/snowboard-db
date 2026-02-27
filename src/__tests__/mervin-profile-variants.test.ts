/**
 * Integration tests for Mervin (GNU + Lib Tech) profile variant board identification.
 *
 * These tests verify that different profile variants get different model names
 * naturally — no Phase 3 splitting needed. Variant markers ("Camber", "C Money",
 * "Gloss C") are retained in model names, producing distinct board keys.
 *
 * Each test case corresponds to a known bug from task 39's data audit:
 *   1. GNU Ladies Choice — /ladies-choice vs /ladies-choice-camber
 *   2. Lib Tech Skunk Ape — /skunk-ape vs /skunk-ape-camber (+ Twin as separate board)
 *   3. GNU Money — /money vs /c-money
 *   4. GNU Gloss — /gloss vs /gloss-c
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
import { BrandIdentifier } from "../lib/strategies/brand-identifier";

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
  // 1. GNU Ladies Choice — /ladies-choice vs /ladies-choice-camber
  // =======================================================================
  describe("GNU Ladies Choice", () => {
    it("manufacturer /ladies-choice and /ladies-choice-camber produce different board keys", async () => {
      const scraped: ScrapedBoard[] = [
        ...(await parseMfr("https://www.gnu.com/ladies-choice", "GNU", "womens")),
        ...(await parseMfr("https://www.gnu.com/ladies-choice-camber", "GNU", "womens")),
        ...parseRetailer("https://www.evo.com/snowboards/gnu-asym-ladies-choice-c2x-snowboard-womens", "evo"),
        ...parseRetailer("https://www.backcountry.com/gnu-ladies-choice-snowboard-2026-womens", "backcountry"),
      ];

      expect(scraped.length).toBeGreaterThanOrEqual(2);

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      // "Ladies Choice" (from mfr /ladies-choice, evo C2X stripped, backcountry)
      expect(keys).toContain("gnu|ladies choice|womens");
      // "Ladies Choice Camber" (from mfr /ladies-choice-camber)
      expect(keys).toContain("gnu|ladies choice camber|womens");
    });
  });

  // =======================================================================
  // 2. Lib Tech Skunk Ape — /skunk-ape vs /skunk-ape-camber (+ Twin)
  // =======================================================================
  describe("Lib Tech Skunk Ape", () => {
    it("different variants get separate board keys naturally", async () => {
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

      // "Skunk Ape" (from mfr /skunk-ape, evo C2X/C3 stripped, backcountry generic)
      expect(keys).toContain("lib tech|skunk ape|unisex");
      // "Skunk Ape Camber" (from mfr /skunk-ape-camber, backcountry camber, tactics camber)
      expect(keys).toContain("lib tech|skunk ape camber|unisex");
      // "Skunk Ape Twin" separate board
      expect(keys.some((k) => k.includes("skunk ape twin"))).toBe(true);
    });
  });

  // =======================================================================
  // 3. GNU Money — /money vs /c-money
  // =======================================================================
  describe("GNU Money", () => {
    it("Money and C Money produce separate board keys naturally", async () => {
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

      // "Money" (from mfr /money, evo C2E stripped, backcountry)
      expect(keys).toContain("gnu|money|unisex");
      // "C Money" (from mfr /c-money, tactics C3 stripped → "C Money")
      expect(keys).toContain("gnu|c money|unisex");

      const moneyGroup = groups.get("gnu|money|unisex")!;
      expect(moneyGroup).toBeDefined();
      expect(
        moneyGroup.scraped.some((s) => s.sourceUrl === "https://www.gnu.com/money")
      ).toBe(true);

      const cMoneyGroup = groups.get("gnu|c money|unisex")!;
      expect(cMoneyGroup).toBeDefined();
      expect(
        cMoneyGroup.scraped.some((s) => s.sourceUrl === "https://www.gnu.com/c-money")
      ).toBe(true);
    });
  });

  // =======================================================================
  // 4. GNU Gloss — /gloss vs /gloss-c
  // =======================================================================
  describe("GNU Gloss", () => {
    it("Gloss and Gloss C produce separate board keys naturally", async () => {
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

      // "Gloss" (from mfr /gloss, backcountry generic)
      expect(keys).toContain("gnu|gloss|womens");
      // "Gloss C" (from mfr /gloss-c, evo C3 stripped → "Gloss C", backcountry "Gloss C")
      expect(keys).toContain("gnu|gloss c|womens");

      const glossGroup = groups.get("gnu|gloss|womens")!;
      expect(glossGroup).toBeDefined();
      expect(
        glossGroup.scraped.some((s) =>
          s.sourceUrl === "https://www.gnu.com/gloss"
        )
      ).toBe(true);

      const glossCGroup = groups.get("gnu|gloss c|womens")!;
      expect(glossCGroup).toBeDefined();
      expect(
        glossCGroup.scraped.some((s) =>
          s.sourceUrl === "https://www.gnu.com/gloss-c"
        )
      ).toBe(true);
    });
  });

  // =======================================================================
  // 5. Lib Tech T. Rice Pro — /t-rice-pro vs /t-rice-pro-camber
  // =======================================================================
  describe("Lib Tech T. Rice Pro", () => {
    it("Pro and Pro Camber naturally produce different board keys", async () => {
      const scraped: ScrapedBoard[] = [
        ...(await parseMfr("https://www.lib-tech.com/t-rice-pro", "Lib Tech")),
        ...(await parseMfr("https://www.lib-tech.com/t-rice-pro-camber", "Lib Tech")),
        ...parseRetailer("https://www.backcountry.com/lib-technologies-t.rice-pro-snowboard-2026", "backcountry"),
      ];

      expect(scraped.length).toBeGreaterThanOrEqual(2);

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      const proKeys = keys.filter(k => k.includes("|pro"));
      expect(proKeys.length).toBeGreaterThanOrEqual(1);

      // Backcountry listing must land in one of the groups
      const bcInSomeGroup = proKeys.some(k => {
        const group = groups.get(k)!;
        return group.scraped.some(s => s.sourceUrl.includes("backcountry.com"));
      });
      expect(bcInSomeGroup).toBe(true);
    });
  });

  // =======================================================================
  // 6. Synthetic tests: variant markers produce different keys naturally
  // =======================================================================
  describe("Synthetic variant marker tests", () => {
    function makeSb(overrides: Partial<ScrapedBoard> & { brand: string }): ScrapedBoard {
      const brandId = new BrandIdentifier(overrides.brand);
      return {
        source: overrides.source ?? "manufacturer:gnu",
        brandId,
        model: overrides.model ?? "Test Board",
        rawModel: overrides.rawModel ?? overrides.model ?? "Test Board",
        sourceUrl: overrides.sourceUrl ?? "https://example.com",
        profile: overrides.profile,
        gender: overrides.gender,
        extras: overrides.extras ?? {},
        listings: overrides.listings ?? [],
      };
    }

    it("Skunk Ape and Skunk Ape Camber get separate keys without Phase 3", () => {
      const scraped: ScrapedBoard[] = [
        makeSb({
          brand: "Lib Tech",
          source: "manufacturer:lib tech",
          model: "Skunk Ape",
          rawModel: "Skunk Ape",
          profile: "C2X",
          sourceUrl: "https://www.lib-tech.com/skunk-ape",
        }),
        makeSb({
          brand: "Lib Tech",
          source: "manufacturer:lib tech",
          model: "Skunk Ape Camber",
          rawModel: "Skunk Ape Camber",
          profile: "C3",
          sourceUrl: "https://www.lib-tech.com/skunk-ape-camber",
        }),
        makeSb({
          brand: "Lib Tech",
          source: "retailer:backcountry",
          model: "Skunk Ape Camber",
          rawModel: "Lib Tech Skunk Ape Camber Snowboard 2026",
          profile: "Camber",
          sourceUrl: "https://www.backcountry.com/lib-tech-skunk-ape-camber-2026",
          listings: [{
            url: "https://www.backcountry.com/lib-tech-skunk-ape-camber-2026",
            salePrice: 599,
            currency: Currency.USD,
            scrapedAt: new Date().toISOString(),
          }],
        }),
      ];

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      expect(keys).toContain("lib tech|skunk ape|unisex");
      expect(keys).toContain("lib tech|skunk ape camber|unisex");

      // Backcountry "Skunk Ape Camber" goes to the camber group
      const camberGroup = groups.get("lib tech|skunk ape camber|unisex")!;
      expect(camberGroup.scraped.some(s => s.sourceUrl.includes("backcountry.com"))).toBe(true);
    });

    it("Money and C Money get separate keys without Phase 3", () => {
      const scraped: ScrapedBoard[] = [
        makeSb({
          brand: "GNU",
          source: "manufacturer:gnu",
          model: "Money",
          rawModel: "Money",
          profile: "C2E",
          sourceUrl: "https://www.gnu.com/money",
        }),
        makeSb({
          brand: "GNU",
          source: "manufacturer:gnu",
          model: "C Money",
          rawModel: "C Money",
          profile: "C3",
          sourceUrl: "https://www.gnu.com/c-money",
        }),
        makeSb({
          brand: "GNU",
          source: "retailer:backcountry",
          model: "Money",
          rawModel: "GNU Money Snowboard 2026",
          profile: "Hybrid Camber",
          sourceUrl: "https://www.backcountry.com/gnu-money-2026",
          listings: [{
            url: "https://www.backcountry.com/gnu-money-2026",
            salePrice: 499,
            currency: Currency.USD,
            scrapedAt: new Date().toISOString(),
          }],
        }),
      ];

      const groups = identifyBoards(scraped);
      const keys = [...groups.keys()].sort();

      expect(keys).toContain("gnu|money|unisex");
      expect(keys).toContain("gnu|c money|unisex");
      expect(keys).toHaveLength(2);

      // Backcountry "Money" merges with manufacturer "Money"
      const moneyGroup = groups.get("gnu|money|unisex")!;
      expect(moneyGroup.scraped.some(s => s.sourceUrl.includes("backcountry.com"))).toBe(true);
    });
  });
});
