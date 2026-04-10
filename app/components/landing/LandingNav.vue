<script setup lang="ts">
import { BRAND } from '~/config/brand'

const scrolled = ref(false)

function onScroll() {
  scrolled.value = window.scrollY > 20
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <header
    class="fixed top-0 inset-x-0 z-50 transition-all duration-500"
    :class="scrolled
      ? 'bg-background/80 backdrop-blur-xl border-b border-white/6'
      : ''"
  >
    <nav class="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <NuxtLink to="/" class="flex items-center gap-2.5">
        <img src="/logo.png" :alt="BRAND.name" class="w-9 h-9" />
        <span class="text-lg font-bold tracking-tight text-foreground">{{ BRAND.name }}</span>
      </NuxtLink>

      <Button
        size="sm"
        class="rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/30 backdrop-blur-sm"
        @click="navigateTo('/app')"
      >
        Launch App
        <Icon name="lucide:arrow-right" class="w-3.5 h-3.5 ml-1" />
      </Button>
    </nav>
  </header>
</template>
