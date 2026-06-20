import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"

const BASE_CURRENCY = process.env.NEXT_PUBLIC_BASE_CURRENCY || "INR"

// TODO (I26): Store exchange rates in DB with timestamps instead of hardcoded fallbacks.
const FALLBACK_RATES: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  GBP: 105.5,
}

// Cache rates in memory for 1 hour to avoid hammering the API
let cachedRates: Record<string, number> | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

async function fetchLiveRates(): Promise<Record<string, number>> {
  // Return cached rates if still fresh
  if (cachedRates && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedRates
  }

  try {
    // Use free exchange rate API (rates relative to INR)
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${BASE_CURRENCY}`, {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`)

    const data = await res.json()
    if (!data?.rates) throw new Error("Invalid response from exchange rate API")

    // Phase 7c: Validate each rate is a finite positive number before storing.
    // The external API can return undefined/0/NaN for unsupported currencies,
    // which would poison downstream currency conversions (Infinity / NaN).
    const rawUsd = Number(data.rates.USD)
    const rawGbp = Number(data.rates.GBP)

    const rates: Record<string, number> = { INR: 1 }

    if (typeof rawUsd === "number" && isFinite(rawUsd) && rawUsd > 0) {
      const inrPerUsd = 1 / rawUsd
      if (isFinite(inrPerUsd) && inrPerUsd > 0) {
        rates.USD = Number(inrPerUsd.toFixed(4))
      }
    }

    if (typeof rawGbp === "number" && isFinite(rawGbp) && rawGbp > 0) {
      const inrPerGbp = 1 / rawGbp
      if (isFinite(inrPerGbp) && inrPerGbp > 0) {
        rates.GBP = Number(inrPerGbp.toFixed(4))
      }
    }

    // Phase 7c: If validation rejected any currency, fall back to hardcoded rates
    // so callers always get a complete set of conversion factors.
    const finalRates: Record<string, number> = {
      INR: 1,
      USD: rates.USD ?? FALLBACK_RATES.USD,
      GBP: rates.GBP ?? FALLBACK_RATES.GBP,
    }

    // Update cache only when we have at least one live rate; otherwise keep stale cache.
    if (rates.USD !== undefined || rates.GBP !== undefined) {
      cachedRates = finalRates
      cacheTimestamp = Date.now()
    }

    return finalRates
  } catch (error) {
    console.error("[exchange-rates] Live fetch failed, using fallbacks:", error instanceof Error ? error.message : error)
    return FALLBACK_RATES
  }
}

/**
 * GET /api/exchange-rates
 * Returns current exchange rates with base currency (default INR).
 * Falls back to hardcoded rates if external API fails.
 * Rate limited: 10 requests per minute (global).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // I22: Use per-user rate limit instead of global
    const { success } = rateLimit(`exchange-rates:${session.user.id}`, 10, 60 * 1000)
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const rates = await fetchLiveRates()

    return NextResponse.json({
      rates,
      base: BASE_CURRENCY,
      timestamp: new Date().toISOString(),
      cached: cachedRates !== null && Date.now() - cacheTimestamp < CACHE_TTL,
      source: rates === FALLBACK_RATES ? "fallback" : "live",
    })
  } catch (error) {
    console.error("[exchange-rates] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({
      rates: FALLBACK_RATES,
      base: BASE_CURRENCY,
      timestamp: new Date().toISOString(),
      cached: false,
      source: "fallback",
    })
  }
}
