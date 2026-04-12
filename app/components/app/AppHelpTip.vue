<script setup lang="ts">
import { GLOSSARY, type GlossaryKey } from '~/config/glossary'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '~/components/ui/tooltip'

const props = defineProps<{
  /** Glossary key — looks up title + body from config/glossary.ts */
  term: GlossaryKey
  /** Override icon size */
  size?: 'sm' | 'md'
}>()

const entry = computed(() => GLOSSARY[props.term])
const iconSize = computed(() => props.size === 'md' ? 'w-4 h-4' : 'w-3 h-3')
</script>

<template>
  <TooltipProvider :delay-duration="200">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="inline-flex items-center justify-center text-muted-foreground/50 hover:text-muted-foreground transition-colors align-middle ml-0.5"
          @click.stop
        >
          <Icon name="lucide:info" :class="iconSize" />
        </button>
      </TooltipTrigger>
      <TooltipContent class="max-w-xs p-3 z-10003" side="top">
        <p class="text-xs font-semibold mb-1">{{ entry.title }}</p>
        <p class="text-[11px] text-muted-foreground leading-relaxed">{{ entry.body }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
