/**
 * Shared vault-filter policy.
 *
 * Single source of truth for "is this vault safe/useful to surface?".
 * Used by useVaultCatalog (curated + open) and useEarnStore so the Earn tab,
 * strategy builder, and pocket picker all apply identical rules.
 */

export const MIN_VAULT_TVL_USD = 10_000_000
export const MIN_VAULT_APY = 0.01

export interface VaultFilterOptions {
  /** If set, vault.underlyingTokens[0].address must equal this (lowercased). */
  canonicalUnderlying?: string
  /** Shared dedupe set across calls — mutated in place. */
  seen?: Set<string>
}

export function normalizeApy(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '0')) || 0
  return n > 1 ? n / 100 : n
}

export function passesVaultFilter(v: any, opts: VaultFilterOptions = {}): boolean {
  if (v.isTransactional !== true) return false
  if (v.isRedeemable !== true) return false
  if (v.timeLock && v.timeLock > 0) return false

  const apy = normalizeApy(v.analytics?.apy?.total)
  if (!(apy >= MIN_VAULT_APY)) return false

  const underlying = v.underlyingTokens?.[0]
  if (!underlying?.address) return false
  if (opts.canonicalUnderlying && underlying.address.toLowerCase() !== opts.canonicalUnderlying) {
    return false
  }

  const addr = v.address?.toLowerCase()
  if (!addr) return false
  if (opts.seen) {
    if (opts.seen.has(addr)) return false
    opts.seen.add(addr)
  }
  return true
}
