import { erc20Abi } from 'viem'
import { usePrivyAuth } from '~/composables/usePrivy'
import { STRATEGIES } from '~/config/strategies'

export type WalletToken = {
  token: string
  symbol: string
  name: string
  decimals: number
  logoUri: string
  usdPrice: number
  usdValue: number
  formattedBal: number
}

// Known tokens on Base to check balance for (covers all strategy assets + common tokens)
const BASE_TOKENS: Array<{ address: `0x${string}`; symbol: string; name: string; decimals: number; logoUri: string }> = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoUri: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png' },
  { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/2518/standard/weth.png' },
  { address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbol: 'cbBTC', name: 'Coinbase BTC', decimals: 8, logoUri: 'https://assets.coingecko.com/coins/images/1/standard/bitcoin.png' },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai', decimals: 18, logoUri: 'https://assets.coingecko.com/coins/images/9956/standard/Badge_Dai.png' },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', symbol: 'USDbC', name: 'USD Base Coin', decimals: 6, logoUri: 'https://assets.coingecko.com/coins/images/6319/standard/usdc.png' },
]

export function useWalletTokens(
  address: Ref<`0x${string}` | undefined>,
  _getWalletBalances: any, // kept for API compat, unused
  getTokenPrices: (addrs: string[]) => Promise<Record<string, number>>,
) {
  const { getPublicClient } = usePrivyAuth()
  const walletTokens = ref<WalletToken[]>([])
  const loadingTokens = ref(false)

  async function fetchWalletTokens() {
    if (!address.value) return
    loadingTokens.value = true
    try {
      const pub = getPublicClient()
      const addr = address.value

      // Batch: fetch all token balances + native ETH in parallel via multicall
      const [ethBal, ...tokenResults] = await Promise.all([
        pub.getBalance({ address: addr }),
        ...BASE_TOKENS.map(t =>
          pub.readContract({
            address: t.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [addr],
          }).catch(() => 0n),
        ),
      ])

      // Build token list with balances
      const tokensWithBal: Array<{ address: string; symbol: string; name: string; decimals: number; logoUri: string; balance: bigint }> = []

      // Native ETH
      if (ethBal > 0n) {
        tokensWithBal.push({
          address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          symbol: 'ETH',
          name: 'Ether',
          decimals: 18,
          logoUri: 'https://assets.coingecko.com/coins/images/279/standard/ethereum.png',
          balance: ethBal,
        })
      }

      // ERC-20 tokens
      for (let i = 0; i < BASE_TOKENS.length; i++) {
        const bal = tokenResults[i] as bigint
        if (bal > 0n) {
          tokensWithBal.push({ ...BASE_TOKENS[i], address: BASE_TOKENS[i].address, balance: bal })
        }
      }

      if (!tokensWithBal.length) {
        walletTokens.value = []
        return
      }

      // Fetch prices
      let prices: Record<string, number> = {}
      try {
        prices = await getTokenPrices(tokensWithBal.map(t => t.address))
      } catch (e) {
        console.error('[useWalletTokens] price fetch failed:', e)
      }

      walletTokens.value = tokensWithBal
        .map(t => {
          const usdPrice = prices[t.address.toLowerCase()] ?? 0
          const formattedBal = Number(t.balance) / Math.pow(10, t.decimals)
          return {
            token: t.address,
            symbol: t.symbol,
            name: t.name,
            decimals: t.decimals,
            logoUri: t.logoUri,
            usdPrice,
            usdValue: formattedBal * usdPrice,
            formattedBal,
          }
        })
        .filter(t => t.usdValue > 0.001 || t.formattedBal > 0)
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
