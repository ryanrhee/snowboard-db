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
    const minPrice = searchParams.get("minPrice");
    const minLength = searchParams.get("minLength");
    const maxLength = searchParams.get("maxLength");
    const gender = searchParams.get("gender") || undefined;
    const abilityLevel = searchParams.get("abilityLevel") || undefined;
    const excludeKids = searchParams.get("excludeKids");
    const excludeWomens = searchParams.get("excludeWomens");

    const hasFilters = region || maxPrice || minPrice || minLength || maxLength || gender || abilityLevel || excludeKids || excludeWomens;
    if (hasFilters) {
      boards = filterBoardsWithListings(boards, {
        region,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        minLength: minLength ? parseFloat(minLength) : undefined,
        maxLength: maxLength ? parseFloat(maxLength) : undefined,
        gender,
        abilityLevel,
        excludeKids: excludeKids === "true",
        excludeWomens: excludeWomens === "true",
      });
    }

    return NextResponse.json({ run, boards });
  } catch (error) {
    console.error("[api/boards] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch results",
      },
      { status: 500 }
    );
  }
}
