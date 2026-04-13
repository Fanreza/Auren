import { defineStore } from 'pinia'
import { formatUnits } from 'viem'
import { usePrivyAuth } from '~/composables/usePrivy'
import type { DbUser, DbPocket, UpdatePocketInput } from '~/types/database'
import { useUserData } from '~/composables/useUserData'
import { useVault } from '~/composables/useVault'
import { useCoinGecko } from '~/composables/useCoinGecko'
import { useLifi } from '~/composables/useLifi'
import { BRAND } from '~/config/brand'
import { STRATEGIES, STRATEGY_LIST, LEGACY_VAULTS, type StrategyKey } from '~/config/strategies'


export interface LifiAllocData {
  address: string
  chainId: number
  protocol: string
  vaultSymbol: string
  apy: number
  tvl: number
  weight: number
  assetSymbol: string
}

export const useProfileStore = defineStore('profile', () => {
  const { ensureUser, updateDisplayName: updateDbName, getPockets: fetchDbPockets, createPocket: createDbPocket, updatePocket: updateDbPocket, deletePocket: deleteDbPocket, getTransactions } = useUserData()
  const { getShareBalance, getShareValue } = useVault()
  const { getTokenPrices } = useCoinGecko()
  const { getPortfolioPositions } = useLifi()

  // ---- State ----
  const currentUser = ref<DbUser | null>(null)
  const customName = ref('')
  const pockets = ref<DbPocket[]>([])
  const loading = ref(false)

  // ---- Cached position / market data (persists across navigations) ----
  const pocketPositions = ref<Record<string, { shares: bigint; value: bigint }>>({})
  const assetPrices = ref<Record<string, number>>({})
  const vaultApys = ref<Record<string, string | null>>({})
  const vaultTvls = ref<Record<string, string | null>>({})
  const vaultApyDetails = ref<Record<string, { '1d': string | null; '7d': string | null; '30d': string | null }>>({})
  const loadingPositions = ref(false)
  const positionsFetched = ref(false)

  // ---- LI.FI vault data (per-allocation, per-strategy from LI.FI Earn API) ----
  // Each strategy has an array of allocation vaults (one per VaultAllocation).
  // Used as toToken targets in LI.FI Composer deposits.
  const lifiVaultAddresses = ref<Record<string, LifiAllocData[]>>({
    conservative: [],
    balanced: [],
    aggressive: [],
  })

  // Portfolio positions from LI.FI Earn (for wallets that deposited via LI.FI)
  const lifiPortfolioValue = ref<number>(0)

  // Session flag — reset in reset() so re-login refetches vault snapshots
  let _vaultSnapshotsFetched = false

  // ---- Getters ----
  function displayName(address: string): string {
    if (customName.value) return customName.value
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // ---- Actions ----
  function reset() {
    currentUser.value = null
    customName.value = ''
    pockets.value = []
    pocketPositions.value = {}
    assetPrices.value = {}
    vaultApys.value = {}
    vaultTvls.value = {}
    vaultApyDetails.value = {}
    positionsFetched.value = false
    lifiVaultAddresses.value = { conservative: [], balanced: [], aggressive: [] }
    lifiPortfolioValue.value = 0
    _vaultSnapshotsFetched = false
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

    // Always fetch vault snapshots + asset prices on profile load, even for
    // users with zero pockets — the "Explore strategies" section needs live APY/TVL.
    const hasSnapshots = Object.values(lifiVaultAddresses.value).some(arr => arr.length > 0)
    if (!_vaultSnapshotsFetched || !hasSnapshots) {
      fetchVaultSnapshots().then(() => { _vaultSnapshotsFetched = true })
    }
    fetchAssetPrices()
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
        const prev = pockets.value[idx]
        pockets.value[idx] = { ...prev, ...input } as typeof pockets.value[number]
        // If vault_address changed, the cached position reading points at the
        // old vault and is now stale. Zero it out immediately so the UI doesn't
        // keep showing phantom balance from the old vault after a migration.
        // The next fetchPocketPosition call will repopulate from the new vault.
        if (input.vault_address && input.vault_address !== prev?.vault_address) {
          pocketPositions.value[id] = { shares: 0n, value: 0n }
          // Refresh in background so UI catches up with onchain reality asap
          fetchPocketPosition(pockets.value[idx]!).catch(() => {})
        }
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

  // How many vaults per token (1 = pick single highest APY)
  const VAULTS_PER_TOKEN = 1
  // Minimum TVL to consider a vault safe (USD)
  const MIN_VAULT_TVL_USD = 10_000_000

  /** Probe whether a vault is LI.FI Composer-compatible by requesting a
   *  tiny dummy quote. Composer support is what allows single-tx deposits;
   *  `isTransactional` from Earn API only means the vault accepts onchain
   *  deposits (not that Composer has an adapter for it). */
  async function isComposerCompatible(
    vaultAddress: string,
    assetAddress: string,
    assetDecimals: number,
  ): Promise<boolean> {
    // Probe with 1 unit of underlying (safe — no actual tx is sent)
    const probeAmount = (BigInt(10) ** BigInt(assetDecimals)).toString()
    // Any valid address works — LI.FI doesn't check balance for quote generation
    const probeAddress = '0x000000000000000000000000000000000000dEaD'
    try {
      const quote = await $fetch<any>('/api/lifi/quote', {
        query: {
          fromChain: 8453,
          toChain: 8453,
          fromToken: assetAddress,
          toToken: vaultAddress,
          fromAmount: probeAmount,
          fromAddress: probeAddress,
          toAddress: probeAddress,
          slippage: 0.005,
          order: 'RECOMMENDED',
        },
      })
      return quote?.tool === 'composer'
    } catch {
      return false
    }
  }

  /** Fetch top N vaults per strategy's single asset from Base.
   *  Filter: underlying token must match strategy.assetAddress (canonical),
   *  TVL >= $10M, transactional, redeemable, no timelock, AND Composer-compatible.
   *  Composer is probed at runtime via a dummy quote — guarantees single-tx deposits.
   *  Docs: https://docs.li.fi/api-reference/vaults/list-vaults-with-optional-filtering */
  async function fetchVaultSnapshots() {
    await Promise.allSettled(
      STRATEGY_LIST.map(async (strategy) => {
        const symbolsToTry = [strategy.lifiAssetSymbol, ...strategy.lifiAssetSymbols]
        const canonical = strategy.assetAddress.toLowerCase()
        let vaults: any[] = []

        for (const symbol of symbolsToTry) {
          try {
            // Server-side filter: minTvlUsd + sortBy=apy. Earn API returns results already sorted.
            const res = await $fetch<any>('/api/lifi/vaults', {
              query: {
                chainId: 8453,
                asset: symbol,
                sortBy: 'apy',
                minTvlUsd: MIN_VAULT_TVL_USD,
                limit: 50,
              },
            })
            const candidates: any[] = res?.data ?? []
            const seenAddr = new Set<string>()
            // Static filter: transactional, redeemable, no timelock, right underlying, dedupe
            const staticallyOk = candidates.filter((v) => {
              if (v.isTransactional !== true) return false
              if (v.isRedeemable !== true) return false
              if (v.timeLock && v.timeLock > 0) return false
              const underlying = v.underlyingTokens?.[0]?.address?.toLowerCase()
              if (underlying !== canonical) return false
              const addr = v.address?.toLowerCase()
              if (!addr || seenAddr.has(addr)) return false
              seenAddr.add(addr)
              return true
            })

            // Populate display data from the top static candidate immediately
            // so Explore cards always show APY/TVL, even before Composer probe.
            if (staticallyOk.length && !vaults.length) {
              vaults = staticallyOk.slice(0, VAULTS_PER_TOKEN)
            }

            // Walk sorted candidates top-down, probing Composer compatibility.
            // This runs in background — if probe succeeds we refine `vaults`
            // to only Composer-compatible ones, but display is never empty.
            const composerVaults: any[] = []
            for (const candidate of staticallyOk) {
              if (composerVaults.length >= VAULTS_PER_TOKEN) break
              try {
                const ok = await isComposerCompatible(
                  candidate.address,
                  strategy.assetAddress,
                  strategy.decimals,
                )
                if (ok) {
                  composerVaults.push(candidate)
                } else if (import.meta.dev) {
                  const proto = typeof candidate.protocol === 'object' ? candidate.protocol?.name : candidate.protocol
                  console.warn(`[vault] ${candidate.name} (${proto}) rejected: not Composer-compatible`)
                }
              } catch (e) {
                if (import.meta.dev) console.warn('[vault] probe threw, keeping static candidate', e)
              }
            }
            // If any composer vault passed, use it. Otherwise keep static fallback.
            if (composerVaults.length) vaults = composerVaults
            if (vaults.length) break
          } catch (e) {
            console.error(`[vault] ${symbol}: fetch failed`, e)
          }
        }

        if (!vaults.length) return

        const weightPerVault = 1 / vaults.length
        const allocVaults: LifiAllocData[] = vaults.map(vault => {
          const rawApy = vault.analytics?.apy?.total ?? 0
          const apy = rawApy > 1 ? rawApy / 100 : rawApy
          const protocol = typeof vault.protocol === 'object'
            ? (vault.protocol?.name ?? 'Unknown')
            : String(vault.protocol ?? 'Unknown')

          if (import.meta.dev) {
            const tvl = Math.round(parseFloat(vault.analytics?.tvl?.usd ?? '0') / 1000)
            console.log(`[vault] ${strategy.key}/${strategy.assetSymbol}: ${vault.name} via ${protocol}, apy=${(apy * 100).toFixed(1)}%, tvl=$${tvl}k`)
          }

          return {
            address: vault.address,
            chainId: vault.chainId,
            protocol,
            vaultSymbol: vault.name ?? strategy.assetSymbol,
            apy,
            tvl: parseFloat(vault.analytics?.tvl?.usd ?? '0') || 0,
            weight: weightPerVault,
            assetSymbol: strategy.assetSymbol,
          }
        })

        lifiVaultAddresses.value[strategy.key] = allocVaults

        // APY = weighted average across vaults
        const weightedApy = allocVaults.reduce((s, v) => s + v.apy * v.weight, 0)
        if (weightedApy > 0 && !isNaN(weightedApy)) {
          const apyPct = (weightedApy * 100).toFixed(2)
          vaultApys.value[strategy.key] = apyPct
          vaultApyDetails.value[strategy.key] = { '1d': apyPct, '7d': apyPct, '30d': apyPct }
        }
        vaultTvls.value[strategy.key] = String(Math.round(allocVaults.reduce((s, v) => s + v.tvl, 0)))
      }),
    )
  }

  /** Read onchain position for a pocket. Phase 4: pocket can own N vaults via
   *  pocket_allocations. Sum balanceOf + convertToAssets across every allocation. */
  async function fetchPocketPosition(pocket: DbPocket) {
    const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
    if (!strategy) return

    const { address: userAddr, getPublicClient } = usePrivyAuth()
    if (!userAddr.value) return

    try {
      const pub = getPublicClient()
      const vaultAddrs: `0x${string}`[] = []
      // Phase 4: prefer pocket_allocations (multi-vault)
      if (pocket.allocations?.length) {
        for (const a of pocket.allocations) {
          vaultAddrs.push(a.vault_address as `0x${string}`)
        }
      } else if (pocket.vault_address) {
        // Phase 1 single-vault fallback
        vaultAddrs.push(pocket.vault_address as `0x${string}`)
      } else {
        // Legacy pre-Phase-1 fallback — use current top snapshot
        const allocs = lifiVaultAddresses.value[pocket.strategy_key] ?? []
        for (const a of allocs) vaultAddrs.push(a.address as `0x${string}`)
      }
      if (!vaultAddrs.length) vaultAddrs.push(strategy.vaultAddress)

      // Read balanceOf + convertToAssets from each vault in parallel
      const results = await Promise.all(
        vaultAddrs.map(async (vaultAddr) => {
          try {
            const shares = await pub.readContract({
              address: vaultAddr,
              abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] }],
              functionName: 'balanceOf',
              args: [userAddr.value!],
            })
            if (shares === 0n) return 0n
            try {
              return await pub.readContract({
                address: vaultAddr,
                abi: [{ name: 'convertToAssets', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }], outputs: [{ type: 'uint256' }] }],
                functionName: 'convertToAssets',
                args: [shares],
              })
            } catch {
              return shares // not ERC-4626, use raw balance
            }
          } catch {
            return 0n
          }
        }),
      )

      const totalValue = results.reduce((sum, v) => sum + (v as bigint), 0n)
      pocketPositions.value[pocket.id] = { shares: totalValue, value: totalValue }
    } catch (e) {
      console.error(`[position] ${pocket.name} fetch failed:`, e)
      pocketPositions.value[pocket.id] = { shares: 0n, value: 0n }
    }
  }

  async function fetchLifiPortfolio(userAddress: string) {
    try {
      const positions = await getPortfolioPositions(userAddress)
      lifiPortfolioValue.value = positions.reduce((sum, p) => sum + (p.assetsValue ?? 0), 0)
    } catch (e) {
      console.error('[lifi] fetchLifiPortfolio failed:', e)
    }
  }

  async function fetchAllPositions(userAddress: string) {
    loadingPositions.value = true
    try {
      // Only fetch vault snapshots once per session — they don't change often.
      // Re-fetch if the cache is empty (e.g. after reset/login) even when the flag is set.
      const hasSnapshots = Object.values(lifiVaultAddresses.value).some(arr => arr.length > 0)
      if (!_vaultSnapshotsFetched || !hasSnapshots) {
        await fetchVaultSnapshots()
        _vaultSnapshotsFetched = true
      }
      await Promise.all([
        fetchAssetPrices(),
        fetchLifiPortfolio(userAddress),
        ...pockets.value.map(p => fetchPocketPosition(p)),
      ])
      // Phase 1: reconciliation disabled. Each pocket has its own vault_address
      // (strict 1 pocket = 1 vault). The legacy reconcile assumes all pockets in
      // the same strategy share a vault and overrides pocketPositions with
      // ratio-split values — which corrupts freshly-fetched per-vault balances.
    } finally {
      loadingPositions.value = false
    }
  }

  /** Split shared vault balance across pockets that use the same strategy.
   *  Without this, both pockets would read the full on-chain balance (double count). */
  async function reconcileDuplicateStrategies() {
    // Group pockets by strategy_key
    const groups = new Map<string, DbPocket[]>()
    for (const p of pockets.value) {
      const arr = groups.get(p.strategy_key) ?? []
      arr.push(p)
      groups.set(p.strategy_key, arr)
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue  // single pocket → no split needed

      // Compute net contributed per pocket from DB tx history.
      // `amount` is stored as USD decimal (see useDashboardStats for convention).
      const principals = await Promise.all(
        group.map(async (p) => {
          const txs = await getTransactions(p.id)
          let net = 0
          for (const t of txs) {
            const usd = parseFloat(t.amount) || 0
            if (t.type === 'deposit') net += usd
            else if (t.type === 'withdraw' || t.type === 'redeem') net -= usd
          }
          return Math.max(net, 0)
        }),
      )

      const totalPrincipal = principals.reduce((a, b) => a + b, 0)
      // All pockets in this group currently hold the FULL shared vault balance
      // (from fetchPocketPosition). Pick any pocket's value as the shared total.
      const sharedPos = pocketPositions.value[group[0]!.id]
      if (!sharedPos) continue
      const sharedShares = sharedPos.shares
      const sharedValue = sharedPos.value

      if (totalPrincipal <= 0) {
        // No tx history → split evenly so total adds up correctly
        const n = BigInt(group.length)
        for (const p of group) {
          pocketPositions.value[p.id] = {
            shares: sharedShares / n,
            value: sharedValue / n,
          }
        }
        continue
      }

      // Use bigint math with a scaling factor for precision (1e9)
      const SCALE = 1_000_000_000
      for (let i = 0; i < group.length; i++) {
        const p = group[i]!
        const ratioInt = BigInt(Math.round((principals[i]! / totalPrincipal) * SCALE))
        pocketPositions.value[p.id] = {
          shares: (sharedShares * ratioInt) / BigInt(SCALE),
          value: (sharedValue * ratioInt) / BigInt(SCALE),
        }
      }
    }
  }

  // ---- Auto-fetch on address change ----
  // Use EOA address for DB identity (stable), smart account address for onchain ops
  const { address: privyAddress, eoaWalletAddress } = usePrivyAuth()

  // Track which EOA we've loaded profile for — avoid re-loading when address
  // changes from EOA → smart account during initSmartAccount()
  const _loadedEoa = ref<string | null>(null)

  watch([() => privyAddress.value, () => eoaWalletAddress.value], async ([addr, eoa]) => {
    // Determine the DB identity: EOA if available, else current address
    const dbAddress = eoa ?? addr
    if (!dbAddress) { reset(); return }

    // Skip if we already loaded for this EOA
    if (_loadedEoa.value === dbAddress) return
    _loadedEoa.value = dbAddress

    reset()
    await loadProfile(dbAddress)
  }, { immediate: true })

  // Fetch on-chain positions once when pockets first load
  // Must fetch vault snapshots first so fetchPocketPosition reads the correct vault addresses
  watch(pockets, async () => {
    if (pockets.value.length && privyAddress.value && !positionsFetched.value) {
      positionsFetched.value = true
      // Vault snapshots needed to know which vaults to read positions from
      await fetchVaultSnapshots()
      await Promise.all([
        fetchAssetPrices(),
        fetchLifiPortfolio(privyAddress.value!),
        ...pockets.value.map(p => fetchPocketPosition(p)),
      ])
    }
  })

  return {
    currentUser,
    customName,
    pockets,
    loading,
    pocketPositions,
    assetPrices,
    vaultApys,
    vaultTvls,
    vaultApyDetails,
    loadingPositions,
    lifiVaultAddresses,
    lifiPortfolioValue,
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
    fetchVaultSnapshots,
  }
})
