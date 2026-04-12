/**
 * Token logo store — fetches LI.FI token registry for Base and maps
 * contract address → logoURI. Cached for the whole session.
 *
 * Usage:
 *   const { logoForAddress, ensureLoaded } = useTokenLogos()
 *   <img :src="logoForAddress(vault.assetAddress)" />
 */
import { defineStore } from 'pinia'

// Static fallback logos for the 3 core assets (instant render, no fetch needed)
const STATIC_LOGOS: Record<string, string> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png',
  '0x4200000000000000000000000000000000000006': 'https://assets.coingecko.com/coins/images/2518/standard/weth.png',
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': 'https://assets.coingecko.com/coins/images/40143/standard/cbbtc.webp',
}

export const useTokenLogos = defineStore('tokenLogos', () => {
  const logos = ref<Record<string, string>>({ ...STATIC_LOGOS })
  const loading = ref(false)
  let _fetched = false

  async function ensureLoaded() {
    if (_fetched) return
    loading.value = true
    try {
      const res = await $fetch<any[]>('/api/lifi/tokens', { query: { chainId: 8453 } })
      if (Array.isArray(res)) {
        const map: Record<string, string> = { ...logos.value }
        for (const t of res) {
          if (t?.address && t?.logoURI) {
            map[t.address.toLowerCase()] = t.logoURI
          }
        }
        logos.value = map
      }
      _fetched = true
    } catch (e) {
      if (import.meta.dev) console.warn('[tokenLogos] fetch failed', e)
    } finally {
      loading.value = false
    }
  }

  function logoForAddress(address: string | null | undefined): string | null {
    if (!address) return null
    return logos.value[address.toLowerCase()] ?? null
  }

  return { logos, loading, ensureLoaded, logoForAddress }
})
