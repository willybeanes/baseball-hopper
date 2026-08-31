import { NextResponse } from "next/server";
import { fetchProbablesData } from "@/lib/probables/fetch-probables";

export const revalidate = 10800; // 3 hours

export async function GET() {
  try {
    const data = await fetchProbablesData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch probables:", error);
    return NextResponse.json(
      { error: "Failed to fetch probables data" },
      { status: 500 }
    );
  }
}
