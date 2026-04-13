<script setup lang="ts">
import { encodeFunctionData, parseAbi } from 'viem'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useCurrency } from '~/composables/useCurrency'
import AppVaultLogos from '~/components/app/AppVaultLogos.vue'
import { toast } from 'vue-sonner'
import type { EarnPosition } from '~/composables/useEarnStore'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  position: EarnPosition | null
}>()

const emit = defineEmits<{
  done: []
}>()

const { address, getPublicClient, getWalletClient } = usePrivyAuth()
const { format: fmtCurrency } = useCurrency()

// ── ABIs ────────────────────────────────────────────────────────────────────
const ERC4626_ABI = parseAbi([
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
])
const AAVE_POOL_ABI = parseAbi([
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
])

// Aave V3 Pool on Base
const AAVE_POOL_BASE = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as const

// ── Form state ──────────────────────────────────────────────────────────────
const amountPct = ref<number>(100)  // 1..100
const withdrawing = ref(false)
const withdrawDone = ref(false)
const withdrawError = ref('')

// ── Derived ─────────────────────────────────────────────────────────────────
const sharesToRedeem = computed(() => {
  if (!props.position) return 0n
  const pct = Math.max(1, Math.min(100, amountPct.value))
  if (pct === 100) return props.position.shares
  // bigint scale × percent / 100
  return (props.position.shares * BigInt(Math.round(pct * 100))) / 10000n
})

const usdToReceive = computed(() => {
  if (!props.position) return 0
  return (props.position.usdValue * amountPct.value) / 100
})

const tokensToReceive = computed(() => {
  if (!props.position) return 0
  return (props.position.assetsAmount * amountPct.value) / 100
})

const isAave = computed(() =>
  (props.position?.vault.protocol ?? '').toLowerCase().includes('aave'),
)

// ── Execute ─────────────────────────────────────────────────────────────────
async function executeWithdraw() {
  if (!props.position || !address.value || withdrawing.value) return
  withdrawing.value = true
  withdrawError.value = ''
  withdrawDone.value = false

  try {
    const client = await getWalletClient()
    const pub = getPublicClient()
    const userAddr = address.value
    const vault = props.position.vault

    let txHash: `0x${string}`

    if (isAave.value) {
      // Aave: use Pool.withdraw(asset, amount, to). type(uint256).max = full balance.
      const fullPct = amountPct.value >= 100
      const amount = fullPct
        ? (BigInt(2) ** BigInt(256) - BigInt(1))
        : props.position.assetsRaw * BigInt(Math.round(amountPct.value * 100)) / 10000n

      const data = encodeFunctionData({
        abi: AAVE_POOL_ABI,
        functionName: 'withdraw',
        args: [vault.assetAddress as `0x${string}`, amount, userAddr],
      })
      txHash = await client.sendTransaction({
        to: AAVE_POOL_BASE,
        data,
      })
    } else {
      // ERC-4626: redeem(shares, receiver, owner)
      const data = encodeFunctionData({
        abi: ERC4626_ABI,
        functionName: 'redeem',
        args: [sharesToRedeem.value, userAddr, userAddr],
      })
      txHash = await client.sendTransaction({
        to: vault.address as `0x${string}`,
        data,
      })
    }

    const receipt = await pub.waitForTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'success') {
      withdrawError.value = 'Withdraw transaction reverted'
      return
    }

    withdrawDone.value = true
    toast.success(`Withdrew from ${vault.name}`)
    emit('done')
    setTimeout(() => { open.value = false }, 2000)
  } catch (e: any) {
    console.error('[earn-withdraw] failed:', e)
    withdrawError.value = e?.shortMessage || e?.message || 'Withdraw failed'
    toast.error(withdrawError.value)
  } finally {
    withdrawing.value = false
  }
}

// Reset on close
watch(open, (v) => {
  if (!v) {
    amountPct.value = 100
    withdrawing.value = false
    withdrawDone.value = false
    withdrawError.value = ''
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0 max-h-[90dvh] overflow-y-auto">
      <div class="px-5 pt-5 pb-3 border-b border-border/40">
        <DialogHeader>
          <DialogTitle class="text-base">
            Withdraw from {{ position?.vault.name ?? 'vault' }}
          </DialogTitle>
          <DialogDescription class="text-xs">
            Redeem your vault shares back into {{ position?.vault.assetSymbol ?? 'underlying' }}. Gas paid in USDC.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div v-if="position" class="px-5 py-5 space-y-4">
        <!-- Vault summary -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4 flex items-center gap-3">
          <AppVaultLogos
            :asset-address="position.vault.assetAddress"
            :asset-symbol="position.vault.assetSymbol"
            :protocol="position.vault.protocol"
            size="md"
          />
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm truncate">{{ position.vault.name }}</p>
            <p class="text-[11px] text-muted-foreground/70 truncate">
              {{ position.vault.protocol }} · {{ position.vault.assetSymbol }}
            </p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-sm font-bold tabular-nums">{{ fmtCurrency(position.usdValue) }}</p>
            <p class="text-[10px] text-muted-foreground/60">
              {{ position.assetsAmount.toLocaleString('en-US', { maximumFractionDigits: 6 }) }} {{ position.vault.assetSymbol }}
            </p>
          </div>
        </div>

        <!-- Amount picker -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4 space-y-3">
          <div class="flex items-center justify-between">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Withdraw amount</p>
            <p class="text-xs text-muted-foreground tabular-nums">{{ amountPct }}%</p>
          </div>
          <input
            v-model.number="amountPct"
            type="range"
            min="1"
            max="100"
            step="1"
            class="w-full accent-primary"
          />
          <div class="grid grid-cols-4 gap-1.5">
            <Button
              v-for="pct in [25, 50, 75, 100]" :key="pct"
              :variant="amountPct === pct ? 'default' : 'outline'"
              size="sm"
              class="h-8 text-xs"
              @click="amountPct = pct"
            >{{ pct === 100 ? 'MAX' : `${pct}%` }}</Button>
          </div>
          <div class="pt-2 border-t border-border/40 flex items-baseline justify-between">
            <span class="text-xs text-muted-foreground">You receive</span>
            <div class="text-right">
              <p class="text-base font-bold tabular-nums">
                {{ tokensToReceive.toLocaleString('en-US', { maximumFractionDigits: 6 }) }} {{ position.vault.assetSymbol }}
              </p>
              <p class="text-[10px] text-muted-foreground/60">≈ {{ fmtCurrency(usdToReceive) }}</p>
            </div>
          </div>
        </div>

        <p v-if="withdrawError" class="text-xs text-destructive text-center">{{ withdrawError }}</p>

        <Button
          class="w-full h-12 text-sm font-bold uppercase tracking-wider rounded-2xl"
          :disabled="withdrawing || !sharesToRedeem"
          @click="executeWithdraw"
        >
          <Icon v-if="withdrawing" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          <Icon v-else-if="withdrawDone" name="lucide:check-circle-2" class="w-4 h-4 mr-2" />
          {{ withdrawing ? 'Withdrawing…' : withdrawDone ? 'Done' : `Withdraw to ${position.vault.assetSymbol}` }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
