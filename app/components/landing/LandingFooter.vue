<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <footer class="border-t border-white/6">
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 py-10">
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2.5">
          <img src="/logo.png" :alt="BRAND.name" class="w-7 h-7" />
          <span class="font-bold text-lg text-foreground">{{ BRAND.name }}</span>
          <Badge
            variant="secondary"
            class="text-[10px] uppercase tracking-wider bg-white/6 text-muted-foreground border-0"
          >
            Beta
          </Badge>
        </div>

        <div class="flex items-center gap-6 text-sm text-muted-foreground">
          <NuxtLink
            to="/app"
            class="hover:text-foreground transition-colors duration-200"
          >
            App
          </NuxtLink>
          <a
            href="https://basescan.org"
            target="_blank"
            rel="noopener"
            class="hover:text-foreground transition-colors duration-200 inline-flex items-center gap-1"
          >
            BaseScan
            <Icon name="lucide:external-link" class="w-3 h-3" />
          </a>
        </div>
      </div>

      <Separator class="my-6 bg-white/6" />

      <p class="text-center text-[11px] text-muted-foreground/50 leading-relaxed max-w-lg mx-auto">
        Returns may vary and are not guaranteed. {{ BRAND.name }} is not a bank and does not provide financial advice.
        Your funds are managed by automated programs that carry inherent risk. Only save what you can afford to lose.
      </p>

      <p class="mt-4 text-center text-xs text-muted-foreground/60">
        &copy; {{ new Date().getFullYear() }} {{ BRAND.name }}. {{ BRAND.tagline }}
      </p>
    </div>
  </footer>
</template>
