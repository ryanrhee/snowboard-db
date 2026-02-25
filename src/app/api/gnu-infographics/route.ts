import { NextResponse } from "next/server";
import { getCacheDb, getDb } from "@/lib/db";
import * as cheerio from "cheerio";
import {
  analyzeGnuInfographic,
  GnuInfographicAnalysis,
} from "@/lib/manufacturers/gnu-infographic";

interface BoardLink {
  label: string;
  url: string;
}

interface GnuInfographicEntry {
  boardName: string;
  imgUrl: string;
  pageUrl: string;
  links: BoardLink[];
  analysis: GnuInfographicAnalysis | null;
}

export async function GET() {
  try {
    const cacheDb = getCacheDb();
    const mainDb = getDb();
    const rows = cacheDb
      .prepare(
        "SELECT url, body FROM http_cache WHERE url LIKE '%gnu.com/%' AND url NOT LIKE '%/snowboards/mens%' AND url NOT LIKE '%/snowboards/womens%'"
      )
      .all() as { url: string; body: string }[];

    const entries: GnuInfographicEntry[] = [];

    for (const row of rows) {
      const $ = cheerio.load(row.body);
      const title = $("h1").first().text().trim();

      $("img").each((_, el) => {
        const src = $(el).attr("src") || "";
        const lower = src.toLowerCase();
        if (lower.includes("-scales") || lower.includes("-sliders")) {
          const fullUrl = src.startsWith("http")
            ? src
            : `https://www.gnu.com${src}`;
          entries.push({
            boardName: title,
            imgUrl: fullUrl,
            pageUrl: row.url,
            links: [],
            analysis: null,
          });
        }
      });
    }

    // Deduplicate by imgUrl
    const seen = new Set<string>();
    const unique = entries.filter((r) => {
      if (seen.has(r.imgUrl)) return false;
      seen.add(r.imgUrl);
      return true;
    });

    // Look up retailer listings for each board
    const listingStmt = mainDb.prepare(
      "SELECT DISTINCT retailer, url FROM listings WHERE board_key LIKE ? ORDER BY retailer"
    );
    for (const entry of unique) {
      const cleanName = entry.boardName
        .replace(/^GNU\s+/i, "")
        .replace(/\s+Snowboard$/i, "")
        .trim();
      const boardKeyPattern = `gnu|${cleanName.toLowerCase()}|%`;
      const listings = listingStmt.all(boardKeyPattern) as { retailer: string; url: string }[];
      entry.links = [
        { label: "Manufacturer", url: entry.pageUrl },
        ...listings.map((l) => ({ label: l.retailer, url: l.url })),
      ];
    }

    // Fetch and analyze each infographic image (3 concurrent)
    const CONCURRENCY = 3;
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      const batch = unique.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (entry) => {
          try {
            const resp = await fetch(entry.imgUrl);
            if (!resp.ok) return;
            const buf = Buffer.from(await resp.arrayBuffer());
            entry.analysis = await analyzeGnuInfographic(buf);
          } catch (err) {
            console.warn(
              `[gnu-infographics] Failed to analyze ${entry.boardName}:`,
              err instanceof Error ? err.message : err
            );
          }
        })
      );
    }

    // Sort by board name
    unique.sort((a, b) => a.boardName.localeCompare(b.boardName));

    return NextResponse.json({ count: unique.length, results: unique });
  } catch (error) {
    console.error("[api/gnu-infographics] Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load infographic data",
      },
      { status: 500 }
    );
  }
}
