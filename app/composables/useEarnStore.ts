/**
 * Earn store — standalone catalog for the Earn tab.
 *
 * Difference vs useVaultCatalog:
 *  - Catalog = Composer-probed, used for pocket creation + strategy building
 *  - Earn = raw LI.FI Earn API list (no Composer probe, user directly browses)
 *
 * Phase 4 will extend this to multi-chain. For now Base only.
 */
import { defineStore } from 'pinia'
import { formatUnits, parseAbi } from 'viem'
import { useLifi, type LifiVault } from '~/composables/useLifi'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useCoinGecko } from '~/composables/useCoinGecko'

export interface EarnVault {
  address: string
  chainId: number
  chainName: string
  name: string
  /** Description / sub-label (e.g. "yoUSD") */
  description: string
  protocol: string
  /** Protocol homepage or docs URL */
  protocolUrl: string
  assetSymbol: string
  assetAddress: string
  assetDecimals: number
  /** Total APY including rewards (decimal 0..1) */
  apy: number
  /** Base APY without reward incentives (decimal 0..1) */
  apyBase: number
  /** Reward APY (decimal 0..1) */
  apyReward: number
  /** Historical APY averages — all decimal */
  apy1d: number
  apy7d: number
  apy30d: number
  tvl: number       // USD
  tags: string[]
  isTransactional: boolean
  isRedeemable: boolean
  /** Last updated timestamp from Earn API */
  updatedAt: string | null
  /** Deposit flow type — 'instant' | 'zap' | etc */
  depositStepType: string | null
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  42161: 'Arbitrum',
  10: 'Optimism',
  137: 'Polygon',
  56: 'BNB',
  43114: 'Avalanche',
}

// Phase 4a: Base only. Phase 4d will expand to all chains in parallel.
const ENABLED_CHAINS = [8453]

/** A user-held earn position, computed from onchain reads (NOT LI.FI Portfolio API). */
export interface EarnPosition {
  vault: EarnVault
  /** Vault share token balance (raw bigint, vault decimals) */
  shares: bigint
  /** Underlying asset amount the shares would redeem to (raw bigint, asset decimals) */
  assetsRaw: bigint
  /** Human-readable asset amount */
  assetsAmount: number
  /** USD value at current asset price */
  usdValue: number
}

export const useEarnStore = defineStore('earn', () => {
  const vaults = ref<EarnVault[]>([])
  const positions = ref<EarnPosition[]>([])
  const loadingVaults = ref(false)
  const loadingPositions = ref(false)
  const lastFetchedAt = ref<number | null>(null)

  const { address, getPublicClient } = usePrivyAuth()
  const { getTokenPrices } = useCoinGecko()

  // ── Fetch catalog ────────────────────────────────────────────────────────
  async function fetchVaults(force = false) {
    // Cache for 10 minutes
    if (!force && lastFetchedAt.value && Date.now() - lastFetchedAt.value < 10 * 60 * 1000) return
    loadingVaults.value = true
    try {
      const results = await Promise.all(
        ENABLED_CHAINS.map(async (chainId) => {
          const res = await $fetch<any>('/api/lifi/vaults', {
            query: {
              chainId,
              sortBy: 'apy',
              minTvlUsd: 1_000_000,  // softer threshold for Earn (browse mode)
              limit: 100,
            },
          }).catch(() => ({ data: [] }))
          const list: any[] = res?.data ?? []
          return list
            .filter(v => v.isTransactional === true && v.isRedeemable === true)
            .map((v): EarnVault => {
              // APY values from LI.FI come as percent (not decimal) — normalize to decimal
              const normalize = (raw: unknown): number => {
                const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0')) || 0
                return n > 1 ? n / 100 : n
              }
              const apy = normalize(v.analytics?.apy?.total)
              const apyBase = normalize(v.analytics?.apy?.base)
              const apyReward = normalize(v.analytics?.apy?.reward)
              const apy1d = normalize(v.analytics?.apy1d)
              const apy7d = normalize(v.analytics?.apy7d)
              const apy30d = normalize(v.analytics?.apy30d)

              const protoObj = typeof v.protocol === 'object' ? v.protocol : null
              const proto = protoObj?.name ?? String(v.protocol ?? 'Unknown')
              const protoUrl = protoObj?.url ?? ''
              const underlying = v.underlyingTokens?.[0] ?? {}
              const depositStepType = v.depositPacks?.[0]?.stepsType ?? null

              return {
                address: v.address,
                chainId: v.chainId ?? chainId,
                chainName: CHAIN_NAMES[v.chainId ?? chainId] ?? `Chain ${chainId}`,
                name: v.name ?? underlying.symbol ?? 'Vault',
                description: v.description ?? '',
                protocol: proto,
                protocolUrl: protoUrl,
                assetSymbol: underlying.symbol ?? '',
                assetAddress: underlying.address ?? '',
                assetDecimals: underlying.decimals ?? 18,
                apy,
                apyBase,
                apyReward,
                apy1d,
                apy7d,
                apy30d,
                tvl: parseFloat(v.analytics?.tvl?.usd ?? '0') || 0,
                tags: v.tags ?? [],
                isTransactional: v.isTransactional,
                isRedeemable: v.isRedeemable,
                updatedAt: v.analytics?.updatedAt ?? null,
                depositStepType,
              }
            })
        }),
      )
      vaults.value = results.flat().sort((a, b) => b.apy - a.apy)
      lastFetchedAt.value = Date.now()
    } finally {
      loadingVaults.value = false
    }
  }

  // ── Fetch user positions (onchain — bypass LI.FI Portfolio API) ──────────
  // Scans every vault in the catalog with balanceOf(user). Positions with shares
  // get convertToAssets called and the underlying value is converted to USD via
  // the asset's CoinGecko price. Multicall batches the RPC reads automatically
  // because the public client has `batch.multicall` enabled.
  async function fetchPositions() {
    if (!address.value) return
    if (!vaults.value.length) {
      // Catalog must be loaded first — otherwise we have nothing to scan
      await fetchVaults()
    }
    loadingPositions.value = true
    try {
      const pub = getPublicClient()
      const userAddr = address.value
      const ERC4626_ABI = parseAbi([
        'function balanceOf(address) view returns (uint256)',
        'function convertToAssets(uint256) view returns (uint256)',
      ])

      // Step 1: read balanceOf for every vault in parallel (auto-batched into multicall)
      const balances = await Promise.all(
        vaults.value.map(async (v) => {
          try {
            const shares = await pub.readContract({
              address: v.address as `0x${string}`,
              abi: ERC4626_ABI,
              functionName: 'balanceOf',
              args: [userAddr],
            })
            return { vault: v, shares }
          } catch {
            return { vault: v, shares: 0n }
          }
        }),
      )

      // Step 2: filter out empty positions, then convertToAssets for the rest
      const held = balances.filter(b => b.shares > 0n)
      if (!held.length) {
        positions.value = []
        return
      }

      const withAssets = await Promise.all(
        held.map(async (b) => {
          let assetsRaw: bigint
          try {
            assetsRaw = await pub.readContract({
              address: b.vault.address as `0x${string}`,
              abi: ERC4626_ABI,
              functionName: 'convertToAssets',
              args: [b.shares],
            })
          } catch {
            // Non-ERC-4626 (e.g. Aave aTokens) — share balance == underlying 1:1
            assetsRaw = b.shares
          }
          return { ...b, assetsRaw }
        }),
      )

      // Step 3: get prices for every unique asset address (CoinGecko)
      const uniqueAssetAddrs = Array.from(new Set(
        withAssets.map(p => p.vault.assetAddress.toLowerCase()).filter(Boolean),
      ))
      let prices: Record<string, number> = {}
      try {
        prices = await getTokenPrices(uniqueAssetAddrs)
      } catch (e) {
        console.warn('[earn] price fetch failed', e)
      }

      positions.value = withAssets.map((p) => {
        const assetsAmount = parseFloat(formatUnits(p.assetsRaw, p.vault.assetDecimals))
        const price = prices[p.vault.assetAddress.toLowerCase()] ?? 0
        return {
          vault: p.vault,
          shares: p.shares,
          assetsRaw: p.assetsRaw,
          assetsAmount,
          usdValue: assetsAmount * price,
        }
      }).sort((a, b) => b.usdValue - a.usdValue)
    } catch (e) {
      console.warn('[earn] fetchPositions failed', e)
      positions.value = []
    } finally {
      loadingPositions.value = false
    }
  }

  // ── Filters + derived state ──────────────────────────────────────────────
  const totalPositionsUsd = computed(() =>
    positions.value.reduce((s, p) => s + p.usdValue, 0),
  )

  const uniqueAssets = computed(() => {
    const set = new Set<string>()
    for (const v of vaults.value) if (v.assetSymbol) set.add(v.assetSymbol)
    return Array.from(set).sort()
  })

  const uniqueProtocols = computed(() => {
    const set = new Set<string>()
    for (const v of vaults.value) set.add(v.protocol)
    return Array.from(set).sort()
  })

  function reset() {
    vaults.value = []
    positions.value = []
    lastFetchedAt.value = null
  }

  return {
    vaults,
    positions,
    loadingVaults,
    loadingPositions,
    totalPositionsUsd,
    uniqueAssets,
    uniqueProtocols,
    fetchVaults,
    fetchPositions,
    reset,
  }
})
