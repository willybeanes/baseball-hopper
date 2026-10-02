import { NextResponse } from "next/server";

// Disabled for the offseason: FanGraphs started returning 403 for the probables-grid
// endpoint. Restore the fetchProbablesData() call from git history to bring it back.
export function GET() {
  return NextResponse.json(
    { error: "Opposing Probables is disabled for the offseason" },
    { status: 503 },
  );
}
