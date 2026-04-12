<script lang="ts" setup>
import type { CalendarRootEmits, CalendarRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { CalendarRoot, useForwardPropsEmits } from "reka-ui"
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date"
import { cn } from "@/lib/utils"
import { CalendarCell, CalendarCellTrigger, CalendarGrid, CalendarGridBody, CalendarGridHead, CalendarGridRow, CalendarHeadCell, CalendarHeader, CalendarNextButton, CalendarPrevButton } from "."
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../select"

const props = defineProps<CalendarRootProps & { class?: HTMLAttributes["class"] }>()

const emits = defineEmits<CalendarRootEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)

// Placeholder controls which month is displayed (independent of selection).
const placeholder = ref<CalendarDate>(today(getLocalTimeZone()) as CalendarDate)

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// Year range: current ± 10
const YEARS = computed(() => {
  const now = today(getLocalTimeZone()).year
  return Array.from({ length: 21 }, (_, i) => now - 10 + i)
})

function onMonthChange(v: string) {
  const monthIdx = parseInt(v)
  placeholder.value = new CalendarDate(placeholder.value.year, monthIdx + 1, 1)
}

function onYearChange(v: string) {
  const year = parseInt(v)
  placeholder.value = new CalendarDate(year, placeholder.value.month, 1)
}
</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    v-model:placeholder="placeholder"
    :class="cn('p-3', props.class)"
    v-bind="forwarded"
  >
    <CalendarHeader>
      <CalendarPrevButton />
      <!-- Custom month + year dropdowns (shadcn Select) -->
      <div class="flex items-center gap-1.5 flex-1 justify-center">
        <Select :model-value="String(placeholder.month - 1)" @update:model-value="(v) => onMonthChange(v as string)">
          <SelectTrigger class="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="(m, i) in MONTHS" :key="m" :value="String(i)">{{ m }}</SelectItem>
          </SelectContent>
        </Select>
        <Select :model-value="String(placeholder.year)" @update:model-value="(v) => onYearChange(v as string)">
          <SelectTrigger class="h-8 w-20 text-xs tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="y in YEARS" :key="y" :value="String(y)">{{ y }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <CalendarNextButton />
    </CalendarHeader>

    <div class="flex flex-col gap-y-4 mt-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
      <CalendarGrid v-for="month in grid" :key="month.value.toString()">
        <CalendarGridHead>
          <CalendarGridRow>
            <CalendarHeadCell
              v-for="day in weekDays" :key="day"
            >
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>
        <CalendarGridBody>
          <CalendarGridRow v-for="(weekDates, index) in month.rows" :key="`weekDate-${index}`" class="mt-2 w-full">
            <CalendarCell
              v-for="weekDate in weekDates"
              :key="weekDate.toString()"
              :date="weekDate"
            >
              <CalendarCellTrigger
                :day="weekDate"
                :month="month.value"
              />
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>
