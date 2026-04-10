<script setup lang="ts">
import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'
import { computeNextDue } from '~/composables/useDepositReminders'

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  pocket: DbPocket | null
  assetPrice: number
  saving?: boolean
}>()

const emit = defineEmits<{
  save: [payload: { recurring_day: number; recurring_amount: string; recurring_next_due: string }]
  remove: []
}>()

const selectedDay = ref<number | null>(null)
const rawInput = ref('')
const inputMode = ref<'asset' | 'usd'>('asset')

const strategy = computed(() =>
  props.pocket ? STRATEGIES[props.pocket.strategy_key as StrategyKey] : null,
)

const hasExisting = computed(() => props.pocket?.recurring_day != null)

// Parse the raw input to a number
const parsedInput = computed(() => {
  const cleaned = rawInput.value.replace(/,/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) || num <= 0 ? 0 : num
})

// The actual asset amount (what gets saved)
const assetAmount = computed(() => {
  if (parsedInput.value === 0) return 0
  if (inputMode.value === 'usd') {
    return props.assetPrice > 0 ? parsedInput.value / props.assetPrice : 0
  }
  return parsedInput.value
})

// The equivalent in the other unit (shown below input)
const convertedDisplay = computed(() => {
  if (parsedInput.value === 0) return ''
  if (inputMode.value === 'usd') {
    if (assetAmount.value === 0) return ''
    return `${formatNum(assetAmount.value)} ${strategy.value?.assetSymbol ?? ''}`
  }
  const usd = parsedInput.value * props.assetPrice
  return `$${formatNum(usd)}`
})

const canSave = computed(() => selectedDay.value !== null && assetAmount.value > 0)

const dayLabel = computed(() => {
  if (selectedDay.value === null) return ''
  if (selectedDay.value === 0) return 'end of month'
  const d = selectedDay.value
  const suffix = d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th'
  return `${d}${suffix}`
})

const previewText = computed(() => {
  if (!canSave.value) return ''
  const amt = formatNum(assetAmount.value)
  return `Reminder to deposit ${amt} ${strategy.value?.assetSymbol ?? ''} every ${dayLabel.value}`
})

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)
const EXTRA_DAYS = [29, 30, 31]

function formatNum(n: number): string {
  if (n === 0) return '0'
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
  return n.toPrecision(4)
}

function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  // Allow digits, dots, and commas
  const cleaned = target.value.replace(/[^0-9.,]/g, '')
  rawInput.value = cleaned
}

function toggleMode() {
  // Convert current value to the other mode
  if (parsedInput.value > 0) {
    if (inputMode.value === 'asset') {
      // Switching to USD
      const usd = parsedInput.value * props.assetPrice
      rawInput.value = usd >= 1 ? Math.round(usd).toLocaleString('en-US') : usd.toPrecision(4)
    } else {
      // Switching to asset
      const asset = assetAmount.value
      rawInput.value = asset >= 1 ? asset.toLocaleString('en-US', { maximumFractionDigits: 6 }) : asset.toPrecision(4)
    }
  }
  inputMode.value = inputMode.value === 'asset' ? 'usd' : 'asset'
}

const { showReminderTour } = useTour()
watch(open, (v) => {
  if (v) showReminderTour()
  if (v && props.pocket) {
    inputMode.value = 'asset'
    if (props.pocket.recurring_day != null) {
      selectedDay.value = props.pocket.recurring_day
      rawInput.value = props.pocket.recurring_amount ?? ''
    } else {
      selectedDay.value = null
      rawInput.value = ''
    }
  }
})

function handleSave() {
  if (!canSave.value || selectedDay.value === null) return
  const nextDue = computeNextDue(selectedDay.value, new Date())
  emit('save', {
    recurring_day: selectedDay.value,
    recurring_amount: String(assetAmount.value),
    recurring_next_due: nextDue,
  })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Deposit Reminder</DialogTitle>
        <DialogDescription>
          Set a monthly reminder to deposit into
          <span v-if="pocket" class="font-medium text-foreground">{{ pocket.name }}</span>.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <!-- Amount -->
        <div data-tour="reminder-amount">
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-sm font-medium">Amount per deposit</label>
            <button
              class="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              @click="toggleMode"
            >
              <Icon name="lucide:arrow-left-right" class="w-3 h-3" />
              {{ inputMode === 'asset' ? 'Enter in USD' : `Enter in ${strategy?.assetSymbol}` }}
            </button>
          </div>
          <div class="relative">
            <span
              v-if="inputMode === 'usd'"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground font-medium"
            >$</span>
            <input
              :value="rawInput"
              type="text"
              inputmode="decimal"
              :placeholder="inputMode === 'usd'
                ? (strategy?.assetSymbol === 'USDC' ? '50' : '100')
                : (strategy?.assetSymbol === 'USDC' ? '50' : strategy?.assetSymbol === 'cbBTC' ? '0.001' : '0.05')"
              class="h-12 w-full rounded-md border border-input bg-background px-3 text-base font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              :class="inputMode === 'usd' ? 'pl-8 pr-16' : 'pr-16'"
              @input="onInput"
            >
            <span
              v-if="strategy"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium"
            >
              {{ inputMode === 'usd' ? 'USD' : strategy.assetSymbol }}
            </span>
          </div>
          <p v-if="convertedDisplay" class="text-[11px] text-muted-foreground mt-1 font-mono">
            {{ convertedDisplay }}
          </p>
        </div>

        <!-- Day picker -->
        <div data-tour="reminder-day">
          <label class="text-sm font-medium mb-1.5 block">Day of month</label>
          <div class="grid grid-cols-7 gap-1.5">
            <button
              v-for="d in DAYS"
              :key="d"
              class="h-9 rounded-md text-xs font-medium border transition-all"
              :class="selectedDay === d
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/30 text-muted-foreground'"
              @click="selectedDay = d"
            >
              {{ d }}
            </button>
          </div>
          <div class="grid grid-cols-4 gap-1.5 mt-1.5">
            <button
              v-for="d in EXTRA_DAYS"
              :key="d"
              class="h-9 rounded-md text-xs font-medium border transition-all"
              :class="selectedDay === d
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/30 text-muted-foreground'"
              @click="selectedDay = d"
            >
              {{ d }}
            </button>
            <button
              class="h-9 rounded-md text-xs font-medium border transition-all"
              :class="selectedDay === 0
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/30 text-muted-foreground'"
              @click="selectedDay = 0"
            >
              End
            </button>
          </div>
        </div>

        <!-- Preview -->
        <div v-if="previewText" class="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <div class="flex items-start gap-2">
            <Icon name="lucide:bell" class="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p class="text-xs text-primary leading-relaxed">{{ previewText }}</p>
          </div>
        </div>

        <!-- Info -->
        <div class="rounded-lg bg-muted/50 border p-3">
          <div class="flex items-start gap-2">
            <Icon name="lucide:info" class="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <p class="text-xs text-muted-foreground leading-relaxed">
              You'll see a reminder 7 days before and 1 day before the due date. Deposits still require your wallet approval.
            </p>
          </div>
        </div>
      </div>

      <DialogFooter class="flex gap-2">
        <Button
          v-if="hasExisting"
          variant="destructive"
          size="sm"
          :disabled="saving"
          @click="emit('remove')"
        >
          <Icon name="lucide:trash-2" class="w-4 h-4 mr-1" />
          Remove
        </Button>
        <div class="flex-1" />
        <Button variant="outline" :disabled="saving" @click="open = false">Cancel</Button>
        <Button :disabled="!canSave || saving" @click="handleSave">
          <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
          <Icon v-else name="lucide:bell" class="w-4 h-4 mr-1.5" />
          {{ saving ? 'Saving...' : (hasExisting ? 'Update' : 'Set Reminder') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
