import { NextRequest, NextResponse } from "next/server";
import { getManufacturers, getAllManufacturerBrands } from "@/lib/manufacturers/registry";
import { ingestManufacturerSpecs } from "@/lib/manufacturers/ingest";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const brands: string[] | undefined = body.brands;

    const manufacturers = getManufacturers(brands);

    if (manufacturers.length === 0) {
      return NextResponse.json(
        { error: `No matching manufacturers. Available: ${getAllManufacturerBrands().join(", ")}` },
        { status: 400 }
      );
    }

    const results: Record<string, { scraped: number; inserted: number; updated: number; skipped: number; error?: string }> = {};

    for (const mfr of manufacturers) {
      try {
        const specs = await mfr.scrapeSpecs();
        const stats = ingestManufacturerSpecs(specs);
        results[mfr.brand] = {
          scraped: specs.length,
          inserted: stats.inserted,
          updated: stats.updated,
          skipped: stats.skipped,
        };
      } catch (err) {
        results[mfr.brand] = {
          scraped: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[api/scrape-specs] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
