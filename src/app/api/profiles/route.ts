import { NextResponse } from "next/server";
import { getAllProfiles } from "@/lib/db";
import { profileToFilterDefaults } from "@/lib/profiles";

export async function GET() {
  try {
    const profiles = getAllProfiles();
    const result = profiles.map((p) => ({
      ...p,
      filterDefaults: profileToFilterDefaults(p),
    }));
    return NextResponse.json({ profiles: result });
  } catch (error) {
    console.error("[api/profiles] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch profiles" },
      { status: 500 }
    );
  }
}
