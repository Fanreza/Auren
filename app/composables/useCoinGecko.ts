const DEFILLAMA_API = 'https://coins.llama.fi/prices/current'
const NATIVE_ETH = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

// Additive cache — prices accumulate, each entry expires individually
const priceCache: Record<string, { price: number; fetchedAt: number }> = {}
const CACHE_TTL = 5 * 60 * 1000

export function useCoinGecko() {
  async function getTokenPrices(
    tokenAddresses: string[],
  ): Promise<Record<string, number>> {
    const now = Date.now()
    const result: Record<string, number> = {}

    // Collect addresses that need fetching (not cached or expired)
    const toFetch: string[] = []
    for (const addr of tokenAddresses) {
      const key = addr.toLowerCase()
      const cached = priceCache[key]
      if (cached && now - cached.fetchedAt < CACHE_TTL) {
        result[key] = cached.price
      } else {
        toFetch.push(key)
      }
    }

    if (toFetch.length === 0) return result

    // Build DeFiLlama coin IDs
    const hasNative = toFetch.some(a => a === NATIVE_ETH)
    const coinIds: string[] = []
    if (hasNative) coinIds.push('coingecko:ethereum')
    for (const addr of toFetch) {
      if (addr !== NATIVE_ETH) {
        coinIds.push(`base:${addr}`)
      }
    }

    if (coinIds.length === 0) return result

    try {
      const res = await fetch(`${DEFILLAMA_API}/${coinIds.join(',')}`)
      if (res.ok) {
        const data: { coins: Record<string, { price: number; symbol: string; confidence: number }> } = await res.json()

        for (const [key, info] of Object.entries(data.coins)) {
          if (!info?.price) continue

          if (key === 'coingecko:ethereum') {
            priceCache[NATIVE_ETH] = { price: info.price, fetchedAt: now }
            result[NATIVE_ETH] = info.price
          } else {
            const addr = key.replace('base:', '')
            priceCache[addr] = { price: info.price, fetchedAt: now }
            result[addr] = info.price
          }
        }
      }
    } catch (e) {
      console.error('[useCoinGecko] DeFiLlama price error:', e)
    }

    return result
  }

  return { getTokenPrices }
}
