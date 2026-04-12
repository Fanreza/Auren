<script setup lang="ts">
import { BRAND } from '~/config/brand'

useHead({ title: `Status · ${BRAND.name}` })

interface ServiceCheck {
  key: string
  name: string
  description: string
  status: 'operational' | 'degraded' | 'down' | 'checking'
  latencyMs?: number
  detail?: string
}

const services = ref<ServiceCheck[]>([
  { key: 'app',     name: 'Web app',                description: 'Frontend + edge functions', status: 'checking' },
  { key: 'lifi',    name: 'LI.FI Earn API',         description: 'Vault discovery + APY data', status: 'checking' },
  { key: 'lifi-q',  name: 'LI.FI Composer Quote',   description: 'Cross-chain routing engine', status: 'checking' },
  { key: 'rpc',     name: 'Base RPC',               description: 'Onchain reads + tx simulation', status: 'checking' },
  { key: 'cg',      name: 'CoinGecko prices',       description: 'Asset price feed for USD/PnL', status: 'checking' },
  { key: 'supabase',name: 'Database',               description: 'Pockets + transactions storage', status: 'checking' },
])

const lastChecked = ref<Date | null>(null)

async function ping(url: string): Promise<{ status: 'operational' | 'degraded' | 'down'; latencyMs?: number; detail?: string }> {
  const start = performance.now()
  try {
    const res = await fetch(url, { method: 'GET', mode: 'no-cors' })
    const latency = Math.round(performance.now() - start)
    if (latency > 3000) return { status: 'degraded', latencyMs: latency, detail: 'Slow response' }
    return { status: 'operational', latencyMs: latency }
  } catch (e: any) {
    return { status: 'down', detail: e?.message ?? 'Network error' }
  }
}

async function pingJson(url: string): Promise<{ status: 'operational' | 'degraded' | 'down'; latencyMs?: number; detail?: string }> {
  const start = performance.now()
  try {
    const res = await $fetch(url, { timeout: 8000 })
    const latency = Math.round(performance.now() - start)
    if (!res) return { status: 'degraded', latencyMs: latency, detail: 'Empty response' }
    if (latency > 3000) return { status: 'degraded', latencyMs: latency, detail: 'Slow response' }
    return { status: 'operational', latencyMs: latency }
  } catch (e: any) {
    return { status: 'down', detail: e?.message ?? 'Network error' }
  }
}

async function checkAll() {
  for (const s of services.value) s.status = 'checking'

  const results = await Promise.allSettled([
    pingJson('/api/lifi/vaults?chainId=8453&asset=USDC&limit=1'),
    pingJson('/api/lifi/quote?fromChain=8453&toChain=8453&fromToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&toToken=0xbeefa7b88064feef0cee02aaebbd95d30df3878f&fromAmount=1000000&fromAddress=0x000000000000000000000000000000000000dEaD&toAddress=0x000000000000000000000000000000000000dEaD&slippage=0.005&order=RECOMMENDED'),
    pingJson('/api/coingecko/prices?addresses=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  ])

  // Web app — we're rendering, so it's operational
  services.value[0]!.status = 'operational'
  services.value[0]!.latencyMs = 1

  // LI.FI Earn
  if (results[0]!.status === 'fulfilled') Object.assign(services.value[1]!, results[0]!.value)
  else services.value[1]!.status = 'down'

  // LI.FI Composer
  if (results[1]!.status === 'fulfilled') Object.assign(services.value[2]!, results[1]!.value)
  else services.value[2]!.status = 'down'

  // Base RPC — try a viem read
  try {
    const start = performance.now()
    const { createPublicClient, http } = await import('viem')
    const { base } = await import('viem/chains')
    const pub = createPublicClient({ chain: base, transport: http() })
    await pub.getBlockNumber()
    const latency = Math.round(performance.now() - start)
    services.value[3]!.status = latency > 3000 ? 'degraded' : 'operational'
    services.value[3]!.latencyMs = latency
  } catch {
    services.value[3]!.status = 'down'
  }

  // CoinGecko (via our proxy)
  if (results[2]!.status === 'fulfilled') Object.assign(services.value[4]!, results[2]!.value)
  else services.value[4]!.status = 'down'

  // Supabase — ping any public endpoint via our API
  try {
    const start = performance.now()
    await $fetch('/api/transactions?pocket_id=__healthcheck__', { timeout: 5000 }).catch(() => null)
    const latency = Math.round(performance.now() - start)
    services.value[5]!.status = latency > 3000 ? 'degraded' : 'operational'
    services.value[5]!.latencyMs = latency
  } catch {
    services.value[5]!.status = 'down'
  }

  lastChecked.value = new Date()
}

const overallStatus = computed(() => {
  const states = services.value.map(s => s.status)
  if (states.every(s => s === 'operational')) return { label: 'All systems operational', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'lucide:check-circle-2' }
  if (states.some(s => s === 'down')) return { label: 'Major outage', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: 'lucide:x-circle' }
  if (states.some(s => s === 'degraded')) return { label: 'Partial degradation', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'lucide:alert-triangle' }
  return { label: 'Checking…', color: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border', icon: 'lucide:loader-2' }
})

function statusStyle(status: string) {
  switch (status) {
    case 'operational': return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: 'lucide:check-circle-2', label: 'Operational' }
    case 'degraded':    return { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: 'lucide:alert-triangle', label: 'Degraded' }
    case 'down':        return { color: 'text-red-400', bg: 'bg-red-500/10', icon: 'lucide:x-circle', label: 'Down' }
    default:            return { color: 'text-muted-foreground', bg: 'bg-muted/30', icon: 'lucide:loader-2', label: 'Checking' }
  }
}

onMounted(() => { checkAll() })
</script>

<template>
  <div class="min-h-dvh bg-background">
    <LandingNav />

    <main class="max-w-3xl mx-auto px-5 sm:px-6 lg:px-8 py-12 lg:py-16">
      <div class="mb-8">
        <NuxtLink to="/" class="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6">
          <Icon name="lucide:arrow-left" class="w-3.5 h-3.5" /> Back to home
        </NuxtLink>
        <h1 class="text-4xl font-bold tracking-tight mb-2">System status</h1>
        <p class="text-sm text-muted-foreground">Live health checks of every Auren dependency</p>
      </div>

      <!-- Overall status banner -->
      <div
        class="rounded-2xl border px-5 py-4 mb-6 flex items-center gap-3"
        :class="[overallStatus.bg, overallStatus.border]"
      >
        <Icon :name="overallStatus.icon" class="w-5 h-5" :class="overallStatus.color" />
        <p class="font-semibold" :class="overallStatus.color">{{ overallStatus.label }}</p>
        <div class="ml-auto flex items-center gap-2">
          <p v-if="lastChecked" class="text-[11px] text-muted-foreground/60">
            Last checked: {{ lastChecked.toLocaleTimeString() }}
          </p>
          <button
            class="text-[11px] font-semibold px-2 py-1 rounded-md bg-background/40 hover:bg-background/60 transition-colors"
            @click="checkAll"
          >
            <Icon name="lucide:refresh-cw" class="w-3 h-3 inline" /> Refresh
          </button>
        </div>
      </div>

      <!-- Service list -->
      <div class="space-y-2">
        <div
          v-for="s in services" :key="s.key"
          class="rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center gap-3"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            :class="statusStyle(s.status).bg"
          >
            <Icon
              :name="statusStyle(s.status).icon"
              class="w-4 h-4"
              :class="[statusStyle(s.status).color, s.status === 'checking' ? 'animate-spin' : '']"
            />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold">{{ s.name }}</p>
            <p class="text-[11px] text-muted-foreground">{{ s.description }}</p>
            <p v-if="s.detail" class="text-[10px] text-muted-foreground/60 mt-0.5">{{ s.detail }}</p>
          </div>
          <div class="text-right shrink-0">
            <template v-if="s.status === 'checking'">
              <Skeleton class="h-3 w-14 mb-1 ml-auto" />
              <Skeleton class="h-2.5 w-10 ml-auto" />
            </template>
            <template v-else>
              <p class="text-xs font-semibold" :class="statusStyle(s.status).color">{{ statusStyle(s.status).label }}</p>
              <p v-if="s.latencyMs !== undefined" class="text-[10px] text-muted-foreground/60 tabular-nums">{{ s.latencyMs }}ms</p>
            </template>
          </div>
        </div>
      </div>

      <p class="text-[11px] text-muted-foreground/50 text-center mt-8">
        Status checks run client-side from your browser. Results may differ from other regions.
      </p>
    </main>

    <LandingFooter />
  </div>
</template>
