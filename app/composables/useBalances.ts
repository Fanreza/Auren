import { erc20Abi, formatUnits } from 'viem'
import { usePrivyAuth } from '~/composables/usePrivy'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'

export function useBalances() {
  const { address, getPublicClient } = usePrivyAuth()

  const ethBalance = ref<bigint>(0n)
  const usdcBalance = ref<bigint>(0n)
  const cbbtcBalance = ref<bigint>(0n)
  const loading = ref(false)

  async function fetchBalances() {
    if (!address.value) return
    loading.value = true
    try {
      const publicClient = getPublicClient()
      const [eth, usdc, cbbtc] = await Promise.all([
        publicClient.getBalance({ address: address.value }),
        publicClient.readContract({
          address: STRATEGIES.conservative.assetAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address.value],
        }),
        publicClient.readContract({
          address: STRATEGIES.balanced.assetAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address.value],
        }),
      ])
      ethBalance.value = eth
      usdcBalance.value = usdc as bigint
      cbbtcBalance.value = cbbtc as bigint
    } catch (e) {
      console.error('Failed to fetch balances:', e)
    } finally {
      loading.value = false
    }
  }

  function rawBalance(key: StrategyKey): bigint {
    switch (key) {
      case 'conservative': return usdcBalance.value
      case 'balanced': return cbbtcBalance.value
      case 'aggressive': return ethBalance.value
    }
  }

  function formattedBalance(key: StrategyKey): string {
    const strategy = STRATEGIES[key]
    return formatUnits(rawBalance(key), strategy.decimals)
  }

  const formattedEth = computed(() => formatUnits(ethBalance.value, 18))

  watch(() => address.value, (addr) => {
    if (addr) fetchBalances()
    else {
      ethBalance.value = 0n
      usdcBalance.value = 0n
      cbbtcBalance.value = 0n
    }
  }, { immediate: true })

  let interval: ReturnType<typeof setInterval> | null = null
  onMounted(() => {
    interval = setInterval(() => {
      if (address.value) fetchBalances()
    }, 30_000)
  })
  onUnmounted(() => {
    if (interval) clearInterval(interval)
  })

  return {
    ethBalance,
    formattedEth,
    rawBalance,
    formattedBalance,
    fetchBalances,
    loading,
  }
}
