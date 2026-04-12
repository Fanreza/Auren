/**
 * Currency localization composable.
 * Stores user preference in localStorage; fetches FX rates from CoinGecko (free endpoint).
 * Falls back to USD if rates unavailable.
 */
import { BRAND } from '~/config/brand'

export interface CurrencyOption {
  code: string         // ISO 4217
  symbol: string
  label: string
  flag: string         // emoji
  /** Number of fraction digits to display */
  digits: number
}

export const CURRENCIES: Record<string, CurrencyOption> = {
  USD: { code: 'USD', symbol: '$',   label: 'US Dollar',          flag: '🇺🇸', digits: 2 },
  IDR: { code: 'IDR', symbol: 'Rp',  label: 'Indonesian Rupiah',  flag: '🇮🇩', digits: 0 },
  EUR: { code: 'EUR', symbol: '€',   label: 'Euro',               flag: '🇪🇺', digits: 2 },
  GBP: { code: 'GBP', symbol: '£',   label: 'British Pound',      flag: '🇬🇧', digits: 2 },
  SGD: { code: 'SGD', symbol: 'S$',  label: 'Singapore Dollar',   flag: '🇸🇬', digits: 2 },
  JPY: { code: 'JPY', symbol: '¥',   label: 'Japanese Yen',       flag: '🇯🇵', digits: 0 },
  AUD: { code: 'AUD', symbol: 'A$',  label: 'Australian Dollar',  flag: '🇦🇺', digits: 2 },
  CAD: { code: 'CAD', symbol: 'C$',  label: 'Canadian Dollar',    flag: '🇨🇦', digits: 2 },
}

const STORAGE_KEY = `${BRAND.storagePrefix}_currency`
const RATES_KEY = `${BRAND.storagePrefix}_fx_rates`
const RATES_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

interface RatesCache {
  fetchedAt: number
  rates: Record<string, number>  // currency code → rate vs USD
}

// Module-level reactive state — shared across all useCurrency() calls
const selected = ref<string>('USD')
const rates = ref<Record<string, number>>({ USD: 1 })
let initialized = false

async function fetchRates(): Promise<Record<string, number>> {
  try {
    // CoinGecko free endpoint gives USD prices for any list of vs_currencies
    const codes = Object.keys(CURRENCIES).map(c => c.toLowerCase()).join(',')
    const res = await $fetch<any>(`https://api.coingecko.com/api/v3/simple/price`, {
      query: { ids: 'usd-coin', vs_currencies: codes },
    })
    // Result shape: { 'usd-coin': { idr: 16500, eur: 0.92, ... } }
    const usdc = res?.['usd-coin'] ?? {}
    const out: Record<string, number> = { USD: 1 }
    for (const code of Object.keys(CURRENCIES)) {
      const r = usdc[code.toLowerCase()]
      if (typeof r === 'number' && r > 0) out[code] = r
    }
    return out
  } catch (e) {
    console.warn('[useCurrency] FX fetch failed, defaulting to USD', e)
    return { USD: 1 }
  }
}

function loadFromCache(): RatesCache | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(RATES_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as RatesCache
    if (Date.now() - parsed.fetchedAt > RATES_TTL_MS) return null
    return parsed
  } catch { return null }
}

function saveToCache(rates: Record<string, number>) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(RATES_KEY, JSON.stringify({ fetchedAt: Date.now(), rates }))
}

async function ensureInitialized() {
  if (initialized) return
  initialized = true

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && CURRENCIES[stored]) selected.value = stored
  }

  const cached = loadFromCache()
  if (cached) {
    rates.value = cached.rates
  } else {
    const fresh = await fetchRates()
    rates.value = fresh
    saveToCache(fresh)
  }
}

export function useCurrency() {
  if (typeof window !== 'undefined') ensureInitialized()

  const current = computed<CurrencyOption>(() => CURRENCIES[selected.value] ?? CURRENCIES.USD!)
  const rate = computed(() => rates.value[selected.value] ?? 1)

  function setCurrency(code: string) {
    if (!CURRENCIES[code]) return
    selected.value = code
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, code)
    }
  }

  /** Convert a USD amount to the user's selected currency. */
  function convert(usd: number): number {
    return usd * rate.value
  }

  /** Format a USD amount as a localized string with currency symbol. */
  function format(usd: number, opts?: { compact?: boolean; signDisplay?: 'auto' | 'always' | 'never' }): string {
    const c = current.value
    const value = convert(usd)
    const abs = Math.abs(value)
    if (abs > 0 && abs < (c.digits === 0 ? 1 : 0.01)) {
      return (value < 0 ? '-' : '') + c.symbol + (c.digits === 0 ? '<1' : '<0.01')
    }
    if (opts?.compact && abs >= 1000) {
      const compact = abs >= 1_000_000_000 ? (value / 1_000_000_000).toFixed(1) + 'B'
        : abs >= 1_000_000 ? (value / 1_000_000).toFixed(1) + 'M'
        : (value / 1_000).toFixed(1) + 'K'
      return c.symbol + compact
    }
    const signed = value < 0 ? '-' : (opts?.signDisplay === 'always' && value > 0 ? '+' : '')
    return signed + c.symbol + Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: c.digits,
      maximumFractionDigits: c.digits,
    })
  }

  return {
    currencies: CURRENCIES,
    selected: computed(() => selected.value),
    current,
    rate,
    rates: computed(() => rates.value),
    setCurrency,
    convert,
    format,
  }
}
