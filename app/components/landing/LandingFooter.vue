<script setup lang="ts">
import { BRAND } from '~/config/brand'
</script>

<template>
  <footer class="border-t border-border mt-16">
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 py-12">

      <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
        <!-- Brand column -->
        <div class="col-span-2 md:col-span-1">
          <div class="flex items-center gap-2.5 mb-3">
            <img src="/new.jpeg" :alt="BRAND.name" class="w-8 h-8 rounded-lg object-cover" />
            <span class="font-bold text-foreground">{{ BRAND.name }}</span>
            <span class="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60 border border-border px-1.5 py-0.5 rounded-md">Beta</span>
          </div>
          <p class="text-xs text-muted-foreground/70 leading-relaxed max-w-55">
            {{ BRAND.tagline }}
          </p>
        </div>

        <!-- Product -->
        <div>
          <p class="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-3">Product</p>
          <ul class="space-y-2 text-sm">
            <li>
              <NuxtLink to="/app" class="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/learn" class="text-muted-foreground hover:text-foreground transition-colors">
                Learn
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/profile" class="text-muted-foreground hover:text-foreground transition-colors">
                Profile
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Legal -->
        <div>
          <p class="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-3">Legal</p>
          <ul class="space-y-2 text-sm">
            <li>
              <NuxtLink to="/terms" class="text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/privacy" class="text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </NuxtLink>
            </li>
            <li>
              <NuxtLink to="/risks" class="text-muted-foreground hover:text-foreground transition-colors">
                Risk Disclosure
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Connect -->
        <div>
          <p class="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-3">Connect</p>
          <ul class="space-y-2 text-sm">
            <li>
              <a
                :href="BRAND.supportX"
                target="_blank" rel="noopener"
                class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                X / Twitter
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </a>
            </li>
            <li>
              <a
                href="https://basescan.org"
                target="_blank" rel="noopener"
                class="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                Basescan
                <Icon name="lucide:external-link" class="w-3 h-3" />
              </a>
            </li>
          </ul>
        </div>
      </div>

      <!-- Disclaimer + copyright -->
      <div class="pt-6 border-t border-border/50 space-y-3">
        <p class="text-[11px] text-muted-foreground/50 leading-relaxed max-w-3xl mx-auto text-center">
          Returns may vary and are not guaranteed. {{ BRAND.name }} is not a bank and does not provide financial advice.
          Funds are managed by automated smart contracts which carry inherent risk. Only save what you can afford to lose.
        </p>
        <p class="text-center text-xs text-muted-foreground/40">
          &copy; {{ new Date().getFullYear() }} {{ BRAND.name }} &mdash; All rights reserved
        </p>
      </div>

    </div>
  </footer>
</template>
