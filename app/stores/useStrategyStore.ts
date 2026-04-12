import { defineStore } from 'pinia'
import type { DbStrategyAllocation, StrategyWithAllocations, CreateStrategyInput } from '~/types/database'

export const useStrategyStore = defineStore('strategy', () => {
  const publicStrategies = ref<StrategyWithAllocations[]>([])
  const myStrategies = ref<StrategyWithAllocations[]>([])
  const loading = ref(false)
  const error = ref('')

  async function fetchPublic() {
    loading.value = true
    error.value = ''
    try {
      const data = await $fetch<any[]>('/api/strategies', {
        query: { visibility: 'public', limit: 50 },
      })
      publicStrategies.value = (data ?? []).map(normalize)
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? 'Failed to load strategies'
    } finally {
      loading.value = false
    }
  }

  async function fetchMine(userId: string) {
    loading.value = true
    try {
      const data = await $fetch<any[]>('/api/strategies', {
        query: { creator_id: userId, limit: 100 },
      })
      myStrategies.value = (data ?? []).map(normalize)
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? 'Failed to load your strategies'
    } finally {
      loading.value = false
    }
  }

  async function fetchById(id: string): Promise<StrategyWithAllocations | null> {
    try {
      const data = await $fetch<any>(`/api/strategies/${id}`)
      return normalize(data)
    } catch (e: any) {
      console.error('[strategyStore] fetchById failed', e)
      return null
    }
  }

  async function create(input: CreateStrategyInput): Promise<StrategyWithAllocations | null> {
    try {
      const data = await $fetch<any>('/api/strategies', {
        method: 'POST',
        body: input,
      })
      const strat = normalize(data)
      myStrategies.value = [strat, ...myStrategies.value]
      return strat
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? 'Failed to create strategy'
      return null
    }
  }

  async function toggleFollow(strategyId: string, userId: string): Promise<boolean> {
    try {
      const res = await $fetch<{ following: boolean }>(`/api/strategies/${strategyId}/follow`, {
        method: 'POST',
        body: { user_id: userId },
      })
      // Update local counts
      const target = [...publicStrategies.value, ...myStrategies.value]
        .find(s => s.id === strategyId)
      if (target) {
        target.follower_count += res.following ? 1 : -1
      }
      return res.following
    } catch (e) {
      console.error('[strategyStore] toggleFollow failed', e)
      return false
    }
  }

  async function fork(strategyId: string, userId: string, name?: string): Promise<StrategyWithAllocations | null> {
    try {
      const data = await $fetch<any>(`/api/strategies/${strategyId}/fork`, {
        method: 'POST',
        body: { user_id: userId, name },
      })
      const forked = normalize(data)
      myStrategies.value = [forked, ...myStrategies.value]

      // Bump the source strategy's follower_count in local caches so marketplace
      // + detail reflect the new count immediately (server already incremented).
      const bumpInList = (list: StrategyWithAllocations[]) => {
        const idx = list.findIndex(s => s.id === strategyId)
        if (idx !== -1) list[idx] = { ...list[idx]!, follower_count: list[idx]!.follower_count + 1 }
      }
      bumpInList(publicStrategies.value)
      bumpInList(myStrategies.value)

      return forked
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? 'Failed to fork strategy'
      return null
    }
  }

  async function updateStrategy(
    id: string,
    userId: string,
    patch: Partial<CreateStrategyInput>,
  ): Promise<StrategyWithAllocations | null> {
    try {
      const data = await $fetch<any>(`/api/strategies/${id}`, {
        method: 'PATCH',
        body: { user_id: userId, ...patch },
      })
      const updated = normalize(data)
      // Sync local lists
      const syncList = (list: StrategyWithAllocations[]) => {
        const idx = list.findIndex(s => s.id === id)
        if (idx !== -1) list[idx] = updated
      }
      syncList(myStrategies.value)
      syncList(publicStrategies.value)
      return updated
    } catch (e: any) {
      error.value = e?.data?.message ?? e?.message ?? 'Failed to update strategy'
      return null
    }
  }

  async function deleteStrategy(id: string, userId: string): Promise<boolean> {
    try {
      await $fetch(`/api/strategies/${id}`, {
        method: 'DELETE',
        body: { user_id: userId },
      })
      myStrategies.value = myStrategies.value.filter(s => s.id !== id)
      return true
    } catch (e) {
      console.error('[strategyStore] deleteStrategy failed', e)
      return false
    }
  }

  return {
    publicStrategies,
    myStrategies,
    loading,
    error,
    fetchPublic,
    fetchMine,
    fetchById,
    create,
    updateStrategy,
    fork,
    toggleFollow,
    deleteStrategy,
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────
function normalize(raw: any): StrategyWithAllocations {
  return {
    ...raw,
    allocations: (raw.strategy_allocations ?? []).sort(
      (a: DbStrategyAllocation, b: DbStrategyAllocation) => a.display_order - b.display_order,
    ),
  }
}
