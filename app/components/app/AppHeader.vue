<script setup lang="ts">
import { BRAND } from '~/config/brand'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'

const props = defineProps<{
  isConnected: boolean
  isBase: boolean
  displayName: string
  address?: string
}>()

const emit = defineEmits<{
  signIn: []
  switchNetwork: []
  goProfile: []
  logout: []
}>()

const menuOpen = ref(false)

// Truncated address for display next to icon (fallback when no custom name)
const shortLabel = computed(() => {
  if (!props.address) return props.displayName
  // If displayName is already custom (not a 0x...), use it as-is.
  // Otherwise show a shorter truncation matching profileStore.displayName() output.
  return props.displayName
})

function handleProfile() {
  menuOpen.value = false
  emit('goProfile')
}

function handleLogout() {
  menuOpen.value = false
  emit('logout')
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-background/70 backdrop-blur-2xl">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
      <!-- Logo -->
      <NuxtLink to="/" class="flex items-center gap-2">
        <img src="/new.jpeg" :alt="BRAND.name" class="w-7 h-7 rounded-lg" />
        <span class="font-bold tracking-tight">{{ BRAND.name }}</span>
      </NuxtLink>

      <!-- Right side -->
      <Button
        v-if="!isConnected"
        size="sm"
        class="h-8 text-xs rounded-full px-4"
        @click="emit('signIn')"
      >
        Sign In
      </Button>

      <div v-else class="flex items-center gap-2">
        <Badge
          v-if="!isBase"
          variant="destructive"
          class="cursor-pointer text-xs rounded-full"
          @click="emit('switchNetwork')"
        >
          Wrong network
        </Badge>

        <Popover v-model:open="menuOpen">
          <PopoverTrigger as-child>
            <button
              class="flex items-center gap-2 h-9 pl-1 pr-3 rounded-full bg-muted/50 hover:bg-muted transition-colors border border-border/60"
            >
              <span class="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-primary">
                <Icon name="lucide:user" class="w-3.5 h-3.5" />
              </span>
              <span class="text-xs font-medium tabular-nums max-w-35 truncate">
                {{ shortLabel }}
              </span>
              <Icon name="lucide:chevron-down" class="w-3 h-3 text-muted-foreground" :class="{ 'rotate-180': menuOpen }" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-56 p-1.5">
            <!-- Header info -->
            <div class="px-2.5 py-2 border-b border-border/50 mb-1">
              <p class="text-xs text-muted-foreground/70">Signed in as</p>
              <p class="text-sm font-semibold truncate">{{ shortLabel }}</p>
              <p v-if="address" class="text-[10px] text-muted-foreground/50 font-mono truncate mt-0.5">
                {{ address }}
              </p>
            </div>

            <button
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-accent transition-colors"
              @click="handleProfile"
            >
              <Icon name="lucide:user-round" class="w-4 h-4 text-muted-foreground" />
              <span>Profile</span>
            </button>
            <button
              class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm hover:bg-destructive/10 text-destructive transition-colors"
              @click="handleLogout"
            >
              <Icon name="lucide:log-out" class="w-4 h-4" />
              <span>Sign out</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  </header>
</template>
