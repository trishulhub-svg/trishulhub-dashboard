import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// Fallback rates if live fetch fails
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
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/INR", {
      next: { revalidate: 3600 },
    })
    if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`)

    const data = await res.json()
    if (!data?.rates) throw new Error("Invalid response from exchange rate API")

    const rates: Record<string, number> = {
      INR: 1,
      USD: Number((1 / data.rates.USD).toFixed(4)),
      GBP: Number((1 / data.rates.GBP).toFixed(4)),
    }

    // Update cache
    cachedRates = rates
    cacheTimestamp = Date.now()

    return rates
  } catch (error) {
    console.error("[exchange-rates] Live fetch failed, using fallbacks:", error instanceof Error ? error.message : error)
    return FALLBACK_RATES
  }
}

// GET /api/exchange-rates - Fetch live exchange rates to INR
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rates = await fetchLiveRates()

    return NextResponse.json({
      rates,
      base: "INR",
      timestamp: new Date().toISOString(),
      cached: cachedRates !== null && Date.now() - cacheTimestamp < CACHE_TTL,
    })
  } catch (error) {
    console.error("[exchange-rates] GET error:", error instanceof Error ? error.message : error)
    return NextResponse.json({ rates: FALLBACK_RATES, base: "INR", timestamp: new Date().toISOString(), cached: false })
  }
}
