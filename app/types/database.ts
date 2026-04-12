export interface DbUser {
  id: string
  address: string
  display_name: string | null
  referral_code: string | null
  referred_by: string | null
  referral_count: number
  created_at: string
  updated_at: string
}

export interface DbPocket {
  id: string
  user_id: string
  name: string
  purpose: string | null
  timeline: string | null
  target_amount: number | null
  /** Display category for icon/color/grouping. Actual deposit target = vault_address. */
  strategy_key: string
  /** Vault address this pocket deposits into (1 vault = 1 pocket, unique per user). */
  vault_address: string | null
  vault_chain_id: number | null
  vault_protocol: string | null
  vault_symbol: string | null
  vault_asset: string | null
  recurring_day: number | null
  recurring_amount: string | null
  recurring_next_due: string | null
  created_at: string
  updated_at: string
}

export interface CreatePocketInput {
  user_id: string
  name: string
  purpose?: string
  timeline?: string
  target_amount?: number
  strategy_key: string
  vault_address: string
  vault_chain_id: number
  vault_protocol: string
  vault_symbol: string
  vault_asset: string
}

export interface UpdatePocketInput {
  name?: string
  purpose?: string
  timeline?: string
  target_amount?: number
  strategy_key?: string
  recurring_day?: number | null
  recurring_amount?: string | null
  recurring_next_due?: string | null
}

export interface DbTransaction {
  id: string
  pocket_id: string | null
  strategy_id: string | null
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  amount: string
  asset_symbol: string
  tx_hash: string
  timestamp: number
  created_at: string
}

export interface CreateTransactionInput {
  pocket_id?: string
  strategy_id?: string
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  amount: string
  asset_symbol: string
  tx_hash: string
  timestamp: number
}

// ── Strategies (Phase 2) ────────────────────────────────────────────────────
export type StrategyVisibility = 'private' | 'unlisted' | 'public'
export type StrategyRiskLevel = 'low' | 'medium' | 'high'

export interface DbStrategy {
  id: string
  creator_id: string | null
  name: string
  description: string | null
  risk_level: StrategyRiskLevel | null
  visibility: StrategyVisibility
  is_system: boolean
  forked_from_id: string | null
  cover_color: string | null
  icon: string | null
  follower_count: number
  total_tvl_usd: number
  avg_apy_pct: number
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DbStrategyAllocation {
  id: string
  strategy_id: string
  vault_address: string
  vault_chain_id: number
  protocol: string | null
  vault_symbol: string | null
  asset_symbol: string | null
  asset_address: string | null
  weight: number
  display_order: number
}

export interface StrategyWithAllocations extends DbStrategy {
  allocations: DbStrategyAllocation[]
}

export interface CreateStrategyInput {
  creator_id: string
  name: string
  description?: string
  risk_level?: StrategyRiskLevel
  visibility: StrategyVisibility
  forked_from_id?: string
  cover_color?: string
  icon?: string
  allocations: Array<{
    vault_address: string
    vault_chain_id: number
    protocol: string
    vault_symbol: string
    asset_symbol: string
    asset_address: string
    weight: number
    display_order: number
  }>
}
