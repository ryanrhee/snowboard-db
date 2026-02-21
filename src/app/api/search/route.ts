import { NextRequest, NextResponse } from "next/server";
import { runSearchPipeline } from "@/lib/pipeline";
import { SearchConstraints } from "@/lib/types";
import { DEFAULT_CONSTRAINTS } from "@/lib/constraints";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    const constraints: Partial<SearchConstraints> = {
      ...DEFAULT_CONSTRAINTS,
      ...body,
    };

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
