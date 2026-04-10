<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const props = defineProps<{
  address: string
}>()

const copied = ref(false)

function copyAddress() {
  navigator.clipboard.writeText(props.address)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function truncate(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`
}

watch(open, (val) => {
  if (val) copied.value = false
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Fund Your Wallet</DialogTitle>
        <DialogDescription>
          Add funds to your wallet to start saving.
        </DialogDescription>
      </DialogHeader>

      <!-- Wallet address -->
      <div class="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
        <div class="flex-1 min-w-0">
          <p class="text-xs text-muted-foreground mb-0.5">Your wallet address</p>
          <p class="text-sm font-mono truncate">{{ truncate(address) }}</p>
        </div>
        <Button variant="outline" size="sm" @click="copyAddress">
          <Icon :name="copied ? 'lucide:check' : 'lucide:copy'" class="w-3.5 h-3.5 mr-1.5" />
          {{ copied ? 'Copied' : 'Copy' }}
        </Button>
      </div>

      <!-- What you need -->
      <div class="rounded-lg bg-primary/5 border border-primary/20 p-3 mt-2">
        <p class="text-xs font-semibold text-primary mb-1.5">What you need to get started</p>
        <ul class="space-y-1">
          <li class="flex items-start gap-2 text-xs text-muted-foreground">
            <span class="text-primary font-bold mt-px">1.</span>
            <span><strong class="text-foreground">ETH</strong> on Base — needed for gas fees (a small amount, ~$0.50 is enough)</span>
          </li>
          <li class="flex items-start gap-2 text-xs text-muted-foreground">
            <span class="text-primary font-bold mt-px">2.</span>
            <span><strong class="text-foreground">USDC</strong> or any token on Base — this is what you'll deposit to earn yield</span>
          </li>
        </ul>
      </div>

      <div class="space-y-3 mt-4">
        <p class="text-sm text-muted-foreground">Choose how to add funds:</p>

        <!-- Coinbase -->
        <a
          href="https://www.coinbase.com/buy/USDC"
          target="_blank"
          rel="noopener"
          class="w-full flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
        >
          <div class="w-10 h-10 rounded-full bg-[#0052FF]/10 flex items-center justify-center shrink-0">
            <Icon name="simple-icons:coinbase" class="w-5 h-5 text-[#0052FF]" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">Buy on Coinbase</p>
            <p class="text-xs text-muted-foreground">Buy ETH + USDC, then send to your wallet on Base</p>
          </div>
          <Icon name="lucide:external-link" class="w-4 h-4 text-muted-foreground shrink-0" />
        </a>

        <!-- MoonPay -->
        <a
          href="https://www.moonpay.com/buy"
          target="_blank"
          rel="noopener"
          class="w-full flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
        >
          <div class="w-10 h-10 rounded-full bg-[#7D00FF]/10 flex items-center justify-center shrink-0">
            <Icon name="lucide:moon" class="w-5 h-5 text-[#7D00FF]" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium">Buy on MoonPay</p>
            <p class="text-xs text-muted-foreground">Buy ETH + USDC with card or bank transfer</p>
          </div>
          <Icon name="lucide:external-link" class="w-4 h-4 text-muted-foreground shrink-0" />
        </a>

        <!-- Send from another wallet -->
        <div class="rounded-lg border border-dashed border-border/60 p-4">
          <div class="flex items-start gap-3">
            <Icon name="lucide:send" class="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p class="text-sm font-medium">Send from another wallet</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                Copy your address above and send <strong>ETH</strong> (for gas) + <strong>USDC</strong> on Base network from any exchange or wallet.
              </p>
            </div>
          </div>
        </div>

        <!-- Gas tip -->
        <p class="text-[11px] text-muted-foreground/60 text-center px-4">
          Tip: Make sure to send a small amount of ETH on Base for gas fees. Without ETH, transactions cannot be processed.
        </p>
      </div>
    </DialogContent>
  </Dialog>
</template>
