/**
 * Settlement logic:
 * - Winners always get their FULL profit
 * - Losers together pay exactly the total winnings
 * - If losses > winnings: difference split equally among losers (each pays less)
 * - If winnings > losses: difference split equally among winners (each gets less)
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
    if (totalLosses > totalWinnings) {
      // Losses > Winnings → split difference equally among losers, winners get full amount
      const diff = totalLosses - totalWinnings
      const losers = Object.keys(adjusted).filter(n => adjusted[n] < 0)
      const reduction = Math.round((diff / losers.length) * 100) / 100
      losers.forEach(name => {
        adjusted[name] = Math.round((adjusted[name] + reduction) * 100) / 100
      })
      adjustmentNote = `${diff.toFixed(2)}€ auf ${losers.length} Verlierer aufgeteilt — jeder zahlt ${reduction.toFixed(2)}€ weniger · Gewinner erhalten vollen Betrag`
    } else {
      // Winnings > Losses → split difference equally among winners, losers pay full amount
      const diff = totalWinnings - totalLosses
      const winners = Object.keys(adjusted).filter(n => adjusted[n] > 0)
      const reduction = Math.round((diff / winners.length) * 100) / 100
      winners.forEach(name => {
        adjusted[name] = Math.round((adjusted[name] - reduction) * 100) / 100
      })
      adjustmentNote = `${diff.toFixed(2)}€ auf ${winners.length} Gewinner aufgeteilt — jeder bekommt ${reduction.toFixed(2)}€ weniger · Verlierer zahlen vollen Betrag`
    }
  }

  // Minimum transfers
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
    const c = creditors[ci], d = debtors[di]
    const amount = Math.min(c.amount, d.amount)
    transfers.push({ from: d.name, to: c.name, amount: Math.round(amount * 100) / 100 })
    c.amount -= amount; d.amount -= amount
    if (c.amount < 0.005) ci++
    if (d.amount < 0.005) di++
  }

  return { transfers, adjustmentNote }
}
