import { defineStore } from 'pinia'
import { createPublicClient, http } from 'viem'
import { formatUnits } from 'viem'
import { mainnet } from 'viem/chains'
import { usePrivyAuth } from '~/composables/usePrivy'
import type { DbUser, DbPocket, UpdatePocketInput } from '~/types/database'
import { useUserData } from '~/composables/useUserData'
import { useVault } from '~/composables/useVault'
import { useCoinGecko } from '~/composables/useCoinGecko'
import { BRAND } from '~/config/brand'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

export const useProfileStore = defineStore('profile', () => {
  const { ensureUser, updateDisplayName: updateDbName, getPockets: fetchDbPockets, createPocket: createDbPocket, updatePocket: updateDbPocket, deletePocket: deleteDbPocket } = useUserData()
  const { getShareBalance, getShareValue, getVaultSnapshot, getUserPerformance } = useVault()
  const { getTokenPrices } = useCoinGecko()

  // ---- State ----
  const currentUser = ref<DbUser | null>(null)
  const ensName = ref<string | null>(null)
  const ensResolved = ref(false)
  const customName = ref('')
  const pockets = ref<DbPocket[]>([])
  const loading = ref(false)

  // ---- Cached position / market data (persists across navigations) ----
  const pocketPositions = ref<Record<string, { shares: bigint; value: bigint }>>({})
  const assetPrices = ref<Record<string, number>>({})
  const vaultApys = ref<Record<string, string | null>>({})
  const vaultTvls = ref<Record<string, string | null>>({})
  const vaultApyDetails = ref<Record<string, { '1d': string | null; '7d': string | null; '30d': string | null }>>({})
  const pocketProfits = ref<Record<string, string | null>>({})
  const loadingPositions = ref(false)
  const positionsFetched = ref(false)

  // ---- Getters ----
  function displayName(address: string): string {
    if (ensName.value) return ensName.value
    if (customName.value) return customName.value
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // ---- Actions ----
  function reset() {
    currentUser.value = null
    ensName.value = null
    ensResolved.value = false
    customName.value = ''
    pockets.value = []
    pocketPositions.value = {}
    assetPrices.value = {}
    vaultApys.value = {}
    vaultTvls.value = {}
    vaultApyDetails.value = {}
    pocketProfits.value = {}
    positionsFetched.value = false
  }

  async function resolveEns(address: `0x${string}`) {
    try {
      ensName.value = await mainnetClient.getEnsName({ address })
    } catch {
      ensName.value = null
    }
    ensResolved.value = true
  }

  async function loadProfile(address: `0x${string}`) {
    loading.value = true
    try {
      const user = await ensureUser(address)
      if (user) {
        currentUser.value = user
        customName.value = user.display_name || ''
        pockets.value = await fetchDbPockets(user.id)

        // Apply pending referral code (from ?ref=CODE in URL)
        const pendingRef = localStorage.getItem(`${BRAND.storagePrefix}_referral_code`)
        if (pendingRef && !user.referred_by) {
          const { joinWithReferral } = useUserData()
          const ok = await joinWithReferral(address, pendingRef)
          if (ok) localStorage.removeItem(`${BRAND.storagePrefix}_referral_code`)
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function setCustomName(name: string) {
    customName.value = name
    if (currentUser.value?.address) {
      await updateDbName(currentUser.value.address, name)
    }
  }

  async function refreshPockets() {
    if (!currentUser.value) return
    pockets.value = await fetchDbPockets(currentUser.value.id)
  }

  async function createPocket(input: Parameters<typeof createDbPocket>[0]) {
    const pocket = await createDbPocket(input)
    if (pocket) {
      pockets.value = [pocket, ...pockets.value]
    }
    return pocket
  }

  async function updatePocket(id: string, input: UpdatePocketInput) {
    const ok = await updateDbPocket(id, input)
    if (ok) {
      const idx = pockets.value.findIndex(p => p.id === id)
      if (idx !== -1) {
        pockets.value[idx] = { ...pockets.value[idx], ...input }
      }
    }
    return ok
  }

  async function deletePocket(id: string) {
    const ok = await deleteDbPocket(id)
    if (ok) {
      pockets.value = pockets.value.filter(p => p.id !== id)
    }
    return ok
  }

  // ---- Market data fetching ----
  function getAssetPrice(strategyKey: string): number {
    const strategy = STRATEGIES[strategyKey as StrategyKey]
    if (!strategy) return 0
    return assetPrices.value[strategy.assetAddress.toLowerCase()] ?? 0
  }

  function getStrategyApy(strategyKey: string): string | null {
    return vaultApys.value[strategyKey] ?? null
  }

  function getStrategyTvl(strategyKey: string): string | null {
    return vaultTvls.value[strategyKey] ?? null
  }

  function getStrategyApyDetails(strategyKey: string): { '1d': string | null; '7d': string | null; '30d': string | null } | null {
    return vaultApyDetails.value[strategyKey] ?? null
  }

  const totalPortfolioUsd = computed(() => {
    return pockets.value.reduce((sum, pocket) => {
      const pos = pocketPositions.value[pocket.id]
      if (!pos || pos.value === 0n) return sum
      const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
      if (!strategy) return sum
      const assetVal = parseFloat(formatUnits(pos.value, strategy.decimals))
      const price = getAssetPrice(pocket.strategy_key)
      return sum + assetVal * price
    }, 0)
  })

  const totalPortfolioFormatted = computed(() => {
    if (totalPortfolioUsd.value === 0) return '$0.00'
    return '$' + totalPortfolioUsd.value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  })

  async function fetchAssetPrices() {
    const addresses = STRATEGY_LIST.map(s => s.assetAddress as string)
    const prices = await getTokenPrices(addresses)
    assetPrices.value = prices
  }

  async function fetchVaultSnapshots() {
    for (const strategy of STRATEGY_LIST) {
      try {
        const snapshot = await getVaultSnapshot(strategy)
        if (snapshot?.yield) {
          vaultApys.value[strategy.key] = snapshot.yield['7d'] ?? snapshot.yield['30d'] ?? null
          vaultApyDetails.value[strategy.key] = {
            '1d': snapshot.yield['1d'],
            '7d': snapshot.yield['7d'],
            '30d': snapshot.yield['30d'],
          }
        }
        if (snapshot?.tvl != null) {
          vaultTvls.value[strategy.key] = snapshot.tvl
        }
      } catch (e) {
        console.error(`[apy] ${strategy.vaultSymbol} snapshot failed:`, e)
      }
    }
  }

  async function fetchPocketPosition(pocket: DbPocket) {
    const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
    if (!strategy) return
    try {
      const shares = await getShareBalance(strategy)
      const value = await getShareValue(strategy, shares)
      pocketPositions.value[pocket.id] = { shares, value }
    } catch (e) {
      console.error(`[position] ${pocket.name} fetch failed:`, e)
      pocketPositions.value[pocket.id] = { shares: 0n, value: 0n }
    }
  }

  async function fetchUserPerformances(userAddress: string) {
    const seen = new Set<string>()
    for (const pocket of pockets.value) {
      const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
      if (!strategy || seen.has(strategy.key)) continue
      seen.add(strategy.key)
      try {
        const perf = await getUserPerformance(strategy, userAddress)
        if (perf) {
          for (const p of pockets.value.filter(pp => pp.strategy_key === strategy.key)) {
            pocketProfits.value[p.id] = perf.unrealized.formatted
          }
        }
      } catch (e) {
        console.error(`[profit] ${strategy.vaultSymbol} performance failed:`, e)
      }
    }
  }

  async function fetchAllPositions(userAddress: string) {
    loadingPositions.value = true
    try {
      await Promise.all([
        fetchAssetPrices(),
        fetchVaultSnapshots(),
        ...pockets.value.map(p => fetchPocketPosition(p)),
      ])
      fetchUserPerformances(userAddress)
    } finally {
      loadingPositions.value = false
    }
  }

  // ---- Auto-fetch on address change ----
  const { address: privyAddress } = usePrivyAuth()

  watch(() => privyAddress.value, async (addr, oldAddr) => {
    if (addr === oldAddr) return
    reset()
    if (addr) {
      resolveEns(addr)
      await loadProfile(addr)
    }
  }, { immediate: true })

  // Fetch positions once when pockets first load
  watch(pockets, () => {
    if (pockets.value.length && privyAddress.value && !positionsFetched.value) {
      positionsFetched.value = true
      fetchAllPositions(privyAddress.value)
    }
  })

  return {
    currentUser,
    ensName,
    customName,
    pockets,
    loading,
    pocketPositions,
    assetPrices,
    vaultApys,
    vaultTvls,
    vaultApyDetails,
    pocketProfits,
    loadingPositions,
    totalPortfolioUsd,
    totalPortfolioFormatted,
    displayName,
    getAssetPrice,
    getStrategyApy,
    getStrategyTvl,
    getStrategyApyDetails,
    reset,
    setCustomName,
    refreshPockets,
    createPocket,
    updatePocket,
    deletePocket,
    fetchAllPositions,
    fetchPocketPosition,
  }
})
