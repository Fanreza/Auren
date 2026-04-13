<script setup lang="ts">
import { parseUnits, formatUnits } from 'viem'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { useVault } from '~/composables/useVault'
import { useLifi, type LifiQuote } from '~/composables/useLifi'
import { usePrivyAuth } from '~/composables/usePrivy'
import { useWalletTokens } from '~/composables/useWalletTokens'
import { useCoinGecko } from '~/composables/useCoinGecko'
import AppTokenChainPicker, { type PickedToken } from '~/components/app/AppTokenChainPicker.vue'
import AppVaultLogos from '~/components/app/AppVaultLogos.vue'
import AppTxPreview from '~/components/app/AppTxPreview.vue'
import { toast } from 'vue-sonner'
import type { EarnVault } from '~/composables/useEarnStore'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  vault: EarnVault | null
}>()

const emit = defineEmits<{
  done: []
}>()

const { address } = usePrivyAuth()
const { txState, txError, lifiDeposit, reset } = useVault()
const { getDepositQuote } = useLifi()
const { getTokenPrices } = useCoinGecko()
const { walletTokens, fetchWalletTokens } = useWalletTokens(address, null, getTokenPrices)

// ── Form state ──────────────────────────────────────────────────────────────
const fromToken = ref<PickedToken | null>(null)
const amount = ref('')
const showPicker = ref(false)
const quote = ref<LifiQuote | null>(null)
const quotesLoading = ref(false)
let quoteTimer: ReturnType<typeof setTimeout> | null = null

const fromBalance = computed(() => fromToken.value?.balance ?? null)
const amountUsd = computed(() => {
  if (!amount.value || !fromToken.value?.priceUSD) return null
  const v = parseFloat(amount.value) * fromToken.value.priceUSD
  return v > 0 ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : null
})

const amountError = computed(() => {
  if (!amount.value) return null
  const val = parseFloat(amount.value)
  if (isNaN(val) || val <= 0) return 'Enter a valid amount'
  const bal = parseFloat(fromBalance.value ?? '0')
  if (fromBalance.value && val > bal) return 'Insufficient balance'
  return null
})

const canDeposit = computed(() =>
  !!fromToken.value && !!amount.value && !amountError.value &&
  parseFloat(amount.value) > 0 && !!props.vault,
)

function setMax() {
  if (fromBalance.value) amount.value = fromBalance.value
}

function handleTokenSelected(t: PickedToken) {
  fromToken.value = t
  quote.value = null
}

// Re-quote when amount or token changes (debounced)
watch([amount, fromToken], () => {
  quote.value = null
  if (quoteTimer) clearTimeout(quoteTimer)
  if (!amount.value || !fromToken.value || !props.vault || !address.value) return
  if (parseFloat(amount.value) <= 0 || amountError.value) return
  quoteTimer = setTimeout(fetchQuote, 700)
})

async function fetchQuote() {
  if (!props.vault || !fromToken.value || !amount.value || !address.value) return
  try {
    quotesLoading.value = true
    const dec = fromToken.value.decimals
    const amtStr = String(amount.value)
    const pts = amtStr.split('.')
    const truncated = pts[1] ? `${pts[0]}.${pts[1].slice(0, dec)}` : pts[0]
    const wei = parseUnits(truncated, dec).toString()
    const q = await getDepositQuote({
      fromChain: fromToken.value.chainId,
      fromToken: fromToken.value.address,
      fromAmount: wei,
      fromAddress: address.value,
      toChain: props.vault.chainId,
      vaultAddress: props.vault.address,
    })
    quote.value = q
  } catch (e) {
    console.warn('[earn-deposit] quote failed:', e)
    quote.value = null
  } finally {
    quotesLoading.value = false
  }
}

// ── Execute ─────────────────────────────────────────────────────────────────
const depositing = ref(false)
const depositDone = ref(false)

async function executeDeposit() {
  if (!canDeposit.value || !fromToken.value || !props.vault) return
  depositing.value = true
  depositDone.value = false
  try {
    reset()
    const dec = fromToken.value.decimals
    const amtStr = String(amount.value)
    const pts = amtStr.split('.')
    const truncated = pts[1] ? `${pts[0]}.${pts[1].slice(0, dec)}` : pts[0]
    const wei = parseUnits(truncated, dec).toString()

    await lifiDeposit({
      fromChain: fromToken.value.chainId,
      fromToken: fromToken.value.address,
      fromAmount: wei,
      vaultAddress: props.vault.address,
      vaultChainId: props.vault.chainId,
      vaultAssetAddress: props.vault.assetAddress,
      vaultProtocol: props.vault.protocol,
      quote: quote.value ?? undefined,
    })

    if (txState.value === 'failed') {
      toast.error(txError.value || 'Deposit failed')
      return
    }

    depositDone.value = true
    toast.success(`Deposited into ${props.vault.name}`)
    emit('done')
    setTimeout(() => { open.value = false }, 2200)
  } catch (e: any) {
    console.error('[earn-deposit] failed:', e)
    toast.error(e?.shortMessage || e?.message || 'Deposit failed')
  } finally {
    depositing.value = false
  }
}

// Reset on close
watch(open, (v) => {
  if (v) {
    if (address.value) fetchWalletTokens()
  } else {
    fromToken.value = null
    amount.value = ''
    quote.value = null
    depositing.value = false
    depositDone.value = false
    reset()
  }
})

const ctaLabel = computed(() => {
  if (depositing.value) return 'Depositing…'
  if (depositDone.value) return 'Done'
  if (!fromToken.value) return 'Select a token'
  if (!amount.value || parseFloat(amount.value) <= 0) return 'Enter amount'
  if (amountError.value) return amountError.value
  return `Deposit into ${props.vault?.name ?? 'vault'}`
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0 max-h-[90dvh] overflow-y-auto">
      <div class="px-5 pt-5 pb-3 border-b border-border/40">
        <DialogHeader>
          <DialogTitle class="text-base">
            Deposit to {{ vault?.name ?? 'vault' }}
          </DialogTitle>
          <DialogDescription class="text-xs">
            Direct vault deposit. No pocket, no goal — just yield. Routed via LI.FI Composer.
          </DialogDescription>
        </DialogHeader>
      </div>

      <div v-if="vault" class="px-5 py-5 space-y-3">
        <!-- Vault summary card -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4 flex items-center gap-3">
          <AppVaultLogos
            :asset-address="vault.assetAddress"
            :asset-symbol="vault.assetSymbol"
            :protocol="vault.protocol"
            size="md"
          />
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm truncate">{{ vault.name }}</p>
            <p class="text-[11px] text-muted-foreground/70">
              {{ vault.protocol }} · {{ vault.assetSymbol }}
            </p>
          </div>
          <div class="text-right shrink-0">
            <p class="text-lg font-bold text-primary">{{ (vault.apy * 100).toFixed(2) }}%</p>
            <p class="text-[10px] text-muted-foreground/60">APY</p>
          </div>
        </div>

        <!-- FROM card -->
        <div class="rounded-2xl bg-muted/40 border border-border/40 p-4">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">You deposit</p>
            <span v-if="fromBalance" class="text-[11px] text-muted-foreground">
              Bal: {{ parseFloat(fromBalance).toLocaleString('en-US', { maximumFractionDigits: 4 }) }}
              <button class="text-primary font-semibold ml-1" @click="setMax">MAX</button>
            </span>
          </div>
          <div class="flex items-end gap-3">
            <div class="flex-1 min-w-0">
              <input
                v-model="amount"
                type="number"
                inputmode="decimal"
                placeholder="0"
                class="w-full bg-transparent text-3xl font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <p class="text-xs text-muted-foreground/60 mt-0.5">{{ amountUsd ?? '$0.00' }}</p>
            </div>
            <button
              class="flex items-center gap-2 rounded-xl px-3 py-2 border transition-colors shrink-0"
              :class="fromToken ? 'bg-background/60 border-border/60 hover:border-primary/40' : 'bg-primary/10 border-primary/30 hover:bg-primary/15'"
              @click="showPicker = true"
            >
              <template v-if="fromToken">
                <img v-if="fromToken.logoURI" :src="fromToken.logoURI" class="w-6 h-6 rounded-full" @error="($event.target as HTMLImageElement).style.display='none'" />
                <span class="font-bold text-sm">{{ fromToken.symbol }}</span>
              </template>
              <template v-else>
                <Icon name="lucide:coins" class="w-4 h-4 text-primary" />
                <span class="font-semibold text-sm text-primary">Select</span>
              </template>
              <Icon name="lucide:chevron-down" class="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <p v-if="amountError" class="text-xs text-destructive mt-1.5">{{ amountError }}</p>
        </div>

        <!-- LI.FI quote preview -->
        <AppTxPreview
          v-if="quotesLoading || quote"
          :quote="quote"
          :loading="quotesLoading"
          title="Deposit Preview"
          :subtitle="`${fromToken?.symbol ?? ''} → ${vault.assetSymbol} vault`"
        />

        <!-- CTA -->
        <Button
          class="w-full h-12 text-sm font-bold uppercase tracking-wider rounded-2xl"
          :disabled="!canDeposit || depositing"
          @click="executeDeposit"
        >
          <Icon v-if="depositing" name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          {{ ctaLabel }}
        </Button>
      </div>

      <AppTokenChainPicker
        v-model:open="showPicker"
        :wallet-tokens="walletTokens"
        :user-address="address"
        @select="handleTokenSelected"
      />
    </DialogContent>
  </Dialog>
</template>
