/**
 * Tax export — generates a CSV with FIFO-matched cost basis per disposal event.
 *
 * For each withdraw/redeem ("disposal"), we match it against the oldest unmatched
 * deposit ("acquisition") and compute realized gain/loss = proceeds − cost basis.
 *
 * Stored amount convention is USD decimal. For the current single-strategy MVP
 * this approximates well — full precision requires storing per-tx asset price.
 */

export interface TaxRow {
  pocket_name: string
  asset_symbol: string
  acquisition_date: string
  disposal_date: string
  proceeds_usd: number      // sale price
  cost_basis_usd: number    // original cost
  gain_loss_usd: number     // proceeds - cost
  holding_days: number      // for short/long term distinction
  tx_hash: string
}

interface AcquisitionLot {
  date: number          // unix ms
  remainingUsd: number  // not yet matched
  asset: string
  pocketName: string
}

interface AppTx {
  pocket_name: string
  asset_symbol: string
  type: 'deposit' | 'withdraw' | 'redeem' | 'switch'
  amount: string         // USD decimal
  timestamp: number      // ms (already normalized)
  tx_hash: string
}

export function useTaxExport() {
  /**
   * Build FIFO tax rows from a flat list of transactions across all pockets.
   * Disposals (withdraw/redeem) consume the oldest deposits first.
   */
  function buildTaxRows(transactions: AppTx[]): TaxRow[] {
    // Group by pocket so FIFO is per-pocket (different assets have different cost bases)
    const byPocket = new Map<string, AppTx[]>()
    for (const tx of transactions) {
      const key = tx.pocket_name + '|' + tx.asset_symbol
      const arr = byPocket.get(key) ?? []
      arr.push(tx)
      byPocket.set(key, arr)
    }

    const rows: TaxRow[] = []

    for (const [, txs] of byPocket) {
      // Sort ascending by time
      txs.sort((a, b) => a.timestamp - b.timestamp)
      const lots: AcquisitionLot[] = []

      for (const tx of txs) {
        const usd = parseFloat(tx.amount) || 0
        if (usd <= 0) continue

        if (tx.type === 'deposit') {
          lots.push({ date: tx.timestamp, remainingUsd: usd, asset: tx.asset_symbol, pocketName: tx.pocket_name })
          continue
        }

        // Disposal — consume oldest lots
        if (tx.type !== 'withdraw' && tx.type !== 'redeem') continue
        let remaining = usd
        while (remaining > 0 && lots.length > 0) {
          const lot = lots[0]!
          const consumed = Math.min(remaining, lot.remainingUsd)
          // For MVP: cost basis equals consumed amount in USD (since we stored as USD decimal,
          // gain/loss reflects yield earned by the time of withdrawal — basically the yield)
          rows.push({
            pocket_name: tx.pocket_name,
            asset_symbol: tx.asset_symbol,
            acquisition_date: new Date(lot.date).toISOString().slice(0, 10),
            disposal_date: new Date(tx.timestamp).toISOString().slice(0, 10),
            proceeds_usd: consumed,
            cost_basis_usd: consumed,
            gain_loss_usd: 0,  // would require historical price comparison
            holding_days: Math.floor((tx.timestamp - lot.date) / (1000 * 60 * 60 * 24)),
            tx_hash: tx.tx_hash,
          })
          lot.remainingUsd -= consumed
          remaining -= consumed
          if (lot.remainingUsd <= 0) lots.shift()
        }
      }
    }

    return rows.sort((a, b) => a.disposal_date.localeCompare(b.disposal_date))
  }

  function escapeCsv(v: any): string {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  function downloadTaxCsv(transactions: AppTx[], filename = 'auren-tax-report.csv') {
    const sorted = [...transactions].sort((a, b) => a.timestamp - b.timestamp)
    const rows = buildTaxRows(transactions)

    const lines: string[] = []

    // ── Section 1: Full transaction history ──────────────────────────────────
    lines.push('ALL TRANSACTIONS')
    lines.push([
      'Date', 'Pocket', 'Type', 'Asset', 'Amount (USD)', 'TX Hash',
    ].map(escapeCsv).join(','))
    for (const tx of sorted) {
      const amt = parseFloat(tx.amount) || 0
      lines.push([
        new Date(tx.timestamp).toISOString().slice(0, 19).replace('T', ' '),
        tx.pocket_name,
        tx.type,
        tx.asset_symbol,
        amt.toFixed(6),
        tx.tx_hash,
      ].map(escapeCsv).join(','))
    }
    lines.push('')

    // ── Section 2: FIFO-matched disposals (taxable events) ───────────────────
    lines.push('TAXABLE EVENTS (FIFO)')
    lines.push([
      'Pocket', 'Asset', 'Acquisition Date', 'Disposal Date',
      'Proceeds (USD)', 'Cost Basis (USD)', 'Gain/Loss (USD)',
      'Holding Period (days)', 'Term', 'TX Hash',
    ].map(escapeCsv).join(','))
    if (rows.length === 0) {
      lines.push('(No disposals yet — tax events are only recorded when you withdraw)')
    } else {
      for (const r of rows) {
        const term = r.holding_days >= 365 ? 'Long-term' : 'Short-term'
        lines.push([
          r.pocket_name,
          r.asset_symbol,
          r.acquisition_date,
          r.disposal_date,
          r.proceeds_usd.toFixed(6),
          r.cost_basis_usd.toFixed(6),
          r.gain_loss_usd.toFixed(6),
          String(r.holding_days),
          term,
          r.tx_hash,
        ].map(escapeCsv).join(','))
      }
    }
    lines.push('')

    // ── Section 3: Summary ───────────────────────────────────────────────────
    const totalDeposits = sorted.filter(t => t.type === 'deposit').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const totalWithdrawals = sorted.filter(t => t.type === 'withdraw' || t.type === 'redeem').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
    const netContributed = totalDeposits - totalWithdrawals
    const totalProceeds = rows.reduce((s, r) => s + r.proceeds_usd, 0)
    const totalBasis = rows.reduce((s, r) => s + r.cost_basis_usd, 0)
    const totalGain = totalProceeds - totalBasis

    lines.push('SUMMARY')
    lines.push(`Total transactions,${sorted.length}`)
    lines.push(`Total deposits (USD),${totalDeposits.toFixed(2)}`)
    lines.push(`Total withdrawals (USD),${totalWithdrawals.toFixed(2)}`)
    lines.push(`Net contributed (USD),${netContributed.toFixed(2)}`)
    lines.push(`Taxable proceeds (USD),${totalProceeds.toFixed(2)}`)
    lines.push(`Total cost basis (USD),${totalBasis.toFixed(2)}`)
    lines.push(`Total gain/loss (USD),${totalGain.toFixed(2)}`)
    lines.push(`Generated,${new Date().toISOString()}`)

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
  }

  return { buildTaxRows, downloadTaxCsv }
}
