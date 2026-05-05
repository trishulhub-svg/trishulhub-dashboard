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
      console.error("[zai] JWT generation failed, using raw key:", err)
      console.warn("[zai] Warning: Falling back to raw API key. JWT generation failed — this may cause authentication issues with Z.ai API.")
      // Fall back to using the raw key
      return apiKey
    }
  }

  // If no dot and not a JWT, use as-is (might be a newer format)
  return apiKey
}
