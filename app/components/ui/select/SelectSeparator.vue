<script setup lang="ts">
import type { SelectSeparatorProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { SelectSeparator, useForwardProps } from "reka-ui"
import { cn } from "@/lib/utils"

const props = defineProps<SelectSeparatorProps & { class?: HTMLAttributes["class"] }>()
const delegatedProps = reactiveOmit(props, "class")
const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <SelectSeparator
    v-bind="forwardedProps"
    :class="cn('-mx-1 my-1 h-px bg-muted', props.class)"
  />
</template>
