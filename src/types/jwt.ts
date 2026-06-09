/**
 * Typed JWT token payload from next-auth's getToken().
 * Eliminates the need for `(token as any).sub` casts throughout the codebase.
 */
export interface JwtToken {
  sub?: string;
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
  jti?: string;
  [key: string]: unknown;
}

/**
 * Extract the user ID from a JWT token.
 * Handles both `sub` (standard) and `id` (custom) fields.
 */
export function getTokenUserId(token: JwtToken): string {
  return token.sub || token.id || "unknown";
}
