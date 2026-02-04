import { NextRequest, NextResponse } from "next/server";
import { validateApiKey, checkRateLimit } from "@/lib/auth";
import type { ApiScope, ApiKeyValidation, RateLimitResult } from "@/types";

export interface AuthContext {
  keyId: string;
  scopes: ApiScope[];
}

interface AuthResult {
  success: true;
  context: AuthContext;
}

interface AuthError {
  success: false;
  response: NextResponse;
}

/**
 * Authenticate and authorize an API request
 */
export async function authenticateRequest(
  request: NextRequest,
  requiredScopes?: ApiScope[]
): Promise<AuthResult | AuthError> {
  // Get API key from middleware-set header or Authorization header
  const apiKey =
    request.headers.get("X-API-Key") ||
    request.headers.get("Authorization")?.substring(7);

  if (!apiKey) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Missing API key" },
        { status: 401 }
      ),
    };
  }

  // Validate API key
  const validation: ApiKeyValidation = await validateApiKey(apiKey);

  if (!validation.valid) {
    return {
      success: false,
      response: NextResponse.json(
        { error: validation.error || "Invalid API key" },
        { status: 401 }
      ),
    };
  }

  // Check rate limit
  const rateLimitResult: RateLimitResult = await checkRateLimit(
    validation.keyId!,
    validation.rateLimitRpm!
  );

  if (!rateLimitResult.allowed) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Rate limit exceeded", retryAfter: rateLimitResult.retryAfter },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimitResult.retryAfter),
            "X-RateLimit-Limit": String(validation.rateLimitRpm),
            "X-RateLimit-Remaining": "0",
          },
        }
      ),
    };
  }

  // Check required scopes
  if (requiredScopes && requiredScopes.length > 0) {
    const hasAdmin = validation.scopes!.includes("admin");
    const hasRequiredScope = requiredScopes.some((scope) =>
      validation.scopes!.includes(scope)
    );

    if (!hasAdmin && !hasRequiredScope) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: `Insufficient permissions. Required: ${requiredScopes.join(" or ")}`,
          },
          { status: 403 }
        ),
      };
    }
  }

  return {
    success: true,
    context: {
      keyId: validation.keyId!,
      scopes: validation.scopes!,
    },
  };
}

/**
 * Helper to create error responses
 */
export function errorResponse(
  message: string,
  status: number,
  code?: string
): NextResponse {
  return NextResponse.json(
    { error: message, code },
    { status }
  );
}

/**
 * Helper to create success responses
 */
export function successResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
