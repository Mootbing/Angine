import type { ApiScope } from "@/types";

/**
 * Check if user has required scope
 * Admin scope grants access to everything
 */
export function checkScope(
  requiredScope: ApiScope,
  userScopes: ApiScope[]
): boolean {
  if (userScopes.includes("admin")) return true;
  return userScopes.includes(requiredScope);
}

/**
 * Check if user has any of the required scopes
 */
export function checkAnyScope(
  requiredScopes: ApiScope[],
  userScopes: ApiScope[]
): boolean {
  if (userScopes.includes("admin")) return true;
  return requiredScopes.some((scope) => userScopes.includes(scope));
}

/**
 * Check if user has all required scopes
 */
export function checkAllScopes(
  requiredScopes: ApiScope[],
  userScopes: ApiScope[]
): boolean {
  if (userScopes.includes("admin")) return true;
  return requiredScopes.every((scope) => userScopes.includes(scope));
}

/**
 * Scope descriptions for documentation
 */
export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "jobs:read": "Read job status, logs, and artifacts",
  "jobs:write": "Create new jobs and respond to HITL questions",
  "jobs:delete": "Cancel and delete jobs",
  "agents:read": "List and discover agents",
  "agents:write": "Register and modify agents",
  admin: "Full administrative access",
};
