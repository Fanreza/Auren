<script setup lang="ts">
import { useTour } from '~/composables/useTour'

const { showDashboardTour } = useTour()

onMounted(() => {
  showDashboardTour()
})
</script>

<template>
  <div />
</template>

<style>
/* Custom styling for the tour popover */
.driver-popover.auren-tour {
  background-color: hsl(212 42% 9%);
  border: 1px solid hsl(212 20% 18%);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  max-width: 320px;
}

.driver-popover.auren-tour .driver-popover-title {
  font-size: 16px;
  font-weight: 700;
  color: hsl(140 12% 92%);
  font-family: 'Plus Jakarta Sans', sans-serif;
  margin-bottom: 4px;
}

.driver-popover.auren-tour .driver-popover-description {
  font-size: 13px;
  color: hsl(140 6% 56%);
  line-height: 1.6;
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.driver-popover.auren-tour .driver-popover-progress-text {
  font-size: 11px;
  color: hsl(140 6% 45%);
  font-family: 'Plus Jakarta Sans', sans-serif;
}

.driver-popover.auren-tour .driver-popover-navigation-btns {
  gap: 8px;
}

.driver-popover.auren-tour .driver-popover-next-btn,
.driver-popover.auren-tour .driver-popover-prev-btn {
  font-size: 13px;
  font-weight: 600;
  border-radius: 10px;
  padding: 8px 16px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  border: none;
  text-shadow: none;
}

.driver-popover.auren-tour .driver-popover-next-btn {
  background-color: hsl(82 52% 46%);
  color: white;
}

.driver-popover.auren-tour .driver-popover-next-btn:hover {
  background-color: hsl(82 52% 40%);
}

.driver-popover.auren-tour .driver-popover-prev-btn {
  background-color: transparent;
  color: hsl(140 6% 56%);
}

.driver-popover.auren-tour .driver-popover-prev-btn:hover {
  color: hsl(140 12% 92%);
}

.driver-popover.auren-tour .driver-popover-close-btn {
  color: hsl(140 6% 56%);
}

.driver-popover.auren-tour .driver-popover-close-btn:hover {
  color: hsl(140 12% 92%);
}

.driver-popover.auren-tour .driver-popover-arrow-side-left.driver-popover-arrow,
.driver-popover.auren-tour .driver-popover-arrow-side-right.driver-popover-arrow,
.driver-popover.auren-tour .driver-popover-arrow-side-top.driver-popover-arrow,
.driver-popover.auren-tour .driver-popover-arrow-side-bottom.driver-popover-arrow {
  border-color: hsl(212 42% 9%);
}
</style>
