/**
 * Vault health + risk scoring composable.
 *
 * Composite signals (from LI.FI Earn API metadata + onchain TVL trend):
 *  - TVL size (bigger = more battle-tested)
 *  - Protocol reputation (Morpho/Aave/Yearn = green; new protocol = amber)
 *  - Vault age (we don't have createdAt — proxy via vault appearing in older snapshots)
 *  - Whether Composer can route to it (we already filter for this)
 *
 * Returns a 1-5 star score + per-signal status badges.
 */
import type { LifiAllocData } from '~/stores/useProfileStore'

export type HealthBadge = {
  key: string
  label: string
  status: 'good' | 'warn' | 'bad' | 'unknown'
  detail: string
}

export type VaultHealth = {
  /** 1 (worst) to 5 (best) */
  score: number
  /** Plain-language one-liner */
  summary: string
  badges: HealthBadge[]
}

const TRUSTED_PROTOCOLS = new Set([
  'morpho',
  'morpho-v1',
  'morpho-blue',
  'aave',
  'aave-v3',
  'yearn',
  'yearn-v3',
  'compound',
  'compound-v3',
])

function tvlBadge(tvlUsd: number): HealthBadge {
  if (tvlUsd >= 100_000_000) {
    return { key: 'tvl', label: 'Battle-tested TVL', status: 'good', detail: `$${(tvlUsd / 1_000_000).toFixed(0)}M deposited` }
  }
  if (tvlUsd >= 10_000_000) {
    return { key: 'tvl', label: 'Healthy TVL', status: 'good', detail: `$${(tvlUsd / 1_000_000).toFixed(0)}M deposited` }
  }
  if (tvlUsd >= 1_000_000) {
    return { key: 'tvl', label: 'Lower TVL', status: 'warn', detail: `Only $${(tvlUsd / 1_000_000).toFixed(1)}M — newer or niche vault` }
  }
  return { key: 'tvl', label: 'Very low TVL', status: 'bad', detail: 'Less than $1M — exercise caution' }
}

function protocolBadge(protocol: string): HealthBadge {
  const norm = protocol.toLowerCase()
  if (TRUSTED_PROTOCOLS.has(norm)) {
    return {
      key: 'protocol',
      label: 'Trusted protocol',
      status: 'good',
      detail: `${protocol} is a top-tier DeFi lending protocol with multiple audits`,
    }
  }
  return {
    key: 'protocol',
    label: 'Less common protocol',
    status: 'warn',
    detail: `${protocol} is not in our short-list of established protocols`,
  }
}

function composerBadge(): HealthBadge {
  // We only include Composer-compatible vaults in lifiVaultAddresses, so this is always good
  return {
    key: 'composer',
    label: 'Single-tx routing',
    status: 'good',
    detail: 'Deposits and withdrawals execute in one transaction via LI.FI Composer',
  }
}

function apyBadge(apy: number): HealthBadge {
  // Decimal e.g. 0.047
  if (apy <= 0) return { key: 'apy', label: 'No APY data', status: 'unknown', detail: 'APY feed is currently unavailable' }
  if (apy >= 0.20) return { key: 'apy', label: 'Suspiciously high APY', status: 'bad', detail: `${(apy * 100).toFixed(1)}% APY — verify the source before depositing` }
  if (apy >= 0.10) return { key: 'apy', label: 'High APY', status: 'warn', detail: `${(apy * 100).toFixed(1)}% — likely includes rewards or leverage` }
  return { key: 'apy', label: 'Realistic APY', status: 'good', detail: `${(apy * 100).toFixed(2)}% — within sustainable range` }
}

export function computeVaultHealth(vault: LifiAllocData): VaultHealth {
  const badges: HealthBadge[] = [
    tvlBadge(vault.tvl ?? 0),
    protocolBadge(vault.protocol ?? ''),
    composerBadge(),
    apyBadge(vault.apy ?? 0),
  ]

  // Score: count good = +1, warn = 0, bad = -1, then map to 1-5
  let raw = 0
  for (const b of badges) {
    if (b.status === 'good') raw += 1
    else if (b.status === 'bad') raw -= 1
  }
  // raw range: -4 to +4 → map to 1-5
  const score = Math.max(1, Math.min(5, Math.round(((raw + 4) / 8) * 4) + 1))

  let summary: string
  if (score >= 5) summary = 'Battle-tested vault — strong on every signal'
  else if (score >= 4) summary = 'Healthy vault — minor caveats'
  else if (score >= 3) summary = 'Average risk — review the badges'
  else if (score >= 2) summary = 'Higher risk — proceed with caution'
  else summary = 'High risk — only deposit what you can afford to lose'

  return { score, summary, badges }
}

/** Aggregate risk score across multiple vaults (e.g. all vaults in a pocket). */
export function computePocketHealth(vaults: LifiAllocData[]): VaultHealth | null {
  if (!vaults.length) return null
  // Weight by TVL — bigger vaults dominate the score
  const totalTvl = vaults.reduce((s, v) => s + (v.tvl ?? 0), 0)
  if (totalTvl <= 0) return computeVaultHealth(vaults[0]!)

  let weightedScore = 0
  for (const v of vaults) {
    const w = (v.tvl ?? 0) / totalTvl
    weightedScore += computeVaultHealth(v).score * w
  }
  const score = Math.round(weightedScore)
  // Use the lowest-scoring vault's badges so user sees the weakest link
  const worst = vaults
    .map(v => computeVaultHealth(v))
    .sort((a, b) => a.score - b.score)[0]!

  return {
    score,
    summary: worst.score < 4 ? `Weakest vault: ${worst.summary}` : 'All vaults are healthy',
    badges: worst.badges,
  }
}
