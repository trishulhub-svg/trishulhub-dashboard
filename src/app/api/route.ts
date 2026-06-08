import { NextResponse } from "next/server";

// Intentional health check endpoint (unauthenticated)
export async function GET() {
  return NextResponse.json({ message: "Hello, world!" });
}