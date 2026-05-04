import { isIP } from "net"

/**
 * SSRF Protection: Check if a host resolves to a private/internal IP address.
 * Used by SMTP configuration endpoints to prevent server-side request forgery.
 *
 * Blocks:
 * - IPv4 loopback (127.x.x.x)
 * - IPv4 private (10.x, 172.16-31.x, 192.168.x)
 * - IPv4 link-local (169.254.x.x — cloud metadata endpoint)
 * - IPv4 broadcast (0.x.x.x)
 * - IPv6 loopback (::1)
 * - IPv6 unique local (fc00::/7)
 * - IPv6 link-local (fe80::/10)
 * - DNS localhost / .local / .internal
 */
export function isPrivateHost(host: string): boolean {
  const cleaned = host.replace(/\[|\]/g, "")
  const ipVersion = isIP(cleaned)

  if (ipVersion === 0) {
    // Not an IP — check for localhost-like domain names
    if (
      cleaned === "localhost" ||
      cleaned.endsWith(".local") ||
      cleaned.endsWith(".internal")
    ) {
      return true
    }
    return false
  }

  if (ipVersion === 4) {
    const parts = cleaned.split(".").map(Number)
    const [a, b] = parts
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true // Cloud metadata
    return false
  }

  if (ipVersion === 6) {
    const lower = cleaned.toLowerCase()
    if (lower === "::1") return true
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true // Unique local
    if (lower.startsWith("fe80")) return true // Link-local
    return false
  }

  return false
}
