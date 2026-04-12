/**
 * Achievement system — derives unlocks purely from current state.
 * No backend writes; everything is computed live from store data + localStorage streak.
 */
import { useStreak } from '~/composables/useStreak'

export interface AchievementDef {
  key: string
  name: string
  description: string
  emoji: string
  /** Threshold value for sorting/display */
  tier: 'starter' | 'bronze' | 'silver' | 'gold' | 'legendary'
}

export interface AchievementUnlock extends AchievementDef {
  unlockedAt?: number
  progress?: { current: number; target: number }
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Onboarding
  { key: 'first_pocket',     name: 'First step',         description: 'Created your first pocket',                    emoji: '🌱', tier: 'starter' },
  { key: 'first_deposit',    name: 'Off the line',       description: 'Made your first deposit',                      emoji: '💰', tier: 'starter' },
  { key: 'set_goal',         name: 'Goal-setter',        description: 'Created a pocket with a target amount',        emoji: '🎯', tier: 'starter' },
  { key: 'set_reminder',     name: 'On schedule',        description: 'Set a recurring deposit reminder',             emoji: '📅', tier: 'starter' },
  // Saving milestones
  { key: 'saved_10',         name: 'Saved $10',          description: 'Reached $10 in total savings',                 emoji: '💵', tier: 'bronze' },
  { key: 'saved_100',        name: 'Saved $100',         description: 'Reached $100 in total savings',                emoji: '💶', tier: 'bronze' },
  { key: 'saved_1000',       name: 'Saved $1,000',       description: 'Reached $1,000 in total savings',              emoji: '💷', tier: 'silver' },
  { key: 'saved_10000',      name: 'Saved $10K',         description: 'Reached $10,000 in total savings',             emoji: '💎', tier: 'gold' },
  // Streaks
  { key: 'streak_7',         name: 'Week-long',          description: '7-day saving streak',                          emoji: '🔥', tier: 'bronze' },
  { key: 'streak_30',        name: 'Monthly devotee',    description: '30-day saving streak',                         emoji: '⚡', tier: 'silver' },
  { key: 'streak_100',       name: 'Centurion',          description: '100-day saving streak',                        emoji: '👑', tier: 'gold' },
  { key: 'streak_365',       name: 'Year warrior',       description: '365-day saving streak',                        emoji: '🏆', tier: 'legendary' },
  // Yield earned
  { key: 'yield_1',          name: 'First yield',        description: 'Earned $1 in yield',                           emoji: '✨', tier: 'bronze' },
  { key: 'yield_100',        name: 'Compounding',        description: 'Earned $100 in yield',                         emoji: '📈', tier: 'silver' },
  // Diversification
  { key: 'multi_strategy',   name: 'Diversified',        description: 'Created pockets in 2+ different strategies',   emoji: '🧩', tier: 'silver' },
  { key: 'all_strategies',   name: 'Full spectrum',      description: 'Active pockets in all 3 strategies',           emoji: '🌈', tier: 'gold' },
]

export interface AchievementsInput {
  totalSavedUsd: number
  yieldEarnedUsd: number
  streakDays: number
  pocketCount: number
  uniqueStrategies: number
  hasGoal: boolean
  hasReminder: boolean
  depositCount: number
}

export function useAchievements(input: () => AchievementsInput) {
  const streak = useStreak()

  const unlocks = computed<AchievementUnlock[]>(() => {
    const i = input()
    return ACHIEVEMENTS.map(def => {
      let unlocked = false
      let progress: { current: number; target: number } | undefined

      switch (def.key) {
        case 'first_pocket':   unlocked = i.pocketCount >= 1; break
        case 'first_deposit':  unlocked = i.depositCount >= 1; break
        case 'set_goal':       unlocked = i.hasGoal; break
        case 'set_reminder':   unlocked = i.hasReminder; break
        case 'saved_10':       unlocked = i.totalSavedUsd >= 10;     progress = { current: i.totalSavedUsd, target: 10 }; break
        case 'saved_100':      unlocked = i.totalSavedUsd >= 100;    progress = { current: i.totalSavedUsd, target: 100 }; break
        case 'saved_1000':     unlocked = i.totalSavedUsd >= 1000;   progress = { current: i.totalSavedUsd, target: 1000 }; break
        case 'saved_10000':    unlocked = i.totalSavedUsd >= 10000;  progress = { current: i.totalSavedUsd, target: 10000 }; break
        case 'streak_7':       unlocked = i.streakDays >= 7;    progress = { current: i.streakDays, target: 7 }; break
        case 'streak_30':      unlocked = i.streakDays >= 30;   progress = { current: i.streakDays, target: 30 }; break
        case 'streak_100':     unlocked = i.streakDays >= 100;  progress = { current: i.streakDays, target: 100 }; break
        case 'streak_365':     unlocked = i.streakDays >= 365;  progress = { current: i.streakDays, target: 365 }; break
        case 'yield_1':        unlocked = i.yieldEarnedUsd >= 1;   progress = { current: i.yieldEarnedUsd, target: 1 }; break
        case 'yield_100':      unlocked = i.yieldEarnedUsd >= 100; progress = { current: i.yieldEarnedUsd, target: 100 }; break
        case 'multi_strategy': unlocked = i.uniqueStrategies >= 2; break
        case 'all_strategies': unlocked = i.uniqueStrategies >= 3; break
      }

      return { ...def, progress, unlockedAt: unlocked ? Date.now() : undefined }
    })
  })

  const unlockedCount = computed(() => unlocks.value.filter(u => u.unlockedAt).length)
  const totalCount = computed(() => ACHIEVEMENTS.length)

  return {
    unlocks,
    unlockedCount,
    totalCount,
    streakDays: streak.current,
  }
}
