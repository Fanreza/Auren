<script setup lang="ts">
import { BRAND } from '~/config/brand'

const scrolled = ref(false)

onMounted(() => {
  const handler = () => { scrolled.value = window.scrollY > 20 }
  window.addEventListener('scroll', handler, { passive: true })
  onUnmounted(() => window.removeEventListener('scroll', handler))
})
</script>

<template>
  <header
    class="fixed top-0 inset-x-0 z-50 transition-all duration-300"
    :class="scrolled ? 'bg-background/85 backdrop-blur-xl border-b border-border py-3' : 'py-5'"
  >
    <div class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2.5 group">
        <img src="/new.jpeg" :alt="BRAND.name" class="w-9 h-9 rounded-xl object-cover" />
        <span class="text-lg font-bold tracking-tight text-foreground">{{ BRAND.name }}</span>
      </NuxtLink>

      <button
        class="inline-flex items-center gap-2 h-9 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all duration-200 shadow-lg shadow-primary/20"
        @click="navigateTo('/app')"
      >
        Open App
        <Icon name="lucide:arrow-right" class="w-3.5 h-3.5" />
      </button>
    </div>
  </header>
</template>
