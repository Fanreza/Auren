import { STRATEGIES, type StrategyKey } from '~/config/strategies'
import type { DbPocket } from '~/types/database'

export type ReminderLevel = 'info' | 'warning' | 'urgent'

export interface DepositReminder {
  pocket: DbPocket
  level: ReminderLevel
  daysUntilDue: number
  formattedAmount: string
  nextDue: Date
}

export function useDepositReminders(pockets: Ref<DbPocket[]>) {
  const reminders = computed<DepositReminder[]>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const results: DepositReminder[] = []

    for (const pocket of pockets.value) {
      if (pocket.recurring_next_due == null || pocket.recurring_amount == null) continue

      const nextDue = new Date(pocket.recurring_next_due + 'T00:00:00')
      const diffMs = nextDue.getTime() - today.getTime()
      const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      let level: ReminderLevel | null = null
      if (daysUntilDue <= 0) level = 'urgent'
      else if (daysUntilDue <= 1) level = 'warning'
      else if (daysUntilDue <= 7) level = 'info'

      if (level) {
        const strategy = STRATEGIES[pocket.strategy_key as StrategyKey]
        results.push({
          pocket,
          level,
          daysUntilDue,
          formattedAmount: `${pocket.recurring_amount} ${strategy?.assetSymbol ?? ''}`,
          nextDue,
        })
      }
    }

    return results.sort((a, b) => a.daysUntilDue - b.daysUntilDue)
  })

  return { reminders }
}

export function computeNextDue(recurringDay: number, afterDate: Date): string {
  let month = afterDate.getMonth()
  let year = afterDate.getFullYear()

  // Check if we can still use this month
  const todayDay = afterDate.getDate()
  const thisMonthMax = new Date(year, month + 1, 0).getDate()
  const effectiveDay = recurringDay === 0 ? thisMonthMax : Math.min(recurringDay, thisMonthMax)

  if (todayDay < effectiveDay) {
    // Due date hasn't passed this month yet
    const day = recurringDay === 0 ? thisMonthMax : Math.min(recurringDay, thisMonthMax)
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // Move to next month
  month += 1
  if (month > 11) { month = 0; year++ }

  const maxDay = new Date(year, month + 1, 0).getDate()
  const day = recurringDay === 0 ? maxDay : Math.min(recurringDay, maxDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
