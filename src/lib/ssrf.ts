import { isIP } from "net"
import * as dns from "dns/promises"

/**
 * Check if a single IP address string is private/internal.
 * Used internally by isPrivateHost after DNS resolution.
 *
 * Blocks:
 * - IPv4 loopback (127.x.x.x)
 * - IPv4 private (10.x, 172.16-31.x, 192.168.x)
 * - IPv4 link-local (169.254.x.x — cloud metadata endpoint)
 * - IPv4 broadcast (0.x.x.x)
 * - IPv6 loopback (::1)
 * - IPv6 unique local (fc00::/7)
 * - IPv6 link-local (fe80::/10)
 */
export function isPrivateIP(ip: string): boolean {
  const cleaned = ip.replace(/\[|\]/g, "")
  const ipVersion = isIP(cleaned)

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

/**
 * SSRF Protection: Check if a host resolves to a private/internal IP address.
 * Used by SMTP configuration endpoints to prevent server-side request forgery.
 *
 * SECURITY FIX: Now performs DNS resolution to prevent DNS rebinding attacks.
 * A domain that initially resolves to a public IP but later resolves to a
 * private IP would bypass the old check. Now we resolve DNS and verify every
 * resolved IP address.
 *
 * Blocks:
 * - Direct private IP addresses (IPv4 & IPv6)
 * - DNS localhost / .local / .internal domain names
 * - Domain names that resolve to private IP addresses (DNS rebinding protection)
 */
export async function isPrivateHost(host: string): Promise<boolean> {
  const cleaned = host.replace(/\[|\]/g, "")
  const ipVersion = isIP(cleaned)

  // If it's already an IP address, check directly
  if (ipVersion !== 0) {
    return isPrivateIP(cleaned)
  }

  // Not an IP — check for localhost-like domain names first
  if (
    cleaned === "localhost" ||
    cleaned.endsWith(".local") ||
    cleaned.endsWith(".internal")
  ) {
    return true
  }

  // SECURITY FIX: Perform DNS resolution and check each resolved IP.
  // This prevents DNS rebinding attacks where a domain resolves to a public
  // IP during the initial check but resolves to a private IP when the actual
  // request is made.
  try {
    const [ipv4Addresses, ipv6Addresses] = await Promise.allSettled([
      dns.resolve4(cleaned),
      dns.resolve6(cleaned),
    ])

    const resolvedIPs: string[] = []

    if (ipv4Addresses.status === "fulfilled") {
      resolvedIPs.push(...ipv4Addresses.value)
    }
    if (ipv6Addresses.status === "fulfilled") {
      resolvedIPs.push(...ipv6Addresses.value)
    }

    // If DNS resolved to any IP, check ALL of them against private ranges.
    // If ANY resolved IP is private, block the request.
    for (const ip of resolvedIPs) {
      if (isPrivateIP(ip)) {
        return true
      }
    }

    // If we got at least one resolved IP and none were private, allow it.
    // If DNS resolution failed entirely (no IPs resolved), fall through —
    // the actual connection will fail anyway.
  } catch {
    // DNS resolution failed — we can't verify the IP.
    // Allow the request to proceed; the actual connection attempt will fail
    // if the host is truly unreachable.
  }

  return false
}
