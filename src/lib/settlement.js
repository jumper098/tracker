/**
 * Calculates the minimum number of transfers to settle debts for a poker night.
 * Returns array of { from, to, amount }
 */
export function calcSettlement(nightSessions) {
  const balances = {}
  nightSessions.forEach(s => {
    const profit = s.cash_out - s.buy_in
    balances[s.player_name] = (balances[s.player_name] || 0) + profit
  })

  const creditors = []
  const debtors = []
  Object.entries(balances).forEach(([name, bal]) => {
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
  return transfers
}
