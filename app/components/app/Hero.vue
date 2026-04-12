<script setup lang="ts">
import { BRAND } from '~/config/brand'

defineEmits<{ connect: [] }>()
</script>

<template>
  <div class="relative min-h-[calc(100dvh-3.5rem)] flex flex-col items-center justify-center px-6 overflow-hidden">
    <!-- Background glows -->
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div class="absolute top-[15%] left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[120px] animate-drift-1" />
      <div class="absolute bottom-[10%] right-[-5%] w-[300px] h-[300px] rounded-full bg-emerald-500/5 blur-[100px] animate-drift-2" />
    </div>

    <div class="relative z-10 max-w-sm w-full text-center">
      <!-- Logo mark -->
      <div class="flex justify-center mb-8 animate-fade-up">
        <div class="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20">
          <img src="/new.jpeg" :alt="BRAND.name" class="w-10 h-10 rounded-xl" />
        </div>
      </div>

      <!-- Headline -->
      <h1 class="text-4xl font-bold tracking-tight leading-tight mb-4 animate-fade-up [animation-delay:80ms]">
        Save toward<br />
        <span class="text-primary">what matters.</span>
      </h1>

      <p class="text-muted-foreground text-[15px] leading-relaxed mb-10 animate-fade-up [animation-delay:160ms]">
        Create goal pockets, deposit from any chain,
        and earn real yield — automatically.
      </p>

      <!-- CTA -->
      <div class="animate-fade-up [animation-delay:240ms]">
        <Button
          size="lg"
          class="w-full h-13 text-base rounded-2xl font-semibold"
          @click="$emit('connect')"
        >
          Get started
          <Icon name="lucide:arrow-right" class="w-4 h-4 ml-2" />
        </Button>
      </div>

      <!-- Trust strip -->
      <div class="flex items-center justify-center gap-5 mt-10 animate-fade-up [animation-delay:320ms]">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:shield-check" class="w-3.5 h-3.5 text-primary/70" />
          Non-custodial
        </div>
        <div class="w-px h-3 bg-border" />
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:door-open" class="w-3.5 h-3.5 text-primary/70" />
          Withdraw anytime
        </div>
        <div class="w-px h-3 bg-border" />
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:zap" class="w-3.5 h-3.5 text-primary/70" />
          Any chain
        </div>
      </div>
    </div>
  </div>
</template>
