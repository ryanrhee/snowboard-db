import { NextRequest, NextResponse } from "next/server";
import { refreshPipeline } from "@/lib/pipeline";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.runId) {
      return NextResponse.json(
        { error: "runId is required" },
        { status: 400 }
      );
    }

    const response = await refreshPipeline(body.runId);

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/refresh] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Refresh failed",
      },
      { status: 500 }
    );
  }
}
