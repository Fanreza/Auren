<script setup lang="ts">
import { parseAbi, encodeFunctionData } from 'viem'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useProfileStore } from '~/stores/useProfileStore'
import { useUserData } from '~/composables/useUserData'
import { useCurrency } from '~/composables/useCurrency'
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  pocket: DbPocket | null
  /** Current vault address user is in */
  currentVaultAddress?: string
}>()

const emit = defineEmits<{
  done: []
}>()

const { address, getPublicClient, getWalletClient } = usePrivyAuth()
const profileStore = useProfileStore()
const { recordTransaction } = useUserData()
const { format } = useCurrency()

// ── Available vault candidates for this strategy ────────────────────────────
interface VaultOption {
  address: string
  name: string
  protocol: string
  apy: number          // decimal
  tvl: number          // USD
  isCurrent: boolean
  isRecommended: boolean
}

const candidateVaults = ref<VaultOption[]>([])
const loadingCandidates = ref(false)

async function fetchCandidates() {
  if (!props.pocket) return
  loadingCandidates.value = true
  try {
    const strategy = STRATEGIES[props.pocket.strategy_key as StrategyKey]
    if (!strategy) return

    // Reuse Earn API filter — same as fetchVaultSnapshots but limit higher
    const res = await $fetch<any>('/api/lifi/vaults', {
      query: {
        chainId: 8453,
        asset: strategy.lifiAssetSymbol,
        sortBy: 'apy',
        minTvlUsd: 10_000_000,
        limit: 30,
      },
    })
    const candidates: any[] = res?.data ?? []
    const canonical = strategy.assetAddress.toLowerCase()

    // Static filter
    const filtered = candidates.filter((v) => {
      if (v.isTransactional !== true) return false
      if (v.isRedeemable !== true) return false
      if (v.timeLock && v.timeLock > 0) return false
      const u = v.underlyingTokens?.[0]?.address?.toLowerCase()
      return u === canonical
    })

    // Map to VaultOption
    const opts: VaultOption[] = filtered.map((v) => {
      const rawApy = v.analytics?.apy?.total ?? 0
      const apy = rawApy > 1 ? rawApy / 100 : rawApy
      const proto = typeof v.protocol === 'object' ? (v.protocol?.name ?? 'Unknown') : String(v.protocol)
      return {
        address: v.address,
        name: v.name ?? strategy.assetSymbol,
        protocol: proto,
        apy,
        tvl: parseFloat(v.analytics?.tvl?.usd ?? '0') || 0,
        isCurrent: v.address.toLowerCase() === props.currentVaultAddress?.toLowerCase(),
        isRecommended: false,
      }
    })

    // Sort by APY desc, mark top one as recommended (excluding current)
    opts.sort((a, b) => b.apy - a.apy)
    const topNonCurrent = opts.find(o => !o.isCurrent)
    if (topNonCurrent) topNonCurrent.isRecommended = true

    candidateVaults.value = opts
  } catch (e) {
    console.error('[switch-vault] fetch candidates failed:', e)
    candidateVaults.value = []
  } finally {
    loadingCandidates.value = false
  }
}

watch(open, (v) => {
  if (v) {
    selectedVault.value = null
    switchError.value = ''
    switching.value = false
    switchStep.value = 'idle'
    fetchCandidates()
  }
})

// ── Selection + execute ─────────────────────────────────────────────────────
const selectedVault = ref<VaultOption | null>(null)
const switching = ref(false)
const switchStep = ref<'idle' | 'redeeming' | 'depositing' | 'confirming' | 'done'>('idle')
const switchError = ref('')

const currentVault = computed(() => candidateVaults.value.find(v => v.isCurrent) ?? null)

const apyDiff = computed(() => {
  if (!selectedVault.value || !currentVault.value) return 0
  return (selectedVault.value.apy - currentVault.value.apy) * 100
})

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)',
])

const ERC4626_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
])

async function executeSwitch() {
  if (!props.pocket || !selectedVault.value || !currentVault.value || !address.value) return
  if (selectedVault.value.isCurrent) return

  const strategy = STRATEGIES[props.pocket.strategy_key as StrategyKey]
  if (!strategy) return

  switching.value = true
  switchError.value = ''
  switchStep.value = 'redeeming'

  let lastHash: `0x${string}` | null = null

  try {
    const pub = getPublicClient()
    const client = await getWalletClient()

    // Step 1: Read current shares from old vault
    const shares = await pub.readContract({
      address: currentVault.value.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address.value],
    })

    if (shares === 0n) {
      switchError.value = 'No shares to migrate from current vault'
      switchStep.value = 'idle'
      return
    }

    // Step 2: Redeem all shares from old vault
    const redeemData = encodeFunctionData({
      abi: ERC4626_ABI,
      functionName: 'redeem',
      args: [shares, address.value, address.value],
    })
    const redeemHash = await client.sendTransaction({
      to: currentVault.value.address as `0x${string}`,
      data: redeemData,
    })
    await pub.waitForTransactionReceipt({ hash: redeemHash })

    // Step 3: Read underlying balance after redeem
    const underlyingBal = await pub.readContract({
      address: strategy.assetAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address.value],
    })

    if (underlyingBal === 0n) {
      switchError.value = 'Redeem produced no underlying asset'
      switchStep.value = 'idle'
      return
    }

    // Step 4: Approve new vault if needed
    switchStep.value = 'depositing'
    const allowance = await pub.readContract({
      address: strategy.assetAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [address.value, selectedVault.value.address as `0x${string}`],
    })

    if (allowance < underlyingBal) {
      const approveData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [selectedVault.value.address as `0x${string}`, BigInt(2) ** BigInt(256) - BigInt(1)],
      })
      const approveHash = await client.sendTransaction({
        to: strategy.assetAddress,
        data: approveData,
      })
      await pub.waitForTransactionReceipt({ hash: approveHash })
    }

    // Step 5: Deposit into new vault
    const depositData = encodeFunctionData({
      abi: ERC4626_ABI,
      functionName: 'deposit',
      args: [underlyingBal, address.value],
    })
    const depositHash = await client.sendTransaction({
      to: selectedVault.value.address as `0x${string}`,
      data: depositData,
    })
    lastHash = depositHash
    switchStep.value = 'confirming'
    await pub.waitForTransactionReceipt({ hash: depositHash })

    // Record migration as a dual transaction (redeem + deposit)
    const usdValue = parseFloat(profileStore.pocketPositions[props.pocket.id]?.value?.toString() ?? '0')
      / Math.pow(10, strategy.decimals)
      * (profileStore.getAssetPrice(strategy.key) || 0)

    if (lastHash) {
      await recordTransaction({
        pocket_id: props.pocket.id,
        type: 'switch',
        amount: usdValue.toFixed(6),
        asset_symbol: strategy.assetSymbol,
        tx_hash: lastHash,
        timestamp: Math.floor(Date.now() / 1000),
      }).catch(() => {})
    }

    switchStep.value = 'done'
    emit('done')
    setTimeout(() => { open.value = false }, 2500)
  } catch (e: any) {
    console.error('[switch-vault] failed:', e)
    switchError.value = e.shortMessage || e.message || 'Switch failed'
    switchStep.value = 'idle'
  } finally {
    switching.value = false
  }
}

function fmtTvl(n: number): string {
  if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(1) + 'B'
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(0) + 'M'
  if (n >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg p-0 gap-0 max-h-[90dvh] overflow-y-auto">
      <div class="px-5 pt-5 pb-3 border-b border-border/40">
        <DialogHeader>
          <DialogTitle class="text-base">Switch vault</DialogTitle>
          <DialogDescription class="text-xs">
            Move your {{ pocket?.name }} balance to a different vault. Funds redeem from the old vault, then deposit to the new one in 2 transactions.
          </DialogDescription>
        </DialogHeader>
      </div>

      <!-- Done state -->
      <div v-if="switchStep === 'done'" class="px-6 py-10 flex flex-col items-center text-center">
        <div class="w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-4">
          <Icon name="lucide:check" class="w-8 h-8 text-primary" />
        </div>
        <h3 class="text-lg font-bold mb-1">Migrated!</h3>
        <p class="text-sm text-muted-foreground">
          Your balance is now earning {{ (selectedVault?.apy ?? 0 * 100).toFixed(2) }}% APY in {{ selectedVault?.name }}
        </p>
      </div>

      <!-- Form -->
      <div v-else class="px-5 py-5 space-y-3">
        <!-- Loading -->
        <div v-if="loadingCandidates" class="flex items-center justify-center py-12">
          <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-muted-foreground" />
        </div>

        <!-- Empty -->
        <div v-else-if="!candidateVaults.length" class="text-center py-8">
          <p class="text-sm text-muted-foreground">No alternative vaults found</p>
        </div>

        <!-- Vault list -->
        <div v-else class="space-y-2" data-tour="switch-options">
          <button
            v-for="v in candidateVaults" :key="v.address"
            class="w-full text-left rounded-xl border-2 p-4 transition-all"
            :class="[
              v.isCurrent ? 'border-muted bg-muted/30 cursor-default' : selectedVault?.address === v.address ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80',
            ]"
            :disabled="v.isCurrent || switching"
            @click="!v.isCurrent && (selectedVault = v)"
          >
            <!-- Top row: name/protocol (left) + badge (right) -->
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold truncate">{{ v.name }}</p>
                <p class="text-[11px] text-muted-foreground/70 truncate">{{ v.protocol }}</p>
              </div>
              <span
                v-if="v.isCurrent"
                class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 leading-none"
              >Current</span>
              <span
                v-else-if="v.isRecommended"
                class="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 shrink-0 leading-none"
              >⭐ Recommended</span>
            </div>

            <!-- APY row: label left, value right -->
            <div class="flex items-baseline justify-between mb-2">
              <span class="text-[10px] text-muted-foreground/60 uppercase tracking-wider">APY</span>
              <span class="text-base font-bold text-primary tabular-nums">{{ (v.apy * 100).toFixed(2) }}%</span>
            </div>

            <!-- Meta row -->
            <div class="flex items-center justify-between pt-2 border-t border-border/30 text-[10px] text-muted-foreground/60">
              <span>TVL {{ fmtTvl(v.tvl) }}</span>
              <span class="font-mono">{{ v.address.slice(0, 6) }}…{{ v.address.slice(-4) }}</span>
            </div>
          </button>
        </div>

        <!-- APY diff preview -->
        <div
          v-if="selectedVault && currentVault && !selectedVault.isCurrent"
          class="rounded-xl border p-3"
          :class="apyDiff >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'"
        >
          <div class="flex items-center gap-2 text-xs">
            <Icon
              :name="apyDiff >= 0 ? 'lucide:trending-up' : 'lucide:trending-down'"
              class="w-3.5 h-3.5"
              :class="apyDiff >= 0 ? 'text-emerald-400' : 'text-amber-400'"
            />
            <span :class="apyDiff >= 0 ? 'text-emerald-300' : 'text-amber-300'">
              {{ apyDiff >= 0 ? '+' : '' }}{{ apyDiff.toFixed(2) }}% APY change vs current vault
            </span>
          </div>
          <p class="text-[10px] text-muted-foreground/60 mt-1">
            Migration takes 2 transactions: redeem from {{ currentVault.name }} → deposit to {{ selectedVault.name }}
          </p>
        </div>

        <!-- Progress -->
        <div v-if="switching" class="rounded-xl bg-muted/40 border border-border/40 p-3 space-y-2">
          <div class="flex items-center gap-2 text-xs">
            <Icon
              :name="switchStep === 'redeeming' ? 'lucide:loader-2' : ['depositing','confirming','done'].includes(switchStep) ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-3.5 h-3.5"
              :class="switchStep === 'redeeming' ? 'text-primary animate-spin' : 'text-primary'"
            />
            <span>Redeeming from old vault</span>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <Icon
              :name="switchStep === 'depositing' ? 'lucide:loader-2' : ['confirming','done'].includes(switchStep) ? 'lucide:check-circle-2' : 'lucide:circle'"
              class="w-3.5 h-3.5"
              :class="switchStep === 'depositing' ? 'text-primary animate-spin' : ['confirming','done'].includes(switchStep) ? 'text-primary' : 'text-muted-foreground/40'"
            />
            <span :class="['depositing','confirming','done'].includes(switchStep) ? 'text-foreground' : 'text-muted-foreground/40'">
              Depositing to new vault
            </span>
          </div>
        </div>

        <!-- CTA -->
        <Button
          v-if="!switching && candidateVaults.length"
          class="w-full h-12 text-sm font-bold rounded-2xl"
          :disabled="!selectedVault || selectedVault.isCurrent"
          @click="executeSwitch"
        >
          {{ !selectedVault ? 'Pick a vault' : selectedVault.isCurrent ? 'Already in this vault' : `Switch to ${selectedVault.name}` }}
        </Button>

        <p v-if="switchError" class="text-xs text-destructive text-center">{{ switchError }}</p>
      </div>
    </DialogContent>
  </Dialog>
</template>
