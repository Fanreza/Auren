<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { usePrivyAuth } from '~/composables/usePrivy'

const { completeOAuthLogin } = usePrivyAuth()

const route = useRoute()

onMounted(async () => {
  const code = route.query.privy_oauth_code as string
  const state = route.query.privy_oauth_state as string

  if (code && state) {
    try {
      await completeOAuthLogin(code, state)
      navigateTo('/app')
    } catch (e) {
      console.error('[auth/callback] OAuth login failed:', e)
      navigateTo('/app')
    }
  } else {
    navigateTo('/app')
  }
})
</script>

<template>
  <div class="h-dvh flex flex-col items-center justify-center gap-4 bg-background">
    <img src="/logo.png" :alt="BRAND.name" class="w-16 h-16 animate-pulse" />
    <p class="text-sm text-muted-foreground">Signing you in...</p>
  </div>
</template>
