// Shared JWT utility for Z.ai API authentication
// Used by both openrouter.ts and agent-chat/route.ts

import { SignJWT } from "jose"

/**
 * Generate a JWT token for Z.ai API authentication.
 * Z.ai API keys come in format: {id}.{secret}
 * The API requires a JWT token signed with the secret, not the raw key.
 */
export async function generateZaiToken(apiKey: string): Promise<string> {
  // If the key already looks like a JWT (starts with eyJ), use it directly
  if (apiKey.startsWith("eyJ")) {
    return apiKey
  }

  // If the key contains a dot, it's in id.secret format — generate JWT
  const parts = apiKey.split(".")
  if (parts.length === 2) {
    const [id, secret] = parts
    try {
      const secretBytes = new TextEncoder().encode(secret)
      const nowSec = Math.floor(Date.now() / 1000)
      const token = await new SignJWT({
        api_key: id,
        timestamp: nowSec, // Z.ai expects seconds (consistent with exp)
        exp: nowSec + 3600, // JWT standard: seconds since epoch
      })
        .setProtectedHeader({ alg: "HS256", sign_type: "SIGN" })
        .sign(secretBytes)
      return token
    } catch (err) {
      console.error("[zai] JWT generation failed:", err)
      // SECURITY: Do NOT fall back to raw key — the secret portion would be exposed
      // in network logs, proxy logs, and Authorization headers.
      throw new Error("JWT generation failed for Z.ai API key. The key format may be invalid.")
    }
  }

  // If no dot and not a JWT, use as-is (might be a newer format)
  return apiKey
}
