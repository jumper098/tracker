/**
 * Calculates fair settlement for a poker night.
 * 
 * Rule: Losers always pay their full amount.
 * If total winnings != total losses, winners get adjusted proportionally.
 * (Both too much and too little won → scale winners to match total losses)
 */
export function calcSettlement(nightSessions) {
  // Raw profits per player
  const rawProfits = {}
  nightSessions.forEach(s => {
    rawProfits[s.player_name] = (rawProfits[s.player_name] || 0) + (s.cash_out - s.buy_in)
  })

  const totalWinnings = Object.values(rawProfits).filter(p => p > 0).reduce((s, p) => s + p, 0)
  const totalLosses   = Object.values(rawProfits).filter(p => p < 0).reduce((s, p) => s + Math.abs(p), 0)

  const adjusted = { ...rawProfits }
  let adjustmentNote = null

  if (Math.abs(totalWinnings - totalLosses) > 0.01) {
    // Scale winners up or down to match total losses
    const factor = totalLosses / totalWinnings
    Object.keys(adjusted).forEach(name => {
      if (adjusted[name] > 0) adjusted[name] = Math.round(adjusted[name] * factor * 100) / 100
    })

    if (totalWinnings > totalLosses) {
      adjustmentNote = `Gewinne gekürzt: ${totalWinnings.toFixed(2)}€ → ${totalLosses.toFixed(2)}€ (Verlierer zahlen vollen Betrag)`
    } else {
      adjustmentNote = `Gewinne angepasst: ${totalWinnings.toFixed(2)}€ → ${totalLosses.toFixed(2)}€ (fehlende ${(totalLosses - totalWinnings).toFixed(2)}€ auf Gewinner aufgeteilt)`
    }
  }

  // Calculate minimum transfers
  const creditors = []
  const debtors = []
  Object.entries(adjusted).forEach(([name, bal]) => {
    const rounded = Math.round(bal * 100) / 100
    if (rounded > 0.005) creditors.push({ name, amount: rounded })
    else if (rounded < -0.005) debtors.push({ name, amount: -rounded })
  })

  creditors.sort((a, b) => b.amount - a.amount)
  debtors.sort((a, b) => b.amount - a.amount)

  const transfers = []
  let ci = 0, di = 0
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const amount = Math.min(c.amount, d.amount)
    transfers.push({ from: d.name, to: c.name, amount: Math.round(amount * 100) / 100 })
    c.amount -= amount
    d.amount -= amount
    if (c.amount < 0.005) ci++
    if (d.amount < 0.005) di++
  }

  return { transfers, adjustmentNote }
}
