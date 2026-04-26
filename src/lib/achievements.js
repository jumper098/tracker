export const ACHIEVEMENTS = [
  {
    id: 'first_win', icon: '🏆', name: 'ERSTER SIEG',
    desc: 'Mindestens eine Session mit Gewinn abgeschlossen',
    holders: (stats) => Object.entries(stats).filter(([,p])=>p.wins>=1).map(([n])=>n),
  },
  {
    id: 'big_winner', icon: '💰', name: 'HIGH ROLLER',
    desc: 'Einzel-Gewinn über +100 € in einer Session',
    holders: (stats, all) => [...new Set(all.filter(s=>(s.cash_out-s.buy_in)>=100).map(s=>s.player_name))],
  },
  {
    id: 'profit_king', icon: '👑', name: 'PROFIT KING',
    desc: 'Aktueller Gesamt-Profit über +250 € (live)', live: true,
    holders: (stats) => Object.entries(stats).filter(([,p])=>p.profit>=250).map(([n])=>n),
  },
  {
    id: 'profit_emperor', icon: '💎', name: 'PROFIT EMPEROR',
    desc: 'Aktueller Gesamt-Profit über +500 € (live)', live: true,
    holders: (stats) => Object.entries(stats).filter(([,p])=>p.profit>=500).map(([n])=>n),
  },
  {
    id: 'bad_beat', icon: '💀', name: 'BAD BEAT',
    desc: 'Einzelverlust über -80 € in einer Session',
    holders: (stats, all) => [...new Set(all.filter(s=>(s.cash_out-s.buy_in)<=-80).map(s=>s.player_name))],
  },
  {
    id: 'rebuy_king', icon: '🔄', name: 'REBUY KING',
    desc: '5 eigene Sessions in Folge mit mindestens 1 Rebuy',
    holders: (stats, all) => {
      const byPlayer = {}
      all.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = []; byPlayer[s.player_name].push(s) })
      return Object.entries(byPlayer).filter(([, ss]) => {
        const sorted = [...ss].sort((a,b) => a.date.localeCompare(b.date))
        let streak = 0
        for (const s of sorted) {
          if ((s.rebuy_count || 0) >= 1) { streak++; if (streak >= 5) return true }
          else streak = 0
        }
        return false
      }).map(([n]) => n)
    },
  },
  {
    id: 'comeback', icon: '🔥', name: 'COMEBACK KING',
    desc: 'Größter Verlierer einer Session — und in der nächsten Session dabei der Gewinner',
    holders: (stats, all) => {
      const byDate = {}
      all.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s) })
      const sortedNights = Object.keys(byDate).sort()
      const result = new Set()
      for (let i = 0; i < sortedNights.length - 1; i++) {
        const players = byDate[sortedNights[i]]
        const biggestLoser = players.reduce((worst, s) => {
          const profit = s.cash_out - s.buy_in
          if (profit >= 0) return worst
          if (!worst || profit < (worst.cash_out - worst.buy_in)) return s
          return worst
        }, null)
        if (!biggestLoser) continue
        const nextPlayers = byDate[sortedNights[i + 1]]
        const nextWinner = nextPlayers.reduce((best, s) => {
          const profit = s.cash_out - s.buy_in
          if (!best || profit > (best.cash_out - best.buy_in)) return s
          return best
        }, null)
        if (nextWinner && nextWinner.player_name === biggestLoser.player_name && (nextWinner.cash_out - nextWinner.buy_in) > 0)
          result.add(biggestLoser.player_name)
      }
      return [...result]
    },
  },
  {
    id: 'hat_trick', icon: '🎩', name: 'HAT TRICK',
    desc: '3 aufeinanderfolgende Spielabende als Gewinner abgeschlossen',
    holders: (stats, all) => {
      const byDate = {}
      all.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s) })
      const sortedNights = Object.keys(byDate).sort()
      const nightWinners = sortedNights.map(date => {
        const players = byDate[date]
        const winner = players.reduce((best, s) => {
          const profit = s.cash_out - s.buy_in
          if (!best || profit > (best.cash_out - best.buy_in)) return s
          return best
        }, null)
        return winner && (winner.cash_out - winner.buy_in) > 0 ? winner.player_name : null
      })
      const result = new Set()
      for (let i = 0; i < nightWinners.length - 2; i++) {
        const w1 = nightWinners[i], w2 = nightWinners[i+1], w3 = nightWinners[i+2]
        if (w1 && w1 === w2 && w2 === w3) result.add(w1)
      }
      return [...result]
    },
  },
  {
    id: 'veteran', icon: '♠', name: 'VETERAN',
    desc: '10 oder mehr Sessions gespielt',
    holders: (stats) => Object.entries(stats).filter(([,p])=>p.sessions>=10).map(([n])=>n),
  },
  {
    id: 'legend', icon: '🃏', name: 'LEGENDE',
    desc: '20 oder mehr Sessions gespielt',
    holders: (stats) => Object.entries(stats).filter(([,p])=>p.sessions>=20).map(([n])=>n),
  },
  {
    id: 'night_owl', icon: '🦉', name: 'STAMMGAST',
    desc: '5 Spielabende in Folge dabei',
    holders: (stats, all) => {
      const allNights = [...new Set(all.map(s => s.date))].sort()
      const byPlayer = {}
      all.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = new Set(); byPlayer[s.player_name].add(s.date) })
      return Object.entries(byPlayer).filter(([, nights]) => {
        let streak = 0
        for (const night of allNights) {
          if (nights.has(night)) { streak++; if (streak >= 5) return true }
          else streak = 0
        }
        return false
      }).map(([n]) => n)
    },
  },
  {
    id: 'iron_man', icon: '🔥', name: 'IRON MAN',
    desc: '10 Spielabende in Folge dabei',
    holders: (stats, all) => {
      const allNights = [...new Set(all.map(s => s.date))].sort()
      const byPlayer = {}
      all.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = new Set(); byPlayer[s.player_name].add(s.date) })
      return Object.entries(byPlayer).filter(([, nights]) => {
        let streak = 0
        for (const night of allNights) {
          if (nights.has(night)) { streak++; if (streak >= 10) return true }
          else streak = 0
        }
        return false
      }).map(([n]) => n)
    },
  },
  {
    id: 'nit', icon: '🪨', name: 'DER NIT',
    desc: '3 eigene Sessions in Folge nie mehr als 50% des Buy-Ins gewonnen oder verloren',
    holders: (stats, all) => {
      const byPlayer = {}
      all.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = []; byPlayer[s.player_name].push(s) })
      return Object.entries(byPlayer).filter(([,ss]) => {
        const sorted = [...ss].sort((a,b)=>a.date.localeCompare(b.date))
        const isNit = s => s.buy_in > 0 && (Math.abs(s.cash_out - s.buy_in) / s.buy_in) <= 0.5
        for (let i=0; i<sorted.length-2; i++)
          if (isNit(sorted[i]) && isNit(sorted[i+1]) && isNit(sorted[i+2])) return true
        return false
      }).map(([n])=>n)
    },
  },
  {
    id: 'iron_wallet', icon: '🪨', name: 'DER EISERNE',
    desc: '5 eigene Sessions in Folge ohne Rebuy',
    holders: (stats, all) => {
      const byPlayer = {}
      all.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = []; byPlayer[s.player_name].push(s) })
      return Object.entries(byPlayer).filter(([, ss]) => {
        const sorted = [...ss].sort((a,b) => a.date.localeCompare(b.date))
        let streak = 0
        for (const s of sorted) {
          if (s.rebuy_count > 0) streak = 0
          else { streak++; if (streak >= 5) return true }
        }
        return false
      }).map(([n]) => n)
    },
  },
  {
    id: 'unzerstoerbar', icon: '🦾', name: 'DER UNZERSTÖRBARE',
    desc: '10 eigene Sessions in Folge ohne Rebuy',
    holders: (stats, all) => {
      const byPlayer = {}
      all.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = []; byPlayer[s.player_name].push(s) })
      return Object.entries(byPlayer).filter(([, ss]) => {
        const sorted = [...ss].sort((a,b) => a.date.localeCompare(b.date))
        let streak = 0
        for (const s of sorted) {
          if (s.rebuy_count > 0) streak = 0
          else { streak++; if (streak >= 10) return true }
        }
        return false
      }).map(([n]) => n)
    },
  },
  {
    id: 'daylight_robbery', icon: '💸', name: 'DAYLIGHT ROBBERY',
    desc: 'Eine Session mit mindestens 3× dem Buy-In als Gewinn beendet',
    holders: (stats, all) => [...new Set(all.filter(s => s.buy_in > 0 && (s.cash_out - s.buy_in) >= s.buy_in * 3).map(s => s.player_name))],
  },
  {
    id: 'punktlandung', icon: '🎯', name: 'PUNKTLANDUNG',
    desc: 'Eine Session mit exakt 0,00 € Profit beendet',
    holders: (stats, all) => [...new Set(all.filter(s => s.buy_in > 0 && Math.abs(s.cash_out - s.buy_in) < 0.01).map(s => s.player_name))],
  },
  {
    id: 'tourney_itm1', icon: '💵', name: 'IN THE MONEY',
    desc: 'Einmal bei einem Turnier ins Geld gekommen',
    holders: (stats, all, tours) => {
      const winners = new Set()
      ;(tours||[]).forEach(t => {
        const payoutPlaces = (t.payouts||[]).filter(p=>p.pct>0).length || Math.max(1, Math.floor((t.players||[]).length * 0.33))
        ;(t.results||[]).forEach(r => { if ((r.place||99) <= payoutPlaces) winners.add(r.name) })
      })
      return [...winners]
    },
  },
  {
    id: 'tourney_winner', icon: '🎰', name: 'TOURNAMENT WINNER',
    desc: 'Ein Turnier gewonnen',
    holders: (stats, all, tours) => {
      const winners = new Set()
      ;(tours||[]).forEach(t => { const w = (t.results||[]).find(r => r.place === 1); if (w) winners.add(w.name) })
      return [...winners]
    },
  },
  {
    id: 'tourney_itm5', icon: '💰', name: 'MONEY MAKER',
    desc: '5× bei Turnieren ins Geld gekommen',
    holders: (stats, all, tours) => {
      const counts = {}
      ;(tours||[]).forEach(t => {
        const payoutPlaces = (t.payouts||[]).filter(p=>p.pct>0).length || Math.max(1, Math.floor((t.players||[]).length * 0.33))
        ;(t.results||[]).forEach(r => { if ((r.place||99) <= payoutPlaces) counts[r.name] = (counts[r.name]||0) + 1 })
      })
      return Object.entries(counts).filter(([,c])=>c>=5).map(([n])=>n)
    },
  },
  {
    id: 'tourney_3wins', icon: '🏆', name: 'POKER CHAMPION',
    desc: '3 Turniere gewonnen',
    holders: (stats, all, tours) => {
      const counts = {}
      ;(tours||[]).forEach(t => { const w = (t.results||[]).find(r=>r.place===1); if (w) counts[w.name]=(counts[w.name]||0)+1 })
      return Object.entries(counts).filter(([,c])=>c>=3).map(([n])=>n)
    },
  },
  {
    id: 'collector_80', icon: '⭐', name: 'BADGE COLLECTOR',
    desc: '50% aller Achievements freigeschaltet',
    meta: true, holders: () => [],
  },
  {
    id: 'collector_100', icon: '🌟', name: 'POKER GOD',
    desc: '100% aller Achievements freigeschaltet',
    meta: true, holders: () => [],
  },
]
