/**
 * Calculates fair settlement for a poker night.
 * 
 * Handles two edge cases:
 * 1. Total profits > total buy-ins → proportionally reduce winnings
 * 2. Total profits < total buy-ins → reduce each loser's debt proportionally
 */
export function calcSettlement(nightSessions) {
  const totalBuyins = nightSessions.reduce((s, e) => s + e.buy_in, 0)

  // Raw profits per player
  const rawProfits = {}
  nightSessions.forEach(s => {
    rawProfits[s.player_name] = (rawProfits[s.player_name] || 0) + (s.cash_out - s.buy_in)
  })

  const totalWinnings = Object.values(rawProfits).filter(p => p > 0).reduce((s, p) => s + p, 0)
  const totalLosses   = Object.values(rawProfits).filter(p => p < 0).reduce((s, p) => s + Math.abs(p), 0)

  const adjusted = { ...rawProfits }

  if (totalWinnings > totalBuyins && totalWinnings > 0) {
    // Case 1: Too much won — scale down winners proportionally
    const factor = totalBuyins / totalWinnings
    Object.keys(adjusted).forEach(name => {
      if (adjusted[name] > 0) adjusted[name] = Math.round(adjusted[name] * factor * 100) / 100
    })
  } else if (totalLosses > totalWinnings && totalLosses > 0) {
    // Case 2: Too little won — reduce each loser's debt proportionally
    const missing = totalLosses - totalWinnings
    const factor = totalWinnings / totalLosses // scale down losses
    Object.keys(adjusted).forEach(name => {
      if (adjusted[name] < 0) adjusted[name] = Math.round(adjusted[name] * factor * 100) / 100
    })
  }

  // Now calculate minimum transfers
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

  // Info about adjustments
  const wasAdjusted = totalWinnings !== totalLosses
  const adjustmentNote = totalWinnings > totalBuyins
    ? `Gewinne wurden von ${totalWinnings.toFixed(2)}€ auf ${totalBuyins.toFixed(2)}€ gekürzt`
    : totalLosses > totalWinnings
    ? `Verluste wurden um ${(totalLosses - totalWinnings).toFixed(2)}€ reduziert`
    : null

  return { transfers, wasAdjusted, adjustmentNote }
}
