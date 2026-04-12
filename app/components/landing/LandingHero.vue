<script setup lang="ts">
const progress = ref(0)
const earnings = ref(28.14)
let earningsInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  setTimeout(() => { progress.value = 41 }, 500)
  earningsInterval = setInterval(() => {
    earnings.value = Math.round((earnings.value + 0.01) * 100) / 100
  }, 2800)
})

onUnmounted(() => {
  if (earningsInterval) clearInterval(earningsInterval)
})

function fmt(n: number) {
  return '$' + n.toFixed(2)
}
</script>

<template>
  <section class="relative min-h-screen flex items-center overflow-hidden pt-24 pb-16">

    <!-- Background glows -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div class="absolute -top-[20%] -left-[10%] w-[min(700px,110vw)] h-[min(700px,110vw)] rounded-full bg-primary/7 blur-[160px] animate-drift-1" />
      <div class="absolute top-[50%] -right-[15%] w-[min(500px,80vw)] h-[min(500px,80vw)] rounded-full bg-brand-teal/8 blur-[130px] animate-drift-2" />
    </div>

    <div class="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

        <!-- Left: copy -->
        <div class="flex flex-col items-start">

          <!-- Pill -->
          <div class="animate-fade-up mb-7">
            <span class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Three ways to earn. One smart account.
            </span>
          </div>

          <!-- Headline -->
          <h1 class="animate-fade-up [animation-delay:80ms] text-[2.8rem] sm:text-5xl lg:text-[3.4rem] font-bold tracking-[-0.04em] leading-[1.06] mb-6">
            DeFi yield,<br />without the DeFi.
          </h1>

          <!-- Sub -->
          <p class="animate-fade-up [animation-delay:160ms] text-base sm:text-lg text-muted-foreground leading-relaxed mb-10 max-w-lg">
            Save toward goals with <span class="text-foreground font-medium">Pockets</span>, browse vaults in
            <span class="text-foreground font-medium">Earn</span>, or build multi-vault recipes in
            <span class="text-foreground font-medium">Strategies</span>. Deposit from any chain, any token — gas paid in USDC.
          </p>

          <!-- CTAs -->
          <div class="animate-fade-up [animation-delay:240ms] flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto mb-10">
            <button
              class="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-full bg-primary text-primary-foreground text-base font-semibold shadow-xl shadow-primary/30 hover:bg-primary/90 hover:shadow-primary/45 active:scale-[0.97] transition-all duration-200"
              @click="navigateTo('/app')"
            >
              Open the app
              <Icon name="lucide:arrow-right" class="w-4 h-4" />
            </button>
            <a
              href="#how-it-works"
              class="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-full border border-border/70 text-muted-foreground text-base font-medium hover:bg-secondary hover:text-foreground hover:border-border transition-all duration-200"
            >
              How it works
            </a>
          </div>

          <!-- Trust row -->
          <div class="animate-fade-up [animation-delay:320ms] flex flex-wrap items-center gap-x-5 gap-y-2">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground/50">
              <Icon name="lucide:mail" class="w-3.5 h-3.5 text-primary/50" />
              Email sign-in
            </div>
            <div class="hidden sm:block w-px h-3 bg-border/50" />
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground/50">
              <Icon name="lucide:fuel" class="w-3.5 h-3.5 text-primary/50" />
              Gas paid in USDC
            </div>
            <div class="hidden sm:block w-px h-3 bg-border/50" />
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground/50">
              <Icon name="lucide:zap" class="w-3.5 h-3.5 text-primary/50" />
              Single-tx deposits
            </div>
            <div class="hidden sm:block w-px h-3 bg-border/50" />
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground/50">
              <Icon name="lucide:unlock" class="w-3.5 h-3.5 text-primary/50" />
              Withdraw anytime
            </div>
          </div>
        </div>

        <!-- Right: mock pocket card -->
        <div class="animate-fade-up [animation-delay:200ms] flex flex-col items-center lg:items-end gap-4">

          <div class="w-full max-w-[360px] rounded-2xl bg-card border border-border p-6 shadow-2xl shadow-black/40 ring-1 ring-white/5">

            <!-- Card header -->
            <div class="flex items-center justify-between mb-5">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl leading-none">
                  🏖️
                </div>
                <div>
                  <p class="font-semibold text-sm text-foreground leading-none mb-1">Vacation Fund</p>
                  <p class="text-xs text-muted-foreground">Conservative · 3 months in</p>
                </div>
              </div>
              <span class="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                4.8% APY
              </span>
            </div>

            <!-- Progress -->
            <div class="mb-5">
              <div class="flex justify-between items-end mb-2">
                <span class="text-2xl font-bold font-mono text-foreground">$1,247</span>
                <span class="text-sm text-muted-foreground">of $3,000</span>
              </div>
              <div class="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                  :style="{ width: `${progress}%` }"
                />
              </div>
              <div class="flex justify-between text-xs mt-1.5">
                <div class="flex items-center gap-1 text-primary font-medium">
                  <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  +{{ fmt(earnings) }} earned
                </div>
                <span class="text-muted-foreground/60">41% of goal</span>
              </div>
            </div>

            <!-- Divider -->
            <div class="h-px bg-border/60 mb-4" />

            <!-- Latest deposit flow -->
            <div>
              <p class="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/40 mb-3">
                Latest deposit
              </p>
              <div class="flex items-center gap-2">
                <!-- Source chain -->
                <div class="flex flex-col items-center gap-1">
                  <div class="w-9 h-9 rounded-full bg-[#28A0F0]/12 border border-[#28A0F0]/25 flex items-center justify-center">
                    <span class="text-[10px] font-bold text-[#28A0F0]">ARB</span>
                  </div>
                  <span class="text-[9px] text-muted-foreground/40">Arbitrum</span>
                </div>
                <!-- Route line -->
                <div class="flex-1 flex items-center gap-1.5 pb-3.5">
                  <div class="flex-1 h-px border-t border-dashed border-border/50" />
                  <div class="w-6 h-6 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                    <Icon name="lucide:zap" class="w-3 h-3 text-primary" />
                  </div>
                  <div class="flex-1 h-px border-t border-dashed border-border/50" />
                </div>
                <!-- Vault -->
                <div class="flex flex-col items-center gap-1">
                  <div class="w-9 h-9 rounded-full bg-brand-gold/12 border border-brand-gold/25 flex items-center justify-center">
                    <Icon name="lucide:trending-up" class="w-4 h-4 text-brand-gold" />
                  </div>
                  <span class="text-[9px] text-muted-foreground/40">Morpho</span>
                </div>
              </div>
              <p class="text-[11px] text-muted-foreground/40 mt-1">
                50 USDT · Routed via LI.FI · 8s
              </p>
            </div>
          </div>

          <!-- Chain strip -->
          <div class="flex flex-wrap items-center justify-center lg:justify-end gap-1.5 max-w-[360px]">
            <span class="text-[11px] text-muted-foreground/35 mr-0.5">From:</span>
            <span
              v-for="c in ['ETH', 'ARB', 'OP', 'MATIC', 'BNB', 'AVAX']"
              :key="c"
              class="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-secondary border border-border/50 text-muted-foreground/60"
            >
              {{ c }}
            </span>
            <span class="text-[11px] px-2.5 py-1 rounded-full bg-secondary border border-border/40 text-muted-foreground/40">
              +more
            </span>
          </div>
        </div>

      </div>
    </div>
  </section>
</template>
