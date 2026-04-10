<script setup lang="ts">
import { formatUnits } from 'viem'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import type { TxState } from '~/composables/useVault'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  pocket: DbPocket | null
  position: { shares: bigint; value: bigint }
  assetPrice: number
  txState: TxState
  txHash: string | null
  txError: string
  loading?: boolean
}>()

const emit = defineEmits<{
  confirm: [toStrategy: StrategyKey]
  reset: []
}>()

const selectedStrategy = ref<StrategyKey | null>(null)

const currentStrategy = computed(() =>
  props.pocket ? STRATEGIES[props.pocket.strategy_key as StrategyKey] : null,
)

const targetStrategy = computed(() =>
  selectedStrategy.value ? STRATEGIES[selectedStrategy.value] : null,
)

const otherStrategies = computed(() =>
  STRATEGY_LIST.filter(s => s.key !== props.pocket?.strategy_key),
)

const currentValueFormatted = computed(() => {
  if (!currentStrategy.value || props.position.value === 0n) return '$0.00'
  const assetVal = parseFloat(formatUnits(props.position.value, currentStrategy.value.decimals))
  const usd = assetVal * props.assetPrice
  return '$' + usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
})

const isProcessing = computed(() =>
  ['preparing', 'approving', 'awaiting_signature', 'pending'].includes(props.txState),
)

const isDone = computed(() => props.txState === 'confirmed')
const isFailed = computed(() => props.txState === 'failed')

const RISK_COLORS: Record<string, string> = {
  conservative: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  balanced: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  aggressive: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
}

const stepLabel = computed(() => {
  switch (props.txState) {
    case 'preparing': return 'Preparing transaction...'
    case 'approving': return 'Approving tokens...'
    case 'awaiting_signature': return 'Confirm in your wallet...'
    case 'pending': return 'Processing on-chain...'
    case 'confirmed': return 'Vault switched!'
    case 'failed': return 'Switch failed'
    default: return ''
  }
})

function handleConfirm() {
  if (!selectedStrategy.value) return
  emit('confirm', selectedStrategy.value)
}

function handleClose() {
  open.value = false
  selectedStrategy.value = null
  emit('reset')
}

const { showSwitchVaultTour } = useTour()
watch(open, (v) => {
  if (v) showSwitchVaultTour()
  if (!v) {
    selectedStrategy.value = null
    emit('reset')
  }
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>Switch Vault</DialogTitle>
        <DialogDescription>
          Move all funds from {{ currentStrategy?.label }} to a different vault.
        </DialogDescription>
      </DialogHeader>

      <!-- Current position -->
      <div v-if="currentStrategy" class="rounded-lg border p-3 mb-1" data-tour="switch-current">
        <p class="text-xs text-muted-foreground mb-1">Current vault</p>
        <div class="flex items-center gap-2">
          <Icon :name="currentStrategy.icon" class="w-4 h-4" :class="RISK_COLORS[currentStrategy.key]?.split(' ')[1]" />
          <span class="font-medium text-sm">{{ currentStrategy.label }}</span>
          <span class="text-xs text-muted-foreground">{{ currentStrategy.vaultSymbol }}</span>
          <span class="ml-auto font-semibold text-sm">{{ currentValueFormatted }}</span>
        </div>
      </div>

      <!-- Processing state -->
      <div v-if="isProcessing || isDone || isFailed" class="py-6 text-center space-y-3">
        <Icon
          v-if="isProcessing"
          name="lucide:loader-2"
          class="w-8 h-8 mx-auto animate-spin text-primary"
        />
        <Icon
          v-else-if="isDone"
          name="lucide:check-circle-2"
          class="w-8 h-8 mx-auto text-primary"
        />
        <Icon
          v-else
          name="lucide:x-circle"
          class="w-8 h-8 mx-auto text-destructive"
        />
        <p class="font-medium">{{ stepLabel }}</p>
        <p v-if="txError && isFailed" class="text-xs text-destructive">{{ txError }}</p>
        <Button v-if="isDone || isFailed" class="mt-2" @click="handleClose">
          {{ isDone ? 'Done' : 'Close' }}
        </Button>
      </div>

      <!-- Strategy picker -->
      <template v-else>
        <p class="text-xs text-muted-foreground mt-2 mb-2">Switch to</p>
        <div class="space-y-2" data-tour="switch-options">
          <button
            v-for="s in otherStrategies"
            :key="s.key"
            class="w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
            :class="selectedStrategy === s.key ? 'border-primary bg-primary/5' : 'border-border'"
            @click="selectedStrategy = s.key"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-lg flex items-center justify-center"
                :class="RISK_COLORS[s.key]?.split(' ').slice(0, 1).join(' ')"
              >
                <Icon :name="s.icon" class="w-4 h-4" :class="RISK_COLORS[s.key]?.split(' ')[1]" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm">{{ s.label }}</p>
                <p class="text-xs text-muted-foreground">{{ s.subtitle }}</p>
              </div>
              <div
                v-if="selectedStrategy === s.key"
                class="w-5 h-5 rounded-full bg-primary flex items-center justify-center"
              >
                <Icon name="lucide:check" class="w-3 h-3 text-primary-foreground" />
              </div>
            </div>
          </button>
        </div>

        <!-- Warning -->
        <div v-if="selectedStrategy && position.shares > 0n" class="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 mt-3">
          <div class="flex gap-2">
            <Icon name="lucide:alert-triangle" class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div class="text-xs text-amber-200/80">
              <p class="font-medium text-amber-400 mb-1">This will:</p>
              <ol class="list-decimal list-inside space-y-0.5">
                <li>Swap your {{ currentStrategy?.vaultSymbol }} shares into {{ targetStrategy?.vaultSymbol }}</li>
              </ol>
              <p class="mt-1.5 text-amber-300/60">
                Requires 1 approval + 1 swap transaction. Slippage may apply.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter class="mt-4">
          <Button variant="outline" :disabled="loading" @click="open = false">Cancel</Button>
          <Button
            :disabled="!selectedStrategy || loading"
            @click="handleConfirm"
          >
            <Icon v-if="loading" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
            <Icon v-else name="lucide:repeat-2" class="w-4 h-4 mr-1.5" />
            {{ loading ? 'Switching...' : 'Switch Vault' }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
