/**
 * Saving streak tracker — persists last check-in date in localStorage
 * and increments a streak counter when user visits on consecutive days.
 *
 * Streak logic:
 *  - Same day visit → streak unchanged
 *  - Next day visit → streak + 1
 *  - Skipped a day → streak resets to 1
 */
import { BRAND } from '~/config/brand'

const STREAK_KEY = `${BRAND.storagePrefix}_streak`
const BEST_KEY = `${BRAND.storagePrefix}_streak_best`
const LAST_VISIT_KEY = `${BRAND.storagePrefix}_streak_last_visit`

interface StreakState {
  current: number
  best: number
  lastVisitISO: string | null
}

const state = ref<StreakState>({ current: 0, best: 0, lastVisitISO: null })
let initialized = false

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00').getTime()
  const db = new Date(b + 'T00:00:00').getTime()
  return Math.round((db - da) / (1000 * 60 * 60 * 24))
}

function load() {
  if (typeof localStorage === 'undefined') return
  const current = parseInt(localStorage.getItem(STREAK_KEY) ?? '0', 10) || 0
  const best = parseInt(localStorage.getItem(BEST_KEY) ?? '0', 10) || 0
  const lastVisitISO = localStorage.getItem(LAST_VISIT_KEY)
  state.value = { current, best, lastVisitISO }
}

function save() {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STREAK_KEY, String(state.value.current))
  localStorage.setItem(BEST_KEY, String(state.value.best))
  if (state.value.lastVisitISO) localStorage.setItem(LAST_VISIT_KEY, state.value.lastVisitISO)
}

/** Call once per app load to register a check-in. Idempotent within the same day. */
function checkIn() {
  const today = todayKey()
  const last = state.value.lastVisitISO

  if (!last) {
    // First ever check-in
    state.value.current = 1
    state.value.best = Math.max(1, state.value.best)
    state.value.lastVisitISO = today
    save()
    return
  }

  if (last === today) return  // already checked in today

  const gap = daysBetween(last, today)
  if (gap === 1) {
    // Consecutive day → increment
    state.value.current += 1
    state.value.best = Math.max(state.value.best, state.value.current)
  } else if (gap > 1) {
    // Streak broken → reset
    state.value.current = 1
  }
  state.value.lastVisitISO = today
  save()
}

export function useStreak() {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true
    load()
    checkIn()
  }

  const flameLevel = computed(() => {
    const c = state.value.current
    if (c >= 365) return 'legendary'
    if (c >= 100) return 'epic'
    if (c >= 30)  return 'on-fire'
    if (c >= 7)   return 'warming'
    return 'starter'
  })

  const flameEmoji = computed(() => {
    switch (flameLevel.value) {
      case 'legendary': return '🏆'
      case 'epic':      return '👑'
      case 'on-fire':   return '🔥'
      case 'warming':   return '✨'
      default:          return '💫'
    }
  })

  return {
    current: computed(() => state.value.current),
    best: computed(() => state.value.best),
    lastVisitISO: computed(() => state.value.lastVisitISO),
    flameLevel,
    flameEmoji,
  }
}
