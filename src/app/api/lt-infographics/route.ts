import { NextResponse } from "next/server";
import { getCacheDb } from "@/lib/db";
import * as cheerio from "cheerio";
import {
  analyzeInfographic,
  InfographicAnalysis,
} from "@/lib/manufacturers/lib-tech-infographic";

interface InfographicEntry {
  boardName: string;
  imgUrl: string;
  analysis: InfographicAnalysis | null;
}

export async function GET() {
  try {
    const db = getCacheDb();
    const rows = db
      .prepare(
        "SELECT url, body FROM http_cache WHERE url LIKE '%lib-tech.com/%' AND url NOT LIKE '%/snowboards'"
      )
      .all() as { url: string; body: string }[];

    const entries: InfographicEntry[] = [];

    for (const row of rows) {
      const $ = cheerio.load(row.body);
      const title = $("h1").first().text().trim();

      $("img").each((_, el) => {
        const src = $(el).attr("src") || "";
        if (
          src.toLowerCase().includes("terrain") &&
          src.toLowerCase().includes("riderlevel")
        ) {
          const fullUrl = src.startsWith("http")
            ? src
            : `https://www.lib-tech.com${src}`;
          entries.push({
            boardName: title,
            imgUrl: fullUrl,
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
            entry.analysis = await analyzeInfographic(buf);
          } catch (err) {
            console.warn(
              `[lt-infographics] Failed to analyze ${entry.boardName}:`,
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
    console.error("[api/lt-infographics] Error:", error);
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
