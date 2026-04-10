<script setup lang="ts">
import { today, getLocalTimeZone, parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Calendar } from '~/components/ui/calendar'
import type { DbPocket } from '~/types/database'

const props = defineProps<{
  pocket: DbPocket
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  saved: []
}>()

const name = ref('')
const targetDisplay = ref('')
const target = computed(() => {
  const num = Number(targetDisplay.value.replace(/,/g, ''))
  return num > 0 ? num : undefined
})
const timeline = ref<DateValue | undefined>()
const showDatePicker = ref(false)
const saving = ref(false)

const profileStore = useProfileStore()

function onTargetInput(v: string) {
  const raw = v.replace(/[^0-9]/g, '')
  if (!raw) { targetDisplay.value = ''; return }
  targetDisplay.value = Number(raw).toLocaleString('en-US')
}

watch(open, (v) => {
  if (v) {
    name.value = props.pocket.name
    // Format target amount with commas
    if (props.pocket.target_amount) {
      targetDisplay.value = props.pocket.target_amount.toLocaleString('en-US')
    } else {
      targetDisplay.value = ''
    }
    // Parse timeline string to DateValue (handle various DB formats)
    if (props.pocket.timeline) {
      try {
        timeline.value = parseDate(props.pocket.timeline.substring(0, 10))
      } catch {
        timeline.value = undefined
      }
    } else {
      timeline.value = undefined
    }
  }
})

async function handleSave() {
  if (!name.value.trim()) return
  saving.value = true
  try {
    const ok = await profileStore.updatePocket(props.pocket.id, {
      name: name.value.trim(),
      target_amount: target.value || undefined,
      timeline: timeline.value ? timeline.value.toString() : undefined,
    })
    if (ok) {
      open.value = false
      emit('saved')
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit Pocket</DialogTitle>
        <DialogDescription>
          Update your pocket details.
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div>
          <label class="text-sm font-medium mb-1.5 block">Pocket name</label>
          <Input
            v-model="name"
            placeholder="e.g. Emergency Fund"
            class="h-12"
          />
        </div>

        <div>
          <label class="text-sm font-medium mb-1.5 block">Target amount (USD)</label>
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-base font-medium">$</span>
            <Input
              :model-value="targetDisplay"
              type="text"
              inputmode="numeric"
              placeholder="1,000"
              class="h-12 pl-8 text-base"
              @update:model-value="(v: any) => onTargetInput(String(v))"
            />
          </div>
          <p class="text-[11px] text-muted-foreground mt-1">Optional. Helps you track progress.</p>
        </div>

        <div>
          <label class="text-sm font-medium mb-1.5 block">Timeline</label>
          <Popover v-model:open="showDatePicker">
            <PopoverTrigger as-child>
              <Button
                variant="outline"
                class="w-full h-12 justify-start text-left font-normal"
                :class="{ 'text-muted-foreground': !timeline }"
              >
                <Icon name="lucide:calendar" class="w-4 h-4 mr-2" />
                <template v-if="timeline">
                  {{ timeline.toString() }}
                </template>
                <template v-else>
                  Pick a date
                </template>
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-0" align="start">
              <Calendar
                v-model="timeline"
                :min-value="today(getLocalTimeZone())"
                initial-focus
                @update:model-value="showDatePicker = false"
              />
            </PopoverContent>
          </Popover>
          <p class="text-[11px] text-muted-foreground mt-1">Optional. When do you need this money?</p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">
          Cancel
        </Button>
        <Button
          class="bg-primary text-primary-foreground hover:bg-primary/90"
          :disabled="!name.trim() || saving"
          @click="handleSave"
        >
          <Icon v-if="saving" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
          Save
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
