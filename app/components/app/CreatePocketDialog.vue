<script setup lang="ts">
import { today, getLocalTimeZone } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import { STRATEGIES, STRATEGY_LIST, type StrategyKey } from '~/config/strategies'
import { QUIZ_QUESTIONS, RECOMMENDATION_REASONS, computeRecommendation } from '~/config/quizScoring'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { Calendar } from '~/components/ui/calendar'

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  create: [payload: {
    name: string
    purpose?: string
    target_amount?: number
    timeline?: string
    strategy_key: StrategyKey
  }]
}>()

defineProps<{
  creating: boolean
}>()

const step = ref(1)
const name = ref('')
const purpose = ref('')
const targetDisplay = ref('')
const target = computed(() => {
  const num = Number(targetDisplay.value.replace(/,/g, ''))
  return num > 0 ? num : undefined
})

function onTargetInput(v: string) {
  const raw = v.replace(/[^0-9]/g, '')
  if (!raw) { targetDisplay.value = ''; return }
  targetDisplay.value = Number(raw).toLocaleString('en-US')
}
const timeline = ref<DateValue | undefined>()
const showDatePicker = ref(false)
const risk = ref<StrategyKey | null>(null)

// Quiz state
const quizPhase = ref<'quiz' | 'result'>('quiz')
const quizStep = ref(0)
const quizAnswers = ref<number[]>([])
const recommendedStrategy = ref<StrategyKey | null>(null)
const currentQuestion = computed(() => QUIZ_QUESTIONS[quizStep.value] ?? QUIZ_QUESTIONS[0]!)

const purposeOptions = ['Emergency Fund', 'Vacation', 'Retirement', 'Education', 'Big Purchase', 'Other']

const RISK_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  conservative: { label: 'Low risk', icon: 'lucide:shield', color: 'text-emerald-400' },
  balanced: { label: 'Medium risk', icon: 'lucide:scale', color: 'text-blue-400' },
  aggressive: { label: 'High risk', icon: 'lucide:zap', color: 'text-violet-400' },
}

const canProceedStep1 = computed(() => name.value.trim().length > 0)
const canCreate = computed(() => risk.value !== null)

function resetForm() {
  step.value = 1
  name.value = ''
  purpose.value = ''
  targetDisplay.value = ''
  timeline.value = undefined
  risk.value = null
  quizPhase.value = 'quiz'
  quizStep.value = 0
  quizAnswers.value = []
  recommendedStrategy.value = null
}

function selectQuizAnswer(value: number) {
  quizAnswers.value[quizStep.value] = value
  if (quizStep.value < QUIZ_QUESTIONS.length - 1) {
    setTimeout(() => { quizStep.value++ }, 200)
  } else {
    setTimeout(() => {
      const result = computeRecommendation(quizAnswers.value)
      recommendedStrategy.value = result
      risk.value = result
      quizPhase.value = 'result'
    }, 200)
  }
}

function quizBack() {
  if (quizPhase.value === 'result') {
    quizPhase.value = 'quiz'
    quizStep.value = QUIZ_QUESTIONS.length - 1
  } else if (quizStep.value > 0) {
    quizStep.value--
  } else {
    step.value = 2
  }
}

watch(open, (v) => {
  if (v) resetForm()
})

function handleCreate() {
  if (!risk.value) return
  emit('create', {
    name: name.value.trim(),
    purpose: purpose.value || undefined,
    target_amount: target.value || undefined,
    timeline: timeline.value ? timeline.value.toString() : undefined,
    strategy_key: risk.value,
  })
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-md p-0 gap-0 overflow-hidden">
      <div class="px-6 pt-6 pb-4">
        <DialogHeader>
          <DialogTitle>Create a Pocket</DialogTitle>
          <DialogDescription>
            <template v-if="step === 1">Give your savings pocket a name.</template>
            <template v-else-if="step === 2">Set a target and timeline (optional).</template>
            <template v-else>{{ quizPhase === 'quiz' ? 'A few quick questions to find your best fit.' : 'Here\'s what we recommend.' }}</template>
          </DialogDescription>
        </DialogHeader>

        <!-- Step indicator -->
        <div class="flex items-center gap-2 mt-4">
          <div
            v-for="s in 3"
            :key="s"
            class="flex-1 h-1 rounded-full transition-colors"
            :class="s <= step ? 'bg-primary' : 'bg-muted'"
          />
        </div>
      </div>

      <div class="px-6 pb-6">
        <!-- Step 1: Name + Purpose -->
        <div v-if="step === 1" class="space-y-4">
          <div>
            <label class="text-sm font-medium mb-1.5 block">Pocket name</label>
            <Input
              v-model="name"
              placeholder="e.g. Emergency Fund"
              class="h-12"
            />
          </div>
          <div>
            <label class="text-sm font-medium mb-1.5 block">Purpose</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="opt in purposeOptions"
                :key="opt"
                class="px-3 py-2 text-xs rounded-lg border transition-all"
                :class="purpose === opt
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:border-primary/30 text-muted-foreground'"
                @click="purpose = purpose === opt ? '' : opt"
              >
                {{ opt }}
              </button>
            </div>
          </div>
          <Button
            class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            :disabled="!canProceedStep1"
            @click="step++"
          >
            Next
            <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1.5" />
          </Button>
        </div>

        <!-- Step 2: Target + Timeline -->
        <div v-else-if="step === 2" class="space-y-4">
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
          <div class="flex gap-3">
            <Button variant="outline" class="flex-1" @click="step--">
              <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
              Back
            </Button>
            <Button
              class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              @click="step++"
            >
              Next
              <Icon name="lucide:arrow-right" class="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </div>

        <!-- Step 3: Quiz + Recommendation -->
        <div v-else class="space-y-3">
          <!-- Phase: Quiz questions -->
          <template v-if="quizPhase === 'quiz'">
            <div class="flex items-center justify-center gap-1.5 mb-2">
              <div
                v-for="(_, qi) in QUIZ_QUESTIONS"
                :key="qi"
                class="w-2 h-2 rounded-full transition-colors"
                :class="qi <= quizStep ? 'bg-primary' : 'bg-muted'"
              />
            </div>

            <div class="text-center py-2">
              <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Icon :name="currentQuestion.icon" class="w-6 h-6 text-primary" />
              </div>
              <h3 class="text-base font-semibold mb-1">
                {{ currentQuestion.question }}
              </h3>
              <p class="text-xs text-muted-foreground">
                {{ currentQuestion.subtitle }}
              </p>
            </div>

            <div class="space-y-2 pt-2">
              <button
                v-for="opt in currentQuestion.options"
                :key="opt.value"
                class="w-full px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-all"
                :class="quizAnswers[quizStep] === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/30'"
                @click="selectQuizAnswer(opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>

            <div class="pt-2">
              <Button variant="outline" class="w-full" @click="quizBack">
                <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
                Back
              </Button>
            </div>
          </template>

          <!-- Phase: Recommendation result -->
          <template v-else>
            <div class="mb-3">
              <p class="text-xs font-medium text-primary mb-2 flex items-center gap-1.5">
                <Icon name="lucide:sparkles" class="w-3.5 h-3.5" />
                Recommended for you
              </p>
              <div
                v-if="recommendedStrategy"
                class="p-4 rounded-xl border-2 cursor-pointer transition-all"
                :class="risk === recommendedStrategy
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/30'"
                @click="risk = recommendedStrategy"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-xl flex items-center justify-center"
                    :class="{
                      'bg-emerald-500/10': recommendedStrategy === 'conservative',
                      'bg-blue-500/10': recommendedStrategy === 'balanced',
                      'bg-violet-500/10': recommendedStrategy === 'aggressive',
                    }"
                  >
                    <Icon
                      :name="STRATEGIES[recommendedStrategy].icon"
                      class="w-5 h-5"
                      :class="RISK_LABELS[recommendedStrategy]?.color"
                    />
                  </div>
                  <div class="flex-1">
                    <p class="font-semibold text-sm">{{ STRATEGIES[recommendedStrategy].label }}</p>
                    <p class="text-xs text-muted-foreground">{{ STRATEGIES[recommendedStrategy].subtitle }}</p>
                  </div>
                  <Badge
                    variant="outline"
                    class="text-xs"
                    :class="{
                      'border-emerald-500/30 text-emerald-500': STRATEGIES[recommendedStrategy].risk === 'low',
                      'border-amber-500/30 text-amber-500': STRATEGIES[recommendedStrategy].risk === 'medium',
                      'border-red-500/30 text-red-500': STRATEGIES[recommendedStrategy].risk === 'high',
                    }"
                  >
                    {{ RISK_LABELS[recommendedStrategy]?.label }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {{ RECOMMENDATION_REASONS[recommendedStrategy] }}
                </p>
                <div v-if="recommendedStrategy" class="mt-3 pt-3 border-t space-y-2">
                  <div class="flex items-start gap-2">
                    <Icon name="lucide:check-circle" class="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                    <p class="text-[11px] text-muted-foreground"><span class="font-medium text-foreground/80">Best for:</span> {{ STRATEGIES[recommendedStrategy].bestFor }}</p>
                  </div>
                  <div class="flex items-start gap-2">
                    <Icon name="lucide:alert-circle" class="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <p class="text-[11px] text-muted-foreground"><span class="font-medium text-foreground/80">Not ideal for:</span> {{ STRATEGIES[recommendedStrategy].notIdealFor }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p class="text-xs text-muted-foreground mb-2">Or choose a different strategy</p>
              <div class="space-y-2">
                <div
                  v-for="s in STRATEGY_LIST.filter(s => s.key !== recommendedStrategy)"
                  :key="s.key"
                  class="p-3 rounded-xl border-2 cursor-pointer transition-all"
                  :class="risk === s.key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'"
                  @click="risk = s.key"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-lg flex items-center justify-center"
                      :class="{
                        'bg-emerald-500/10': s.key === 'conservative',
                        'bg-blue-500/10': s.key === 'balanced',
                        'bg-violet-500/10': s.key === 'aggressive',
                      }"
                    >
                      <Icon :name="s.icon" class="w-4 h-4" :class="RISK_LABELS[s.key]?.color" />
                    </div>
                    <div class="flex-1">
                      <p class="font-medium text-sm">{{ s.label }}</p>
                      <p class="text-xs text-muted-foreground">{{ s.subtitle }}</p>
                    </div>
                    <Badge
                      variant="outline"
                      class="text-xs"
                      :class="{
                        'border-emerald-500/30 text-emerald-500': s.risk === 'low',
                        'border-amber-500/30 text-amber-500': s.risk === 'medium',
                        'border-red-500/30 text-red-500': s.risk === 'high',
                      }"
                    >
                      {{ RISK_LABELS[s.key]?.label }}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <Button variant="outline" class="flex-1" @click="quizBack">
                <Icon name="lucide:arrow-left" class="w-4 h-4 mr-1.5" />
                Back
              </Button>
              <Button
                class="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                :disabled="!canCreate || creating"
                @click="handleCreate"
              >
                <Icon v-if="creating" name="lucide:loader-2" class="w-4 h-4 mr-1.5 animate-spin" />
                Create Pocket
              </Button>
            </div>
          </template>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
