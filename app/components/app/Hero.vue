<script setup lang="ts">
import { BRAND } from '~/config/brand'

const emit = defineEmits<{ connect: [] }>()
</script>

<template>
  <div class="relative flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
    <!-- Ambient glow -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div class="absolute -top-[20%] right-[-10%] w-[min(500px,70vw)] h-[min(500px,70vw)] rounded-full bg-primary/10 blur-[120px] animate-drift-1" />
      <div class="absolute top-[40%] -left-[15%] w-[min(350px,60vw)] h-[min(350px,60vw)] rounded-full bg-primary/6 blur-[100px] animate-drift-2" />
    </div>

    <div class="relative z-10 text-center max-w-md px-6">
      <img src="/logo.png" :alt="BRAND.name" class="w-16 h-16 mx-auto mb-6 animate-fade-up" />

      <h2 class="text-3xl font-bold tracking-tight mb-3 animate-fade-up [animation-delay:100ms]">
        {{ BRAND.heroTitle }}
        <br />
        <span class="text-primary">{{ BRAND.heroAccent }}</span>
      </h2>
      <p class="text-muted-foreground text-sm leading-relaxed mb-8 animate-fade-up [animation-delay:200ms]">
        Smart wallets, sponsored first actions, and goal pockets that make onchain saving feel much lighter.
      </p>

      <Button
        size="lg"
        class="bg-primary text-primary-foreground hover:bg-primary/90 animate-fade-up [animation-delay:300ms]"
        @click="emit('connect')"
      >
        Start with {{ BRAND.name }}
        <Icon name="lucide:arrow-right" class="w-4 h-4 ml-2" />
      </Button>

      <!-- Trust strip -->
      <div class="flex items-center justify-center gap-6 mt-10 animate-fade-up [animation-delay:400ms]">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:shield-check" class="w-3.5 h-3.5" />
          Non-custodial
        </div>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:eye" class="w-3.5 h-3.5" />
          Fully transparent
        </div>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon name="lucide:door-open" class="w-3.5 h-3.5" />
          Withdraw anytime
        </div>
      </div>
    </div>
  </div>
</template>
