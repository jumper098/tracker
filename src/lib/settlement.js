/**
 * Calculates fair settlement for a poker night.
 * 
 * If losses > wins (someone undercounted cashout):
 *   → Difference split equally among all losers
 *   → Each loser pays equally less
 * 
 * If wins > losses (someone overcounted cashout):
 *   → Difference split equally among all winners
 *   → Each winner gets equally less
 */
export function calcSettlement(nightSessions) {
  const rawProfits = {}
  nightSessions.forEach(s => {
    rawProfits[s.player_name] = (rawProfits[s.player_name] || 0) + (s.cash_out - s.buy_in)
  })

  const totalWinnings = Object.values(rawProfits).filter(p => p > 0).reduce((s, p) => s + p, 0)
  const totalLosses   = Object.values(rawProfits).filter(p => p < 0).reduce((s, p) => s + Math.abs(p), 0)

  const adjusted = { ...rawProfits }
  let adjustmentNote = null

  if (Math.abs(totalWinnings - totalLosses) > 0.01) {
    const diff = totalLosses - totalWinnings // positive = losses > wins

    if (diff > 0) {
      // Losses > Wins: split difference equally among losers → each pays less
      const losers = Object.keys(adjusted).filter(n => adjusted[n] < 0)
      const reduction = diff / losers.length
      losers.forEach(name => {
        adjusted[name] = Math.round((adjusted[name] + reduction) * 100) / 100
      })
      adjustmentNote = `${diff.toFixed(2)}€ gleichmäßig auf ${losers.length} Verlierer aufgeteilt — jeder zahlt ${reduction.toFixed(2)}€ weniger`
    } else {
      // Wins > Losses: split difference equally among winners → each gets less
      const absDiff = Math.abs(diff)
      const winners = Object.keys(adjusted).filter(n => adjusted[n] > 0)
      const reduction = absDiff / winners.length
      winners.forEach(name => {
        adjusted[name] = Math.round((adjusted[name] - reduction) * 100) / 100
      })
      adjustmentNote = `${absDiff.toFixed(2)}€ gleichmäßig auf ${winners.length} Gewinner aufgeteilt — jeder bekommt ${reduction.toFixed(2)}€ weniger`
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
