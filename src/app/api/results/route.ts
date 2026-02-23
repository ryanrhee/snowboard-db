import { NextRequest, NextResponse } from "next/server";
import { getLatestRun, getRunById, getAllRuns, getBoardsWithListings, getSpecSources } from "@/lib/db";
import { filterBoardsWithListings } from "@/lib/constraints";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // List all runs
    if (searchParams.get("listRuns") === "true") {
      const runs = getAllRuns();
      return NextResponse.json({ runs });
    }

    // Get specific run or latest
    const runId = searchParams.get("runId");
    const run = runId ? getRunById(runId) : getLatestRun();

    if (!run) {
      return NextResponse.json({ run: null, boards: [] });
    }

    let boards = getBoardsWithListings(run.id);

    // Attach spec_sources provenance
    for (const board of boards) {
      const sources = getSpecSources(board.boardKey);
      if (Object.keys(sources).length > 0) {
        board.specSources = sources;
      }
    }

    // Client-side filters
    const region = searchParams.get("region") || undefined;
    const maxPrice = searchParams.get("maxPrice");
    const minLength = searchParams.get("minLength");
    const maxLength = searchParams.get("maxLength");

    const hasFilters = region || maxPrice || minLength || maxLength;
    if (hasFilters) {
      boards = filterBoardsWithListings(boards, {
        region,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minLength: minLength ? parseFloat(minLength) : undefined,
        maxLength: maxLength ? parseFloat(maxLength) : undefined,
      });
    }

    return NextResponse.json({ run, boards });
  } catch (error) {
    console.error("[api/results] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch results",
      },
      { status: 500 }
    );
  }
}
