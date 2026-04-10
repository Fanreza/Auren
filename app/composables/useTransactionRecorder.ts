import type { TxState } from '~/composables/useVault'
import type { DbPocket } from '~/types/database'
import type { Strategy } from '~/config/strategies'
import { computeNextDue } from '~/composables/useDepositReminders'

export interface TransactionRecorderDeps {
  txState: Ref<TxState>
  txHash: Ref<`0x${string}` | null>
  reset: () => void
  selectedPocket: Ref<DbPocket | null>
  selectedStrategy: ComputedRef<Strategy | undefined | null>
  lastTxType: Ref<'deposit' | 'withdraw' | 'redeem'>
  lastTxAmount: Ref<string>
  showDepositDialog: Ref<boolean>
  address: Ref<`0x${string}` | undefined>
  fetchBalances: () => void
  fetchWalletTokens: () => Promise<void> | void
  fetchAllPositions: (addr: string) => Promise<void> | void
  refreshPockets: () => Promise<void> | void
}

export function useTransactionRecorder(deps: TransactionRecorderDeps) {
  const { recordTransaction } = useUserData()

  watch(deps.txState, async (s) => {
    if (s === 'confirmed') {
      if (deps.selectedPocket.value && deps.txHash.value && deps.selectedStrategy.value) {
        await recordTransaction({
          pocket_id: deps.selectedPocket.value.id,
          type: deps.lastTxType.value,
          amount: deps.lastTxAmount.value,
          asset_symbol: deps.selectedStrategy.value.assetSymbol,
          tx_hash: deps.txHash.value,
          timestamp: Math.floor(Date.now() / 1000),
        })
      }

      // Advance recurring schedule if this was a deposit on a scheduled pocket
      if (deps.lastTxType.value === 'deposit' && deps.selectedPocket.value?.recurring_day != null) {
        const nextDue = computeNextDue(deps.selectedPocket.value.recurring_day, new Date())
        await $fetch(`/api/pockets/${deps.selectedPocket.value.id}`, {
          method: 'PATCH',
          body: { recurring_next_due: nextDue },
        }).catch(() => {})
      }

      // Close dialog after showing "All done!" for 1.5s
      setTimeout(() => {
        deps.showDepositDialog.value = false
        deps.reset()
      }, 1500)

      // Wait a moment for RPC to index the new state, then refresh
      await new Promise(r => setTimeout(r, 2000))
      deps.fetchBalances()
      deps.fetchWalletTokens()
      deps.refreshPockets()
      if (deps.address.value) await deps.fetchAllPositions(deps.address.value)
    }
  })
}
