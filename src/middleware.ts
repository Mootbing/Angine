import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for API authentication
 * Runs on all /api/v1/* routes
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Only apply to API routes
  if (!path.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  // Skip auth for health check
  if (path === "/api/v1/health") {
    return NextResponse.next();
  }

  // Extract Bearer token
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 }
    );
  }

  const apiKey = authHeader.substring(7);

  // Validate format quickly (actual validation happens in route handlers)
  if (!apiKey.startsWith("engine_")) {
    return NextResponse.json(
      { error: "Invalid API key format" },
      { status: 401 }
    );
  }

  // Pass the API key to route handlers via header
  const response = NextResponse.next();
  response.headers.set("X-API-Key", apiKey);

  return response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
