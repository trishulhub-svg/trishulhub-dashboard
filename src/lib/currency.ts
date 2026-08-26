/**
 * Shared currency constants for TrishulHub finance (API + UI).
 *
 * ponytail: live rates come from the exchange-rate API; these fallbacks only
 * cover the initial paint / API outage. upgrade: persist rates in the DB when
 * staleness matters.
 */
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  GBP: 105.5,
}
