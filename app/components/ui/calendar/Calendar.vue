<script lang="ts" setup>
import type { CalendarRootEmits, CalendarRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { CalendarRoot, useForwardPropsEmits } from "reka-ui"
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date"
import { cn } from "@/lib/utils"
import { CalendarCell, CalendarCellTrigger, CalendarGrid, CalendarGridBody, CalendarGridHead, CalendarGridRow, CalendarHeadCell, CalendarHeader, CalendarNextButton, CalendarPrevButton } from "."

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

function onMonthChange(e: Event) {
  const monthIdx = parseInt((e.target as HTMLSelectElement).value)
  placeholder.value = new CalendarDate(placeholder.value.year, monthIdx + 1, 1)
}

function onYearChange(e: Event) {
  const year = parseInt((e.target as HTMLSelectElement).value)
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
      <!-- Custom month + year dropdowns -->
      <div class="flex items-center gap-1.5 flex-1 justify-center">
        <select
          :value="placeholder.month - 1"
          class="bg-transparent text-sm font-medium rounded-md px-2 py-1 hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          @change="onMonthChange"
        >
          <option v-for="(m, i) in MONTHS" :key="m" :value="i" class="bg-popover">
            {{ m }}
          </option>
        </select>
        <select
          :value="placeholder.year"
          class="bg-transparent text-sm font-medium rounded-md px-2 py-1 hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer tabular-nums"
          @change="onYearChange"
        >
          <option v-for="y in YEARS" :key="y" :value="y" class="bg-popover">
            {{ y }}
          </option>
        </select>
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
