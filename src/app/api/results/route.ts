import { NextRequest, NextResponse } from "next/server";
import { getLatestRun, getRunById, getAllRuns, getBoardsByRunId } from "@/lib/db";

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

    let boards = getBoardsByRunId(run.id);

    // Client-side filters
    const region = searchParams.get("region");
    if (region) {
      boards = boards.filter((b) => b.region === region);
    }

    const maxPrice = searchParams.get("maxPrice");
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) {
        boards = boards.filter((b) => b.salePriceUsd <= max);
      }
    }

    const minLength = searchParams.get("minLength");
    if (minLength) {
      const min = parseFloat(minLength);
      if (!isNaN(min)) {
        boards = boards.filter((b) => b.lengthCm === null || b.lengthCm >= min);
      }
    }

    const maxLength = searchParams.get("maxLength");
    if (maxLength) {
      const max = parseFloat(maxLength);
      if (!isNaN(max)) {
        boards = boards.filter((b) => b.lengthCm === null || b.lengthCm <= max);
      }
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
