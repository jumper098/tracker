import Avatar from '../components/Avatar'
import { calcYearBadges } from '../lib/badges'
import { safeName } from '../lib/safeName'
import { useState } from 'react'
import { formatEuro, formatEuroSign, formatDate, profitClass } from '../lib/helpers'

export default function Rangliste({ sessions, avatars = {} }) {
  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const [yearFilter, setYearFilter] = useState(() => years.length > 0 ? years[0] : 'all')
  const [expanded, setExpanded] = useState({})
  const [h2hOpen, setH2hOpen] = useState(false)
  const [h2hA, setH2hA] = useState('')
  const [h2hB, setH2hB] = useState('')
  const [h2hYear, setH2hYear] = useState('all')

  const filtered = yearFilter === 'all' ? sessions : sessions.filter(s => s.date.startsWith(yearFilter))

  // Build player stats
  const statsMap = {}
  filtered.forEach(s => {
    if (!statsMap[s.player_name]) statsMap[s.player_name] = {
      name: s.player_name, sessions: 0, profit: 0, wins: 0, losses: 0,
      buyin: 0, rebuys: 0,
      bestWin: -Infinity, bestWinDate: null,
      worstLoss: Infinity, worstLossDate: null,
    }
    const p = statsMap[s.player_name]
    const profit = s.cash_out - s.buy_in
    p.sessions++
    p.profit += profit
    p.buyin += s.buy_in
    p.rebuys += (s.rebuy_count || 0)
    if (profit > 0) p.wins++
    if (profit < 0) p.losses++
    if (profit > p.bestWin) { p.bestWin = profit; p.bestWinDate = s.date }
    if (profit < p.worstLoss) { p.worstLoss = profit; p.worstLossDate = s.date }
  })

  const players = Object.values(statsMap)
  players.forEach(p => {
    p.winRate = p.sessions > 0 ? (p.wins / p.sessions * 100) : 0
    p.avgProfit = p.sessions > 0 ? p.profit / p.sessions : 0
    const ps = filtered.filter(s => s.player_name === p.name).sort((a, b) => a.date.localeCompare(b.date))
    let curWin = 0, maxWin = 0, curLoss = 0, maxLoss = 0
    ps.forEach(s => {
      const profit = s.cash_out - s.buy_in
      if (profit > 0) { curWin++; maxWin = Math.max(maxWin, curWin); curLoss = 0 }
      else if (profit < 0) { curLoss++; maxLoss = Math.max(maxLoss, curLoss); curWin = 0 }
      else { curWin = 0; curLoss = 0 }
    })
    p.longestWinStreak = maxWin
    p.longestLossStreak = maxLoss
  })

  const sorted = [...players].sort((a, b) => b.profit - a.profit)
  const allPlayerNames = [...new Set(sessions.map(s => s.player_name))].sort()

  function toggleExpand(name) {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }))
  }

  function calcH2H(nameA, nameB, yearF = 'all') {
    const filteredH2H = yearF === 'all' ? sessions : sessions.filter(s => s.date.startsWith(yearF))
    const byDate = {}
    filteredH2H.forEach(s => { if (!byDate[s.date]) byDate[s.date] = {}; byDate[s.date][s.player_name] = s })
    let winsA = 0, winsB = 0, draws = 0

    // Head-to-head nights (both present)
    Object.values(byDate).forEach(night => {
      const a = night[nameA], b = night[nameB]
      if (!a || !b) return
      const profA = a.cash_out - a.buy_in, profB = b.cash_out - b.buy_in
      if (profA > profB) winsA++
      else if (profB > profA) winsB++
      else draws++
    })

    // Build stats for each player filtered by year
    function buildStats(name) {
      const playerSessions = filteredH2H.filter(s => s.player_name === name)
      const s = { profit: 0, wins: 0, losses: 0, buyin: 0, rebuys: 0,
        sessions: playerSessions.length,
        bestWin: -Infinity, bestWinDate: null, worstLoss: Infinity, worstLossDate: null }
      playerSessions.forEach(sess => {
        const profit = sess.cash_out - sess.buy_in
        s.profit += profit
        s.buyin += sess.buy_in
        s.rebuys += (sess.rebuy_count || 0)
        if (profit > 0) s.wins++
        if (profit < 0) s.losses++
        if (profit > s.bestWin) { s.bestWin = profit; s.bestWinDate = sess.date }
        if (profit < s.worstLoss) { s.worstLoss = profit; s.worstLossDate = sess.date }
      })
      s.winRate = s.sessions > 0 ? (s.wins / s.sessions * 100) : 0
      s.avgProfit = s.sessions > 0 ? s.profit / s.sessions : 0
      const sorted = [...playerSessions].sort((a, b) => a.date.localeCompare(b.date))
      let curW = 0, maxW = 0, curL = 0, maxL = 0
      sorted.forEach(sess => {
        const profit = sess.cash_out - sess.buy_in
        if (profit > 0) { curW++; maxW = Math.max(maxW, curW); curL = 0 }
        else if (profit < 0) { curL++; maxL = Math.max(maxL, curL); curW = 0 }
        else { curW = 0; curL = 0 }
      })
      s.longestWinStreak = maxW
      s.longestLossStreak = maxL
      return s
    }

    return {
      winsA, winsB, draws, total: winsA + winsB + draws,
      statsA: buildStats(nameA),
      statsB: buildStats(nameB),
    }
  }

  const h2h = (h2hA && h2hB && h2hA !== h2hB) ? calcH2H(h2hA, h2hB, h2hYear) : null
  const MEDALS = ['🥇', '🥈', '🥉']
  const yearBadges = calcYearBadges(sessions)

  // ─── Live Quick Stats ────────────────────────────────────────────────────
  const quickStats = (() => {
    if (sessions.length === 0) return null

    const allPlayers = [...new Set(sessions.map(s => s.player_name))]
    const allNights = [...new Set(sessions.map(s => s.date))].sort()
    const byPlayer = {}
    sessions.forEach(s => { if (!byPlayer[s.player_name]) byPlayer[s.player_name] = []; byPlayer[s.player_name].push(s) })

    // 1. Current Win Streak — how many consecutive wins right now
    let winStreak = { players: [], streak: 0 }
    allPlayers.forEach(name => {
      const sorted = [...(byPlayer[name]||[])].sort((a,b) => b.date.localeCompare(a.date)) // newest first
      let cur = 0
      for (const s of sorted) {
        if (s.cash_out - s.buy_in > 0) cur++
        else break
      }
      if (cur > winStreak.streak) { winStreak = { players: [name], streak: cur } }
      else if (cur === winStreak.streak && cur > 0) { winStreak.players.push(name) }
    })

    // 2. Current Loss Streak — how many consecutive losses right now
    let lossStreak = { players: [], streak: 0 }
    allPlayers.forEach(name => {
      const sorted = [...(byPlayer[name]||[])].sort((a,b) => b.date.localeCompare(a.date))
      let cur = 0
      for (const s of sorted) {
        if (s.cash_out - s.buy_in < 0) cur++
        else break
      }
      if (cur > lossStreak.streak) { lossStreak = { players: [name], streak: cur } }
      else if (cur === lossStreak.streak && cur > 0) { lossStreak.players.push(name) }
    })

    // 3. Biggest single win ever
    let biggestWin = { player: null, amount: -Infinity }
    sessions.forEach(s => {
      const p = s.cash_out - s.buy_in
      if (p > biggestWin.amount) biggestWin = { player: s.player_name, amount: p }
    })

    // 4. Current attendance streak — most consecutive nights attended right now
    let attendStreak = { players: [], streak: 0 }
    allPlayers.forEach(name => {
      const playerNights = new Set((byPlayer[name]||[]).map(s => s.date))
      let cur = 0
      for (let i = allNights.length - 1; i >= 0; i--) {
        if (playerNights.has(allNights[i])) cur++
        else break
      }
      if (cur > attendStreak.streak) { attendStreak = { players: [name], streak: cur } }
      else if (cur === attendStreak.streak && cur > 0) { attendStreak.players.push(name) }
    })

    return { winStreak, lossStreak, biggestWin, attendStreak }
  })()

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ RANGLISTE
        </div>
      </div>

      {/* Live Quick Stats */}
      {quickStats && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#f87171', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.6rem', color: '#f87171', letterSpacing: '0.15em' }}>LIVE</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              {
                icon: '🔥', label: 'WIN STREAK',
                value: quickStats.winStreak.streak > 0 ? quickStats.winStreak.streak + '×' : '—',
                players: quickStats.winStreak.players,
                color: '#fb923c',
              },
              {
                icon: '❄️', label: 'LOSS STREAK',
                value: quickStats.lossStreak.streak > 0 ? quickStats.lossStreak.streak + '×' : '—',
                players: quickStats.lossStreak.players,
                color: '#60a5fa',
              },
              {
                icon: '💰', label: 'BEST WIN',
                value: quickStats.biggestWin.player ? formatEuroSign(quickStats.biggestWin.amount) : '—',
                players: quickStats.biggestWin.player ? [quickStats.biggestWin.player] : [],
                color: '#4ade80',
              },
              {
                icon: '📅', label: 'DABEI STREAK',
                value: quickStats.attendStreak.streak > 0 ? quickStats.attendStreak.streak + '×' : '—',
                players: quickStats.attendStreak.players,
                color: '#a78bfa',
              },
            ].map(stat => (
              <div key={stat.label} className="card" style={{ padding: '10px 6px', textAlign: 'center', flex: 1 }}>
                <div style={{ fontSize: '0.8rem', marginBottom: '3px' }}>{stat.icon}</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '1rem', color: stat.color, fontWeight: 700, marginBottom: '4px' }}>
                  {stat.value}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '2px', marginBottom: '5px' }}>
                  {stat.players.slice(0,3).map(p => (
                    <Avatar key={p} name={p} avatars={avatars} size={20} />
                  ))}
                </div>
                {stat.players.slice(0,2).map(p => (
                  <div key={p} style={{ fontSize: '0.6rem', color: 'var(--text-primary)', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {p}
                  </div>
                ))}
                {stat.players.length > 2 && (
                  <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>+{stat.players.length - 2} weitere</div>
                )}
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', fontWeight: 600, letterSpacing: '0.06em', marginTop: '4px' }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Year filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
        {[...years, 'all'].map(y => (
          <button key={y} onClick={() => setYearFilter(y)} className="btn-ghost"
            style={{
              flex: 1, textAlign: 'center',
              background: yearFilter === y ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: yearFilter === y ? 'rgba(201,168,76,0.5)' : undefined,
              color: yearFilter === y ? 'var(--gold-light)' : undefined,
            }}>
            {y === 'all' ? 'Alle' : y}
          </button>
        ))}
      </div>

      {sorted.length === 0 && <div className="empty-state">Noch keine Daten ♠</div>}

      {sorted.map((p, i) => {
        const isOpen = expanded[p.name]
        return (
          <div key={p.name} className="card" style={{ marginBottom: '10px', padding: '0', cursor: 'pointer' }}
            onClick={() => toggleExpand(p.name)}>

            {/* Always visible */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px' }}>
              <div style={{ fontSize: i < 3 ? '1.4rem' : '0.9rem', minWidth: '28px', textAlign: 'center', flexShrink: 0 }}>
                {i < 3 ? MEDALS[i] : `#${i + 1}`}
              </div>
              <Avatar name={p.name} avatars={avatars} size={42} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '1rem' }}>{p.name}</span>
                  {(yearBadges[p.name] || []).map((b, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                      <span style={{ fontSize: '0.85rem' }}>{b.emoji}</span>
                      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', fontWeight: 600 }}>{b.year}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className={`font-display ${profitClass(p.profit)}`} style={{ fontSize: '1rem' }}>{formatEuroSign(p.profit)}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Ø {formatEuroSign(p.avgProfit)}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginLeft: '4px' }}>{isOpen ? '▲' : '▼'}</div>
            </div>

            {/* Expanded */}
            {isOpen && (
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '14px 16px' }}
                onClick={e => e.stopPropagation()}>

                {/* H2H Button — top */}
                <button className="btn-gold" style={{ width: '100%', fontSize: '0.75rem', marginBottom: '14px' }}
                  onClick={() => { setH2hA(p.name); setH2hB(''); setH2hOpen(true) }}>
                  ⚔ HEAD-TO-HEAD VERGLEICH
                </button>

                {/* Stats grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '10px' }}>
                  {[
                    { label: 'Sessions', value: p.sessions },
                    { label: 'Siege', value: p.wins },
                    { label: 'Niederlagen', value: p.losses },
                    { label: 'Winrate', value: p.winRate.toFixed(0) + '%' },
                    { label: 'Rebuys', value: p.rebuys },
                    { label: 'Gesamt Buy-In', value: formatEuro(p.buyin) },
                    { label: 'Win Streak 🔥', value: p.longestWinStreak + '×' },
                    { label: 'Loss Streak 💀', value: p.longestLossStreak + '×' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '10px 8px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="font-display" style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>{s.value}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '3px', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Best / Worst */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', letterSpacing: '0.08em', marginBottom: '4px' }}>BESTE SESSION</div>
                    <div className="font-display profit-pos" style={{ fontSize: '0.95rem' }}>{p.bestWin !== -Infinity ? formatEuroSign(p.bestWin) : '—'}</div>
                    {p.bestWinDate && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>{formatDate(p.bestWinDate)}</div>}
                  </div>
                  <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', letterSpacing: '0.08em', marginBottom: '4px' }}>SCHLECHTESTE</div>
                    <div className="font-display profit-neg" style={{ fontSize: '0.95rem' }}>{p.worstLoss !== Infinity ? formatEuroSign(p.worstLoss) : '—'}</div>
                    {p.worstLossDate && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>{formatDate(p.worstLossDate)}</div>}
                  </div>
                </div>

                {/* Win/Loss bar */}
                {p.sessions > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '8px', marginBottom: '4px' }}>
                      <div style={{ flex: p.wins, background: '#4ade80', opacity: 0.8 }} />
                      <div style={{ flex: p.losses, background: '#f87171', opacity: 0.8 }} />
                      <div style={{ flex: p.sessions - p.wins - p.losses, background: 'var(--text-muted)', opacity: 0.3 }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      <span style={{ color: '#4ade80' }}>✓ {p.wins} Siege</span>
                      <span style={{ color: '#f87171' }}>✗ {p.losses} Niederlagen</span>
                    </div>
                  </div>
                )}

                {/* Session history */}
                {(() => {
                  const playerSessions = filtered
                    .filter(s => s.player_name === p.name)
                    .sort((a, b) => b.date.localeCompare(a.date))
                  if (playerSessions.length === 0) return null
                  return (
                    <div style={{ marginTop: '14px' }}>
                      <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: '8px' }}>
                        SESSIONS ({playerSessions.length})
                      </div>
                      {playerSessions.map(s => {
                        const profit = s.cash_out - s.buy_in
                        return (
                          <div key={s.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                            fontSize: '0.82rem',
                          }}>
                            <span style={{ color: 'var(--text-muted)' }}>{formatDate(s.date)}</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              {formatEuro(s.buy_in)} → {formatEuro(s.cash_out)}
                              {s.rebuy_count > 0 && ` · ${s.rebuy_count}× R`}
                            </span>
                            <span className={`font-display ${profitClass(profit)}`} style={{ fontSize: '0.82rem' }}>
                              {formatEuroSign(profit)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

              </div>
            )}
          </div>
        )
      })}

      {/* H2H Modal */}
      {h2hOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 450, padding: '20px' }}
          onClick={() => setH2hOpen(false)}>
          <div className="card" style={{ maxWidth: '380px', width: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize: '0.9rem', color: 'var(--gold)', letterSpacing: '0.12em', marginBottom: '14px' }}>
              ⚔ HEAD-TO-HEAD
            </div>

            {/* Year filter */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
              {[...years, 'all'].map(y => (
                <button key={y} onClick={() => setH2hYear(y)} className="btn-ghost"
                  style={{
                    flex: 1, textAlign: 'center',
                    background: h2hYear === y ? 'rgba(201,168,76,0.2)' : undefined,
                    borderColor: h2hYear === y ? 'rgba(201,168,76,0.5)' : undefined,
                    color: h2hYear === y ? 'var(--gold-light)' : undefined,
                    fontSize: '0.7rem', padding: '6px 4px',
                  }}>
                  {y === 'all' ? 'Alle' : y}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <select className="input-field" value={h2hA} onChange={e => setH2hA(e.target.value)}>
                <option value="">Spieler 1</option>
                {allPlayerNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <select className="input-field" value={h2hB} onChange={e => setH2hB(e.target.value)}>
                <option value="">Spieler 2</option>
                {allPlayerNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {h2h && (
              <div>
                {/* Header with avatars and wins */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', textAlign: 'center', marginBottom: '12px' }}>
                  <div>
                    <Avatar name={h2hA} avatars={avatars} size={52} style={{ margin: '0 auto 6px', display: 'block' }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{h2hA}</div>
                    <div className="font-display" style={{ fontSize: '2rem', color: '#4ade80' }}>{h2h.winsA}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    VS<br />
                    <span style={{ fontSize: '0.7rem' }}>{h2h.draws} Unentsch.</span>
                  </div>
                  <div>
                    <Avatar name={h2hB} avatars={avatars} size={52} style={{ margin: '0 auto 6px', display: 'block' }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{h2hB}</div>
                    <div className="font-display" style={{ fontSize: '2rem', color: '#60a5fa' }}>{h2h.winsB}</div>
                  </div>
                </div>

                {/* Win bar */}
                {h2h.total > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '8px' }}>
                      <div style={{ flex: h2h.winsA, background: '#4ade80' }} />
                      <div style={{ flex: h2h.draws, background: 'rgba(255,255,255,0.15)' }} />
                      <div style={{ flex: h2h.winsB, background: '#60a5fa' }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '16px' }}>
                  {h2h.total} gemeinsame Spielabende · Gesamt: {statsMap[h2hA]?.sessions || 0} vs {statsMap[h2hB]?.sessions || 0} Sessions
                </div>

                {/* Stats comparison — only from shared sessions */}
                {[
                  { label: 'Profit', a: formatEuroSign(h2h.statsA.profit), b: formatEuroSign(h2h.statsB.profit), aVal: h2h.statsA.profit, bVal: h2h.statsB.profit },
                  { label: 'Ø Profit', a: formatEuroSign(h2h.statsA.avgProfit), b: formatEuroSign(h2h.statsB.avgProfit), aVal: h2h.statsA.avgProfit, bVal: h2h.statsB.avgProfit },
                  { label: 'Winrate', a: h2h.statsA.winRate.toFixed(0)+'%', b: h2h.statsB.winRate.toFixed(0)+'%', aVal: h2h.statsA.winRate, bVal: h2h.statsB.winRate },
                  { label: 'Siege', a: h2h.statsA.wins, b: h2h.statsB.wins, aVal: h2h.statsA.wins, bVal: h2h.statsB.wins },
                  { label: 'Niederlagen', a: h2h.statsA.losses, b: h2h.statsB.losses, aVal: h2h.statsA.losses, bVal: h2h.statsB.losses, lowerBetter: true },
                  { label: 'Rebuys', a: h2h.statsA.rebuys, b: h2h.statsB.rebuys, aVal: h2h.statsA.rebuys, bVal: h2h.statsB.rebuys, lowerBetter: true },
                  { label: 'Buy-In Total', a: formatEuro(h2h.statsA.buyin), b: formatEuro(h2h.statsB.buyin), aVal: null, bVal: null },
                  { label: 'Win Streak 🔥', a: h2h.statsA.longestWinStreak+'×', b: h2h.statsB.longestWinStreak+'×', aVal: h2h.statsA.longestWinStreak, bVal: h2h.statsB.longestWinStreak },
                  { label: 'Loss Streak 💀', a: h2h.statsA.longestLossStreak+'×', b: h2h.statsB.longestLossStreak+'×', aVal: h2h.statsA.longestLossStreak, bVal: h2h.statsB.longestLossStreak, lowerBetter: true },
                ].map(row => {
                  const aWins = row.aVal !== null && (row.lowerBetter ? row.aVal < row.bVal : row.aVal > row.bVal)
                  const bWins = row.aVal !== null && (row.lowerBetter ? row.bVal < row.aVal : row.bVal > row.aVal)
                  return (
                    <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ textAlign: 'right', fontFamily: 'Cinzel, serif', fontSize: '0.82rem', color: aWins ? '#4ade80' : 'var(--text-primary)', fontWeight: aWins ? 700 : 400 }}>
                        {row.a}{aWins ? ' ✓' : ''}
                      </div>
                      <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em', minWidth: '60px' }}>{row.label}</div>
                      <div style={{ textAlign: 'left', fontFamily: 'Cinzel, serif', fontSize: '0.82rem', color: bWins ? '#60a5fa' : 'var(--text-primary)', fontWeight: bWins ? 700 : 400 }}>
                        {bWins ? '✓ ' : ''}{row.b}
                      </div>
                    </div>
                  )
                })}

                {/* Beste / Schlechteste Sessions */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                  <div style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', marginBottom: '6px' }}>BESTE SESSION</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <div>
                        <div className="profit-pos" style={{ fontFamily: 'Cinzel, serif' }}>{h2h.statsA.bestWin !== -Infinity ? formatEuroSign(h2h.statsA.bestWin) : '—'}</div>
                        {h2h.statsA.bestWinDate && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatDate(h2h.statsA.bestWinDate)}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="profit-pos" style={{ fontFamily: 'Cinzel, serif' }}>{h2h.statsB.bestWin !== -Infinity ? formatEuroSign(h2h.statsB.bestWin) : '—'}</div>
                        {h2h.statsB.bestWinDate && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatDate(h2h.statsB.bestWinDate)}</div>}
                      </div>
                    </div>
                  </div>
                  <div style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)', borderRadius: '8px', padding: '8px 10px' }}>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', marginBottom: '6px' }}>SCHLECHTESTE</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                      <div>
                        <div className="profit-neg" style={{ fontFamily: 'Cinzel, serif' }}>{h2h.statsA.worstLoss !== Infinity ? formatEuroSign(h2h.statsA.worstLoss) : '—'}</div>
                        {h2h.statsA.worstLossDate && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatDate(h2h.statsA.worstLossDate)}</div>}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="profit-neg" style={{ fontFamily: 'Cinzel, serif' }}>{h2h.statsB.worstLoss !== Infinity ? formatEuroSign(h2h.statsB.worstLoss) : '—'}</div>
                        {h2h.statsB.worstLossDate && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{formatDate(h2h.statsB.worstLossDate)}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {h2hA && h2hB && h2hA === h2hB && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem', marginBottom: '16px' }}>
                Bitte zwei verschiedene Spieler auswählen
              </div>
            )}

            <button className="btn-ghost" style={{ width: '100%' }} onClick={() => setH2hOpen(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
