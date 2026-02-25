import { NextRequest, NextResponse } from "next/server";
import { runSearchPipeline } from "@/lib/pipeline";
import { getManufacturerBrands } from "@/lib/scrapers/registry";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const brands: string[] | undefined = body.brands;

    if (brands && brands.length > 0) {
      const available = getManufacturerBrands();
      const lower = new Set(brands.map((b) => b.toLowerCase()));
      const matching = available.filter((b) => lower.has(b.toLowerCase()));
      if (matching.length === 0) {
        return NextResponse.json(
          {
            error: `No matching manufacturers. Available: ${available.join(", ")}`,
          },
          { status: 400 }
        );
      }
    }

    // Run unified pipeline with only manufacturers (no retailers)
    const result = await runSearchPipeline({
      manufacturers: brands,
      retailers: [], // no retailers
    });

    return NextResponse.json({
      boardCount: result.boards.length,
      boards: result.boards.map((b) => ({
        brand: b.brand,
        model: b.model,
        flex: b.flex,
        profile: b.profile,
        shape: b.shape,
        category: b.category,
      })),
    });
  } catch (error) {
    console.error("[api/scrape-specs] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scrape failed" },
      { status: 500 }
    );
  }
}
