export function calcYearBadges(sessions) {
  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))]
  const badges = {}
  years.forEach(year => {
    const yearSessions = sessions.filter(s => s.date.startsWith(year))
    const profitMap = {}
    yearSessions.forEach(s => {
      profitMap[s.player_name] = (profitMap[s.player_name] || 0) + (s.cash_out - s.buy_in)
    })
    const ranked = Object.entries(profitMap).sort((a, b) => b[1] - a[1]).slice(0, 3)
    ranked.forEach(([name], i) => {
      if (!badges[name]) badges[name] = []
      const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'
      badges[name].push({ year: year.slice(2), place: i + 1, emoji })
    })
  })
  return badges
}
