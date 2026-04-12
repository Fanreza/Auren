<script setup lang="ts">
import { useTokenLogos } from '~/composables/useTokenLogos'
import { protocolLogo } from '~/config/protocolLogos'

const props = withDefaults(defineProps<{
  /** Underlying asset contract address */
  assetAddress?: string | null
  /** Asset ticker symbol (used for fallback letter badge) */
  assetSymbol?: string | null
  /** Protocol name from LI.FI Earn API (e.g. "morpho-v1") */
  protocol?: string | null
  /** Visual size variant */
  size?: 'sm' | 'md' | 'lg'
}>(), {
  size: 'md',
})

const tokenLogos = useTokenLogos()
onMounted(() => tokenLogos.ensureLoaded())

const assetLogo = computed(() => tokenLogos.logoForAddress(props.assetAddress ?? null))
const protoLogo = computed(() => protocolLogo(props.protocol ?? null))

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return {
      wrapper: 'w-9',
      asset: 'w-7 h-7',
      proto: 'w-4 h-4 -ml-2',
      letter: 'text-[10px]',
      protoLetter: 'text-[8px]',
    }
    case 'lg': return {
      wrapper: 'w-16',
      asset: 'w-12 h-12',
      proto: 'w-7 h-7 -ml-3',
      letter: 'text-sm',
      protoLetter: 'text-xs',
    }
    default: return {
      wrapper: 'w-11',
      asset: 'w-8 h-8',
      proto: 'w-5 h-5 -ml-2.5',
      letter: 'text-xs',
      protoLetter: 'text-[9px]',
    }
  }
})

const assetLetter = computed(() => (props.assetSymbol ?? '?').charAt(0).toUpperCase())
const protocolLetter = computed(() => (props.protocol ?? '?').charAt(0).toUpperCase())

function hideBroken(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
  // Reveal fallback letter sibling
  const fallback = img.parentElement?.querySelector('.fallback-letter') as HTMLElement | null
  if (fallback) fallback.style.display = 'flex'
}
</script>

<template>
  <div class="flex items-center shrink-0" :class="sizeClasses.wrapper">
    <!-- Asset logo (or letter fallback) -->
    <div
      class="relative rounded-full bg-background border-2 border-background overflow-hidden shrink-0 z-10"
      :class="sizeClasses.asset"
    >
      <img
        v-if="assetLogo"
        :src="assetLogo"
        :alt="assetSymbol ?? 'asset'"
        class="w-full h-full object-cover"
        @error="hideBroken"
      />
      <div
        class="fallback-letter absolute inset-0 flex items-center justify-center font-bold bg-muted text-muted-foreground"
        :class="sizeClasses.letter"
        :style="{ display: assetLogo ? 'none' : 'flex' }"
      >
        {{ assetLetter }}
      </div>
    </div>

    <!-- Protocol logo (or letter fallback) — overlaps asset by -ml -->
    <div
      class="relative rounded-full bg-background border-2 border-background overflow-hidden shrink-0"
      :class="sizeClasses.proto"
    >
      <img
        v-if="protoLogo"
        :src="protoLogo"
        :alt="protocol ?? 'protocol'"
        class="w-full h-full object-cover"
        @error="hideBroken"
      />
      <div
        class="fallback-letter absolute inset-0 flex items-center justify-center font-bold bg-primary/20 text-primary"
        :class="sizeClasses.protoLetter"
        :style="{ display: protoLogo ? 'none' : 'flex' }"
      >
        {{ protocolLetter }}
      </div>
    </div>
  </div>
</template>
