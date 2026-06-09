import { NextResponse } from "next/server";

// Intentional health check endpoint (unauthenticated)
export async function GET() {
  try {
    return NextResponse.json({ message: "Hello, world!" });
  } catch (error: unknown) {
    console.error("[api] GET error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}