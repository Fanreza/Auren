<script setup lang="ts">
import type { WalletToken } from '~/composables/useWalletTokens'

export interface PickedToken {
  address: string
  symbol: string
  name?: string
  decimals: number
  logoURI?: string
  chainId: number
  chainName: string
  chainLogoURI?: string
  balance?: string
  priceUSD?: number
}

const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  walletTokens?: WalletToken[]   // Base chain tokens with balance (optional)
  userAddress?: string
  lockedChainId?: number          // If set, lock picker to this chain and hide the chain sidebar
  source?: 'wallet' | 'list'      // 'wallet' = user balances (default), 'list' = full token list (no balance)
}>()

const emit = defineEmits<{
  select: [token: PickedToken]
}>()

// ── Chain state ───────────────────────────────────────────────────────────────
interface LifiChain {
  id: number
  name: string
  logoURI?: string
  nativeToken?: { symbol: string }
}

const chains = ref<LifiChain[]>([])
const loadingChains = ref(false)
const selectedChainId = ref<number | null>(props.lockedChainId ?? null) // null = All Chains
const chainSearch = ref('')

const STARRED_IDS = [8453, 1, 42161, 10, 137] // Base, Eth, Arbitrum, Optimism, Polygon

// Known testnet chain IDs to exclude
const TESTNET_IDS = new Set([
  5, 11155111, 11155420, 421614, 84532, 80002, 97, 43113, 4002, 1442,
  44787, 338, 10200, 534351, 59140, 1313161555, 280, 1101,
])

// Filter out testnets from chain list
const mainnetChains = computed(() =>
  chains.value.filter(c => !TESTNET_IDS.has(c.id) && !c.name?.toLowerCase().includes('testnet') && !c.name?.toLowerCase().includes('sepolia')),
)

const starredChains = computed(() =>
  STARRED_IDS.map(id => mainnetChains.value.find(c => c.id === id)).filter(Boolean) as LifiChain[],
)
const regularChains = computed(() => {
  const q = chainSearch.value.toLowerCase()
  const list = mainnetChains.value.filter(c => !STARRED_IDS.includes(c.id))
  return (q ? list.filter(c => c.name.toLowerCase().includes(q)) : list)
    .sort((a, b) => a.name.localeCompare(b.name))
})

// ── Token state ───────────────────────────────────────────────────────────────
interface TokenRow {
  address: string
  symbol: string
  name?: string
  decimals: number
  logoURI?: string
  chainId: number
  priceUSD?: number
  balance?: string
}

const tokens = ref<TokenRow[]>([])
const loadingTokensList = ref(false)
const tokenSearch = ref('')

// Wallet tokens mapped to TokenRow format (Base chain, from Enso)
const walletTokenRows = computed<TokenRow[]>(() => {
  if (!props.walletTokens?.length) return []
  return props.walletTokens.map(t => ({
    address: t.token,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    logoURI: t.logoUri,
    chainId: 8453,
    priceUSD: t.usdPrice,
    balance: t.formattedBal.toString(),
  }))
})

// Show wallet tokens only when "All Chains" or "Base" is selected
const showWallet = computed(() =>
  selectedChainId.value === null || selectedChainId.value === 8453,
)

const filteredTokens = computed(() => {
  const q = tokenSearch.value.toLowerCase()
  const wallet = showWallet.value ? walletTokenRows.value : []

  if (!q) {
    // No search: wallet tokens first, then global (from selected chain)
    const walletAddrs = new Set(wallet.map(t => t.address.toLowerCase()))
    const global = tokens.value.filter(t => !walletAddrs.has(t.address.toLowerCase()))
    return [...wallet, ...global].slice(0, 80)
  }

  // Search: combine wallet + global, deduplicate, filter by query
  const all = new Map<string, TokenRow>()
  for (const t of wallet) all.set(`${t.chainId}-${t.address.toLowerCase()}`, t)
  for (const t of tokens.value) {
    const key = `${t.chainId}-${t.address.toLowerCase()}`
    if (!all.has(key)) all.set(key, t)
  }
  return [...all.values()]
    .filter(t =>
      t.symbol.toLowerCase().includes(q) ||
      t.name?.toLowerCase().includes(q) ||
      t.address?.toLowerCase() === q,
    )
    .slice(0, 80)
})

const hasWalletTokens = computed(() => showWallet.value && walletTokenRows.value.length > 0)

// ── Chain logo lookup ─────────────────────────────────────────────────────────
function chainLogo(chainId: number): string | undefined {
  return chains.value.find(c => c.id === chainId)?.logoURI
}
function chainName(chainId: number): string {
  return chains.value.find(c => c.id === chainId)?.name ?? `Chain ${chainId}`
}
function fmt(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ── Data fetching ─────────────────────────────────────────────────────────────
// Fetch chains once
async function loadChains() {
  if (chains.value.length) return
  loadingChains.value = true
  try {
    chains.value = await $fetch<LifiChain[]>('/api/lifi/chains')
  } finally {
    loadingChains.value = false
  }
}

// Fetch user balances for a specific chain via Enso
async function fetchChainBalances(chainId: number): Promise<TokenRow[]> {
  if (!props.userAddress) return []
  try {
    const raw = await $fetch<any[]>('/api/enso/balances', {
      query: { address: props.userAddress, chainId },
    })
    return (raw ?? [])
      .filter((b: any) => b.amount && BigInt(b.amount) > 0n)
      .map((b: any) => {
        const formatted = Number(BigInt(b.amount)) / Math.pow(10, b.decimals)
        const price = parseFloat(b.price ?? '0') || 0
        return {
          address: b.token,
          symbol: b.symbol ?? '',
          name: b.name ?? '',
          decimals: b.decimals ?? 18,
          logoURI: b.logoUri ?? '',
          chainId,
          priceUSD: price,
          balance: formatted.toString(),
        }
      })
      .sort((a: TokenRow, b: TokenRow) => {
        const aUsd = parseFloat(a.balance ?? '0') * (a.priceUSD ?? 0)
        const bUsd = parseFloat(b.balance ?? '0') * (b.priceUSD ?? 0)
        return bUsd - aUsd
      })
  } catch (e) {
    console.error(`[picker] balance fetch failed for chain ${chainId}:`, e)
    return []
  }
}

// Fetch the full LI.FI token list for a given chain (no balance)
async function fetchChainTokenList(chainId: number): Promise<TokenRow[]> {
  try {
    const raw = await $fetch<any[]>('/api/lifi/tokens', { query: { chainId } })
    return (raw ?? []).map((t: any) => ({
      address: t.address,
      symbol: t.symbol ?? '',
      name: t.name ?? '',
      decimals: t.decimals ?? 18,
      logoURI: t.logoURI ?? '',
      chainId,
      priceUSD: parseFloat(t.priceUSD ?? '0') || 0,
      balance: undefined,
    }))
  } catch (e) {
    console.error(`[picker] token list fetch failed for chain ${chainId}:`, e)
    return []
  }
}

// Fetch tokens whenever chain selection changes
async function loadTokens() {
  loadingTokensList.value = true
  tokens.value = []
  try {
    const chainId = selectedChainId.value

    // 'list' mode: full token list without balance (for swap output picker)
    if (props.source === 'list') {
      tokens.value = await fetchChainTokenList(chainId ?? 8453)
      return
    }

    // If the caller provided `walletTokens` (direct RPC read) and we're on
    // that same chain, skip Enso entirely — walletTokens is authoritative.
    if (props.walletTokens?.length && (chainId === null || chainId === 8453)) {
      tokens.value = []  // walletTokenRows is merged in filteredTokens
      return
    }

    if (chainId) {
      // Specific chain: fetch user's balances on that chain via Enso
      tokens.value = await fetchChainBalances(chainId)
    } else if (props.userAddress) {
      // "All Chains": fetch balances in parallel across starred chains, merge.
      const results = await Promise.all(STARRED_IDS.map(id => fetchChainBalances(id)))
      const merged = results.flat()
      // Sort by USD value desc
      merged.sort((a, b) => {
        const aUsd = parseFloat(a.balance ?? '0') * (a.priceUSD ?? 0)
        const bUsd = parseFloat(b.balance ?? '0') * (b.priceUSD ?? 0)
        return bUsd - aUsd
      })
      tokens.value = merged
    } else {
      tokens.value = []
    }
  } finally {
    loadingTokensList.value = false
  }
}

// Trigger loads when dialog opens
watch(open, async (v) => {
  if (!v) { chainSearch.value = ''; tokenSearch.value = ''; return }
  // Re-apply locked chain on each open (handles dynamic prop changes)
  if (props.lockedChainId !== undefined) selectedChainId.value = props.lockedChainId
  await loadChains()
  await loadTokens()
})

watch(selectedChainId, () => {
  if (open.value) loadTokens()
})

// ── Actions ───────────────────────────────────────────────────────────────────
function selectChain(id: number | null) {
  selectedChainId.value = id
  tokenSearch.value = ''
}

function selectToken(t: TokenRow) {
  emit('select', {
    address: t.address,
    symbol: t.symbol,
    name: t.name,
    decimals: t.decimals,
    logoURI: t.logoURI,
    chainId: t.chainId,
    chainName: chainName(t.chainId),
    chainLogoURI: chainLogo(t.chainId),
    balance: t.balance,
    priceUSD: t.priceUSD,
  })
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-[620px] h-[540px] p-0 gap-0 flex flex-col overflow-hidden">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
        <h2 class="font-semibold text-base">Select Token</h2>
      </div>

      <!-- Body: left chain panel + right token panel -->
      <div class="flex flex-1 overflow-hidden">

        <!-- ── Left: Chains ── (hidden when chain is locked) -->
        <div v-if="lockedChainId === undefined" class="w-[190px] shrink-0 border-r border-border/50 flex flex-col overflow-hidden">
          <!-- Chain search -->
          <div class="px-2 py-2 border-b border-border/40 shrink-0">
            <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
              <Icon name="lucide:search" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                v-model="chainSearch"
                placeholder="Search chains"
                class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-w-0"
              />
            </div>
          </div>

          <div class="flex-1 overflow-y-auto py-1">
            <!-- All Chains -->
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
              :class="selectedChainId === null ? 'bg-muted/60 font-semibold' : 'hover:bg-muted/40'"
              @click="selectChain(null)"
            >
              <div class="w-6 h-6 rounded-full bg-gradient-to-br from-primary/40 to-violet-500/40 flex items-center justify-center shrink-0">
                <Icon name="lucide:globe" class="w-3.5 h-3.5 text-primary" />
              </div>
              <span>All Chains</span>
            </button>

            <!-- Starred -->
            <template v-if="!chainSearch && starredChains.length">
              <div class="flex items-center gap-1 px-3 pt-3 pb-1">
                <Icon name="lucide:star" class="w-3 h-3 text-amber-400" />
                <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Starred Chains</span>
              </div>
              <button
                v-for="c in starredChains" :key="c.id"
                class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors"
                :class="selectedChainId === c.id ? 'bg-muted/60 font-semibold' : 'hover:bg-muted/40'"
                @click="selectChain(c.id)"
              >
                <img v-if="c.logoURI" :src="c.logoURI" :alt="c.name" class="w-5 h-5 rounded-full shrink-0" @error="($event.target as HTMLImageElement).style.display='none'" />
                <span class="truncate">{{ c.name }}</span>
              </button>
            </template>

            <!-- A-Z -->
            <div class="px-3 pt-3 pb-1">
              <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {{ chainSearch ? 'Results' : 'Chains A-Z' }}
              </span>
            </div>
            <div v-if="loadingChains" class="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Icon name="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
            <button
              v-for="c in regularChains" :key="c.id"
              class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors"
              :class="selectedChainId === c.id ? 'bg-muted/60 font-semibold' : 'hover:bg-muted/40'"
              @click="selectChain(c.id)"
            >
              <img v-if="c.logoURI" :src="c.logoURI" :alt="c.name" class="w-5 h-5 rounded-full shrink-0" @error="($event.target as HTMLImageElement).style.display='none'" />
              <span class="truncate">{{ c.name }}</span>
            </button>
          </div>
        </div>

        <!-- ── Right: Tokens ── -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Token search -->
          <div class="px-3 py-2 border-b border-border/40 shrink-0">
            <div class="flex items-center gap-2 bg-muted/50 rounded-lg px-2.5 py-1.5">
              <Icon name="lucide:search" class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                v-model="tokenSearch"
                placeholder="Search for a token or paste address"
                class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-w-0"
              />
            </div>
          </div>

          <!-- Token list -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="loadingTokensList && !hasWalletTokens" class="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
              <Icon name="lucide:loader-2" class="w-4 h-4 animate-spin" />
              Loading tokens…
            </div>
            <div v-else-if="!filteredTokens.length" class="py-10 text-center text-sm text-muted-foreground">
              No tokens found
            </div>
            <template v-for="(t, idx) in filteredTokens" :key="`${t.chainId}-${t.address}`">
              <!-- Section header: Your tokens / All tokens -->
              <div
                v-if="!tokenSearch && idx === 0 && t.balance"
                class="px-4 pt-2 pb-1 sticky top-0 bg-card/95 backdrop-blur-sm z-10"
              >
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Your tokens</span>
              </div>
              <div
                v-if="!tokenSearch && t.balance === undefined && (idx === 0 || filteredTokens[idx - 1]?.balance !== undefined)"
                class="px-4 pt-3 pb-1 sticky top-0 bg-card/95 backdrop-blur-sm z-10"
              >
                <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">All tokens</span>
              </div>

            <button
              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors text-left"
              @click="selectToken(t)"
            >
              <!-- Token logo with chain badge -->
              <div class="relative shrink-0">
                <img
                  v-if="t.logoURI"
                  :src="t.logoURI"
                  :alt="t.symbol"
                  class="w-9 h-9 rounded-full bg-muted"
                  @error="($event.target as HTMLImageElement).style.display='none'"
                />
                <div v-else class="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center text-xs font-bold">
                  {{ t.symbol.slice(0, 2) }}
                </div>
                <!-- Chain badge -->
                <img
                  v-if="chainLogo(t.chainId)"
                  :src="chainLogo(t.chainId)"
                  class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-background bg-background"
                  @error="($event.target as HTMLImageElement).style.display='none'"
                />
              </div>

              <!-- Token info -->
              <div class="flex-1 min-w-0">
                <p class="font-bold text-sm leading-tight">{{ t.symbol }}</p>
                <p class="text-[11px] text-muted-foreground leading-tight">
                  {{ chainName(t.chainId) }}
                  <span class="text-muted-foreground/50">{{ fmt(t.address) }}</span>
                </p>
              </div>

              <!-- Balance (if available) -->
              <div v-if="t.balance && parseFloat(t.balance) > 0" class="text-right shrink-0">
                <p class="text-sm font-medium tabular-nums">{{ parseFloat(t.balance).toLocaleString('en-US', { maximumFractionDigits: 4 }) }}</p>
                <p v-if="t.priceUSD" class="text-[11px] text-muted-foreground">
                  ${{ (parseFloat(t.balance) * t.priceUSD).toLocaleString('en-US', { maximumFractionDigits: 2 }) }}
                </p>
              </div>
            </button>
            </template>
          </div>
        </div>

      </div>
    </DialogContent>
  </Dialog>
</template>
