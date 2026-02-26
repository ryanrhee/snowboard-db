import { NextRequest, NextResponse } from "next/server";
import { getCacheDb } from "@/lib/db";
import * as cheerio from "cheerio";
import {
  analyzeGnuInfographic,
  generateDebugOverlay,
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

export async function GET(request: NextRequest) {
  try {
    // Check if this is a debug overlay request
    const debugUrl = request.nextUrl.searchParams.get("debug");
    if (debugUrl) {
      return handleDebugOverlay(debugUrl);
    }

    const cacheDb = getCacheDb();
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

    // Each entry already has pageUrl (the manufacturer product page from http_cache)
    for (const entry of unique) {
      entry.links = [{ label: "gnu.com", url: entry.pageUrl }];
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

async function handleDebugOverlay(imgUrl: string): Promise<NextResponse> {
  try {
    const resp = await fetch(imgUrl);
    if (!resp.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${resp.status}` }, { status: 502 });
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    const analysis = await analyzeGnuInfographic(buf);
    const overlayBuf = await generateDebugOverlay(buf, analysis);
    return new NextResponse(new Uint8Array(overlayBuf), {
      headers: { "Content-Type": "image/png" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate overlay" },
      { status: 500 }
    );
  }
}
