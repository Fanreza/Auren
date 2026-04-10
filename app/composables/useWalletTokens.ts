import type { TokenBalance } from '~/composables/useEnso'

export type WalletToken = TokenBalance & {
  usdPrice: number
  usdValue: number
  formattedBal: number
}

export function useWalletTokens(
  address: Ref<`0x${string}` | undefined>,
  getWalletBalances: (addr: `0x${string}`) => Promise<TokenBalance[]>,
  getTokenPrices: (addrs: string[]) => Promise<Record<string, number>>,
) {
  const walletTokens = ref<WalletToken[]>([])
  const loadingTokens = ref(false)

  async function fetchWalletTokens() {
    if (!address.value) return
    loadingTokens.value = true
    try {
      const balances = await getWalletBalances(address.value)
      const nonZero = balances.filter(t => t.amount && BigInt(t.amount) > 0n)

      let prices: Record<string, number> = {}
      try {
        prices = await getTokenPrices(nonZero.map(t => t.token))
      } catch (e) {
        console.error('[useWalletTokens] price fetch failed:', e)
      }

      walletTokens.value = nonZero
        .map(t => {
          const usdPrice = prices[t.token.toLowerCase()] ?? 0
          const formattedBal = Number(BigInt(t.amount)) / Math.pow(10, t.decimals)
          return { ...t, usdPrice, usdValue: formattedBal * usdPrice, formattedBal }
        })
        .filter(t => t.usdPrice > 0)
        .sort((a, b) => b.usdValue - a.usdValue)
    } catch (e) {
      console.error('[useWalletTokens] failed:', e)
      walletTokens.value = []
    } finally {
      loadingTokens.value = false
    }
  }

  return { walletTokens, loadingTokens, fetchWalletTokens }
}
