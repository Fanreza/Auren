import type { DbUser, DbPocket, CreatePocketInput, UpdatePocketInput, DbTransaction, CreateTransactionInput } from '~/types/database'

export function useUserData() {
  // ---- User CRUD ----

  async function ensureUser(address: string): Promise<DbUser | null> {
    try {
      return await $fetch<DbUser>('/api/users/ensure', {
        method: 'POST',
        body: { address },
      })
    } catch (e: any) {
      console.error('[useUserData] ensureUser error:', e.message)
      return null
    }
  }

  async function getUser(address: string): Promise<DbUser | null> {
    try {
      return await $fetch<DbUser | null>(`/api/users/${address.toLowerCase()}`)
    } catch {
      return null
    }
  }

  async function updateDisplayName(address: string, name: string): Promise<boolean> {
    try {
      await $fetch(`/api/users/${address.toLowerCase()}`, {
        method: 'PATCH',
        body: { display_name: name },
      })
      return true
    } catch (e: any) {
      console.error('[useUserData] updateDisplayName error:', e.message)
      return false
    }
  }

  // ---- Pocket CRUD ----

  async function getPockets(userId: string): Promise<DbPocket[]> {
    try {
      return await $fetch<DbPocket[]>('/api/pockets', {
        query: { user_id: userId },
      })
    } catch (e: any) {
      console.error('[useUserData] getPockets error:', e.message)
      return []
    }
  }

  async function createPocket(input: CreatePocketInput): Promise<DbPocket | null> {
    try {
      return await $fetch<DbPocket>('/api/pockets', {
        method: 'POST',
        body: input,
      })
    } catch (e: any) {
      console.error('[useUserData] createPocket error:', e.message)
      return null
    }
  }

  async function updatePocket(id: string, input: UpdatePocketInput): Promise<boolean> {
    try {
      await $fetch(`/api/pockets/${id}`, {
        method: 'PATCH',
        body: input,
      })
      return true
    } catch (e: any) {
      console.error('[useUserData] updatePocket error:', e.message)
      return false
    }
  }

  async function deletePocket(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/pockets/${id}`, {
        method: 'DELETE',
      })
      return true
    } catch (e: any) {
      console.error('[useUserData] deletePocket error:', e.message)
      return false
    }
  }

  // ---- Transaction CRUD ----

  async function recordTransaction(input: CreateTransactionInput): Promise<DbTransaction | null> {
    try {
      return await $fetch<DbTransaction>('/api/transactions', {
        method: 'POST',
        body: input,
      })
    } catch (e: any) {
      console.error('[useUserData] recordTransaction error:', e.message)
      return null
    }
  }

  async function getTransactions(pocketId: string): Promise<DbTransaction[]> {
    try {
      return await $fetch<DbTransaction[]>('/api/transactions', {
        query: { pocket_id: pocketId },
      })
    } catch (e: any) {
      console.error('[useUserData] getTransactions error:', e.message)
      return []
    }
  }

  // ---- Referral ----

  async function getReferralCode(address: string, customCode?: string): Promise<string | null> {
    try {
      const res = await $fetch<{ code: string }>('/api/referral/generate', {
        method: 'POST',
        body: { address, code: customCode },
      })
      return res?.code || null
    } catch (e: any) {
      console.error('[useUserData] getReferralCode error:', e.data?.message || e.message)
      return null
    }
  }

  async function getReferralStats(address: string) {
    try {
      return await $fetch<{
        code: string | null
        count: number
        referred_by: string | null
        referrals: { address: string; name: string | null; joined: string }[]
      }>('/api/referral/stats', { params: { address } })
    } catch (e: any) {
      console.error('[useUserData] getReferralStats error:', e.message)
      return null
    }
  }

  async function joinWithReferral(address: string, code: string): Promise<boolean> {
    try {
      await $fetch('/api/referral/join', { method: 'POST', body: { address, code } })
      return true
    } catch (e: any) {
      console.error('[useUserData] joinWithReferral error:', e.message)
      return false
    }
  }

  return {
    ensureUser,
    getUser,
    updateDisplayName,
    getPockets,
    createPocket,
    updatePocket,
    deletePocket,
    recordTransaction,
    getTransactions,
    getReferralCode,
    getReferralStats,
    joinWithReferral,
  }
}
