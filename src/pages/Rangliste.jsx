import { useState } from 'react'
import { formatEuro, formatEuroSign, formatDate, profitClass } from '../lib/helpers'

export default function Rangliste({ sessions, avatars = {} }) {
  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const [yearFilter, setYearFilter] = useState(() => years.length > 0 ? years[0] : 'all')
  const [expanded, setExpanded] = useState({})
  const [h2hOpen, setH2hOpen] = useState(false)
  const [h2hA, setH2hA] = useState('')
  const [h2hB, setH2hB] = useState('')

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

  function calcH2H(nameA, nameB) {
    const byDate = {}
    sessions.forEach(s => { if (!byDate[s.date]) byDate[s.date] = {}; byDate[s.date][s.player_name] = s })
    let winsA = 0, winsB = 0, draws = 0
    Object.values(byDate).forEach(night => {
      const a = night[nameA], b = night[nameB]
      if (!a || !b) return
      const profA = a.cash_out - a.buy_in, profB = b.cash_out - b.buy_in
      if (profA > profB) winsA++
      else if (profB > profA) winsB++
      else draws++
    })
    return { winsA, winsB, draws, total: winsA + winsB + draws }
  }

  const h2h = (h2hA && h2hB && h2hA !== h2hB) ? calcH2H(h2hA, h2hB) : null
  const MEDALS = ['🥇', '🥈', '🥉']

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ RANGLISTE
        </div>
      </div>

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
              {avatars[p.name] ? (
                <img src={avatars[p.name]} alt={p.name} style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(201,168,76,0.35)', flexShrink: 0 }} />
              ) : (
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'rgba(201,168,76,0.08)', border: '1px dashed rgba(201,168,76,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>👤</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{p.name}</div>
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

                {/* H2H Button */}
                <button className="btn-ghost" style={{ width: '100%', fontSize: '0.75rem' }}
                  onClick={() => { setH2hA(p.name); setH2hB(''); setH2hOpen(true) }}>
                  ⚔ HEAD-TO-HEAD VERGLEICH
                </button>
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
            <div className="font-display" style={{ fontSize: '0.9rem', color: 'var(--gold)', letterSpacing: '0.12em', marginBottom: '20px' }}>
              ⚔ HEAD-TO-HEAD
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', textAlign: 'center', marginBottom: '16px' }}>
                  <div>
                    {avatars[h2hA] ? (
                      <img src={avatars[h2hA]} alt={h2hA} style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(201,168,76,0.4)', margin: '0 auto 6px' }} />
                    ) : (
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px dashed rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', margin: '0 auto 6px' }}>👤</div>
                    )}
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{h2hA}</div>
                    <div className="font-display profit-pos" style={{ fontSize: '2rem' }}>{h2h.winsA}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    VS<br />
                    <span style={{ fontSize: '0.7rem' }}>{h2h.draws} Unentsch.</span>
                  </div>
                  <div>
                    {avatars[h2hB] ? (
                      <img src={avatars[h2hB]} alt={h2hB} style={{ width: '52px', height: '52px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(201,168,76,0.4)', margin: '0 auto 6px' }} />
                    ) : (
                      <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(201,168,76,0.1)', border: '1px dashed rgba(201,168,76,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', margin: '0 auto 6px' }}>👤</div>
                    )}
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{h2hB}</div>
                    <div className="font-display profit-pos" style={{ fontSize: '2rem' }}>{h2h.winsB}</div>
                  </div>
                </div>
                {h2h.total > 0 && (
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '10px' }}>
                      <div style={{ flex: h2h.winsA, background: '#4ade80' }} />
                      <div style={{ flex: h2h.draws, background: 'rgba(255,255,255,0.15)' }} />
                      <div style={{ flex: h2h.winsB, background: '#60a5fa' }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '16px' }}>
                  {h2h.total} gemeinsame Spielabende
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
