import { NextRequest, NextResponse } from "next/server";
import { runSearchPipeline } from "@/lib/pipeline";
import { SearchConstraints } from "@/lib/types";
import { DEFAULT_CONSTRAINTS } from "@/lib/constraints";
import { getLatestRun, getBoardsWithListings } from "@/lib/db";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;

    const constraints: Partial<SearchConstraints> = {
      ...DEFAULT_CONSTRAINTS,
      ...body,
    };

    // Return cached results if the latest run is less than 1 hour old
    if (!force) {
      const latest = getLatestRun();
      if (latest) {
        const age = Date.now() - new Date(latest.timestamp).getTime();
        if (age < CACHE_TTL_MS) {
          console.log(`[api/search] Returning cached run ${latest.id} (${Math.round(age / 60000)}min old)`);
          const boards = getBoardsWithListings(latest.id);
          return NextResponse.json({ run: latest, boards, errors: [], cached: true });
        }
      }
    }

    const response = await runSearchPipeline(constraints);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/search] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Search failed",
      },
      { status: 500 }
    );
  }
}
