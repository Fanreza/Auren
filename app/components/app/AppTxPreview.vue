<script setup lang="ts">
import { formatUnits } from 'viem'
import type { LifiQuote } from '~/composables/useLifi'

export interface ManualStep {
  label: string                  // e.g. "Approve USDC"
  detail?: string                // optional secondary line
  via?: string                   // optional protocol/tool name
}

export interface ManualPreview {
  fromChainId: number
  fromChainName: string
  fromTokenSymbol: string
  fromTokenLogo?: string
  fromAmount: string             // human decimal (e.g. "0.1")
  fromAmountUsd?: number
  toChainId: number
  toChainName: string
  toTokenSymbol: string
  toTokenLogo?: string
  toAmount: string               // human decimal estimate
  toAmountUsd?: number
  steps: ManualStep[]
  estTimeSeconds?: number
  feesUsd?: number               // total fees in USD
}

const props = defineProps<{
  /** LI.FI quote object — if provided, takes precedence over manual */
  quote?: LifiQuote | null
  /** Manual preview — for non-LI.FI flows (direct deposits, Aave supply, etc.) */
  manual?: ManualPreview | null
  /** Header text */
  title?: string
  /** Header subtitle (e.g. "USDC on Base · 4.7% APY") */
  subtitle?: string
  loading?: boolean
}>()

// ── Chain metadata helpers ───────────────────────────────────────────────────
const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  8453: 'Base',
  42161: 'Arbitrum',
  10: 'Optimism',
  137: 'Polygon',
  56: 'BNB',
  43114: 'Avalanche',
}

function chainName(id: number): string {
  return CHAIN_NAMES[id] ?? `Chain ${id}`
}

// ── LI.FI quote derivations ──────────────────────────────────────────────────
const isLifi = computed(() => !!props.quote)

const fromInfo = computed(() => {
  if (props.quote) {
    const a = props.quote.action
    const fromTok = a.fromToken
    const amount = formatUnits(BigInt(a.fromAmount), fromTok.decimals)
    return {
      chainId: a.fromChainId,
      chainName: chainName(a.fromChainId),
      symbol: fromTok.symbol,
      logo: fromTok.logoURI,
      amount,
      amountUsd: parseFloat(props.quote.estimate.fromAmountUSD ?? '0') || undefined,
    }
  }
  if (props.manual) {
    return {
      chainId: props.manual.fromChainId,
      chainName: props.manual.fromChainName,
      symbol: props.manual.fromTokenSymbol,
      logo: props.manual.fromTokenLogo,
      amount: props.manual.fromAmount,
      amountUsd: props.manual.fromAmountUsd,
    }
  }
  return null
})

const toInfo = computed(() => {
  if (props.quote) {
    const a = props.quote.action
    const toTok = a.toToken
    const amount = formatUnits(BigInt(props.quote.estimate.toAmount), toTok.decimals)
    return {
      chainId: a.toChainId,
      chainName: chainName(a.toChainId),
      symbol: toTok.symbol,
      logo: toTok.logoURI,
      amount,
      amountUsd: parseFloat(props.quote.estimate.toAmountUSD ?? '0') || undefined,
    }
  }
  if (props.manual) {
    return {
      chainId: props.manual.toChainId,
      chainName: props.manual.toChainName,
      symbol: props.manual.toTokenSymbol,
      logo: props.manual.toTokenLogo,
      amount: props.manual.toAmount,
      amountUsd: props.manual.toAmountUsd,
    }
  }
  return null
})

const isCrossChain = computed(() =>
  fromInfo.value && toInfo.value && fromInfo.value.chainId !== toInfo.value.chainId,
)

// ── Route steps ──────────────────────────────────────────────────────────────
interface RouteStep {
  label: string
  via: string
}

const routeSteps = computed<RouteStep[]>(() => {
  if (props.quote) {
    // Walk LI.FI steps[] / includedSteps for route breakdown
    const steps = (props.quote as any).includedSteps ?? props.quote.steps ?? []
    if (!Array.isArray(steps) || !steps.length) {
      // Single-tool quote: use top-level tool
      return [{
        label: prettyType(props.quote.type ?? 'swap'),
        via: props.quote.toolDetails?.name ?? props.quote.tool ?? '—',
      }]
    }
    return steps.map((s: any) => ({
      label: prettyType(s.type ?? s.action?.type ?? 'swap'),
      via: s.toolDetails?.name ?? s.tool ?? '—',
    }))
  }
  if (props.manual) {
    return props.manual.steps.map(s => ({
      label: s.label,
      via: s.via ?? s.detail ?? '—',
    }))
  }
  return []
})

function prettyType(t: string): string {
  if (t === 'cross') return 'Bridge'
  if (t === 'swap') return 'Swap'
  if (t === 'protocol') return 'Protocol'
  if (t === 'lifi') return 'Route'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

// ── Fees + time ──────────────────────────────────────────────────────────────
const feesUsd = computed(() => {
  if (props.quote) {
    const gas = (props.quote.estimate.gasCosts ?? []).reduce(
      (sum, g) => sum + (parseFloat(g.amountUSD ?? '0') || 0),
      0,
    )
    const fee = (props.quote.estimate.feeCosts ?? []).reduce(
      (sum, f) => sum + (parseFloat(f.amountUSD ?? '0') || 0),
      0,
    )
    return gas + fee
  }
  return props.manual?.feesUsd ?? 0
})

const estSeconds = computed(() => {
  if (props.quote) return props.quote.estimate.executionDuration ?? 0
  return props.manual?.estTimeSeconds ?? 0
})

function fmtTime(s: number): string {
  if (s < 60) return `~${s}s`
  if (s < 3600) return `~${Math.round(s / 60)}m`
  return `~${Math.round(s / 3600)}h`
}

function fmtUsd(n: number): string {
  if (n === 0) return '—'
  if (n < 0.01) return '<$0.01'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function fmtAmount(n: string, max = 6): string {
  const num = parseFloat(n)
  if (isNaN(num)) return n
  if (num === 0) return '0'
  if (num < 0.000001) return num.toExponential(2)
  return num.toLocaleString('en-US', { maximumFractionDigits: max })
}
</script>

<template>
  <div class="rounded-2xl border border-border/60 bg-muted/20 overflow-hidden">
    <!-- Header -->
    <div v-if="title || subtitle" class="px-4 pt-3 pb-2 border-b border-border/40">
      <p v-if="title" class="text-sm font-semibold">{{ title }}</p>
      <p v-if="subtitle" class="text-[11px] text-muted-foreground">{{ subtitle }}</p>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="p-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" />
      Finding best route...
    </div>

    <!-- Empty state -->
    <div v-else-if="!fromInfo || !toInfo" class="p-6 text-center text-xs text-muted-foreground">
      Enter an amount to preview the route
    </div>

    <!-- Route preview -->
    <div v-else class="p-3 space-y-2">
      <!-- FROM -->
      <div class="rounded-xl bg-background/40 border border-border/40 p-3">
        <p class="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">From</p>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <img v-if="fromInfo.logo" :src="fromInfo.logo" class="w-6 h-6 rounded-full shrink-0" @error="($event.target as HTMLImageElement).style.display='none'" />
            <div class="min-w-0">
              <p class="text-sm font-bold truncate">{{ fromInfo.symbol }}</p>
              <p class="text-[10px] text-muted-foreground/60">{{ fromInfo.chainName }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-bold tabular-nums">{{ fmtAmount(fromInfo.amount) }}</p>
            <p v-if="fromInfo.amountUsd" class="text-[10px] text-muted-foreground/60">{{ fmtUsd(fromInfo.amountUsd) }}</p>
          </div>
        </div>
      </div>

      <!-- Arrow -->
      <div class="flex justify-center -my-1 relative z-10">
        <div class="w-7 h-7 rounded-lg border border-border bg-background flex items-center justify-center">
          <Icon name="lucide:arrow-down" class="w-3 h-3 text-muted-foreground" />
        </div>
      </div>

      <!-- TO -->
      <div class="rounded-xl bg-background/40 border border-border/40 p-3">
        <p class="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1.5">To</p>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <img v-if="toInfo.logo" :src="toInfo.logo" class="w-6 h-6 rounded-full shrink-0" @error="($event.target as HTMLImageElement).style.display='none'" />
            <div class="min-w-0">
              <p class="text-sm font-bold truncate">{{ toInfo.symbol }}</p>
              <p class="text-[10px] text-muted-foreground/60">{{ toInfo.chainName }}</p>
            </div>
          </div>
          <div class="text-right">
            <p class="text-sm font-bold tabular-nums text-primary">~{{ fmtAmount(toInfo.amount) }}</p>
            <p v-if="toInfo.amountUsd" class="text-[10px] text-muted-foreground/60">{{ fmtUsd(toInfo.amountUsd) }}</p>
          </div>
        </div>
      </div>

      <!-- Cross-chain notice -->
      <div v-if="isCrossChain" class="flex items-center gap-1.5 text-[11px] text-amber-400 px-1 pt-1">
        <Icon name="lucide:zap" class="w-3 h-3" />
        Cross-chain — bridges automatically
      </div>

      <!-- Route breakdown -->
      <div v-if="routeSteps.length" class="rounded-xl bg-background/40 border border-border/40 p-3 mt-2">
        <p class="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider mb-2">Route</p>
        <ol class="space-y-1.5">
          <li
            v-for="(step, i) in routeSteps" :key="i"
            class="flex items-center gap-2 text-[11px]"
          >
            <span class="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">{{ i + 1 }}</span>
            <span class="font-semibold">{{ step.label }}</span>
            <span class="text-muted-foreground/60">via {{ step.via }}</span>
          </li>
        </ol>

        <!-- Summary -->
        <div class="mt-3 pt-3 border-t border-border/30 space-y-1 text-[11px]">
          <div v-if="toInfo.amountUsd !== undefined" class="flex items-center justify-between">
            <span class="text-muted-foreground">You receive</span>
            <span class="font-semibold text-primary tabular-nums">~{{ fmtAmount(toInfo.amount) }} {{ toInfo.symbol }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-muted-foreground">Fees</span>
            <span class="tabular-nums">{{ fmtUsd(feesUsd) }}</span>
          </div>
          <div v-if="estSeconds > 0" class="flex items-center justify-between">
            <span class="text-muted-foreground">Est. time</span>
            <span class="tabular-nums">{{ fmtTime(estSeconds) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
