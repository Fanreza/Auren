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
  strategy_key: string
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
  pocket_id: string
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  amount: string
  asset_symbol: string
  tx_hash: string
  timestamp: number
  created_at: string
}

export interface CreateTransactionInput {
  pocket_id: string
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  amount: string
  asset_symbol: string
  tx_hash: string
  timestamp: number
}