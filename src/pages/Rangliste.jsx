import { useState } from 'react'
import { formatEuro, formatEuroSign, profitClass } from '../lib/helpers'

export default function Rangliste({ sessions }) {
  const [yearFilter, setYearFilter] = useState('all')
  const [sortMode, setSortMode] = useState('profit')
  const [h2hA, setH2hA] = useState('')
  const [h2hB, setH2hB] = useState('')
  const [showH2H, setShowH2H] = useState(false)

  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const filtered = yearFilter === 'all' ? sessions : sessions.filter(s => s.date.startsWith(yearFilter))

  // Build player stats
  const statsMap = {}
  filtered.forEach(s => {
    if (!statsMap[s.player_name]) statsMap[s.player_name] = {
      name: s.player_name, sessions: 0, profit: 0, wins: 0, losses: 0,
      buyin: 0, bestWin: -Infinity, worstLoss: Infinity, rebuys: 0,
    }
    const p = statsMap[s.player_name]
    const profit = s.cash_out - s.buy_in
    p.sessions++
    p.profit += profit
    p.buyin += s.buy_in
    p.rebuys += (s.rebuy_count || 0)
    if (profit > 0) p.wins++
    if (profit < 0) p.losses++
    if (profit > p.bestWin) p.bestWin = profit
    if (profit < p.worstLoss) p.worstLoss = profit
  })

  const players = Object.values(statsMap)
  players.forEach(p => {
    p.winRate = p.sessions > 0 ? (p.wins / p.sessions * 100) : 0
    p.avgProfit = p.sessions > 0 ? p.profit / p.sessions : 0
  })

  const sorted = [...players].sort((a, b) => {
    if (sortMode === 'profit') return b.profit - a.profit
    if (sortMode === 'winrate') return b.winRate - a.winRate
    if (sortMode === 'sessions') return b.sessions - a.sessions
    return 0
  })

  const allPlayerNames = [...new Set(sessions.map(s => s.player_name))].sort()

  // H2H calculation
  function calcH2H(nameA, nameB) {
    const byDate = {}
    sessions.forEach(s => { if (!byDate[s.date]) byDate[s.date] = {}; byDate[s.date][s.player_name] = s })
    let winsA = 0, winsB = 0, draws = 0
    Object.values(byDate).forEach(night => {
      const a = night[nameA], b = night[nameB]
      if (!a || !b) return
      const profA = a.cash_out - a.buy_in
      const profB = b.cash_out - b.buy_in
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
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
        {['all', ...years].map(y => (
          <button key={y} onClick={() => setYearFilter(y)} className="btn-ghost"
            style={{
              whiteSpace: 'nowrap',
              background: yearFilter === y ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: yearFilter === y ? 'rgba(201,168,76,0.5)' : undefined,
              color: yearFilter === y ? 'var(--gold-light)' : undefined,
            }}>
            {y === 'all' ? 'Alle' : y}
          </button>
        ))}
      </div>

      {/* Sort mode */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {[
          { id: 'profit', label: '€ Profit' },
          { id: 'winrate', label: '% Winrate' },
          { id: 'sessions', label: '# Sessions' },
        ].map(m => (
          <button key={m.id} onClick={() => setSortMode(m.id)} className="btn-ghost"
            style={{
              background: sortMode === m.id ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: sortMode === m.id ? 'rgba(201,168,76,0.5)' : undefined,
              color: sortMode === m.id ? 'var(--gold-light)' : undefined,
              fontSize: '0.65rem',
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {sorted.length === 0 && <div className="empty-state">Noch keine Daten ♠</div>}

      {sorted.map((p, i) => (
        <div key={p.name} className="card" style={{ marginBottom: '10px', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: i < 3 ? '1.5rem' : '1rem', minWidth: '32px', textAlign: 'center' }}>
              {i < 3 ? MEDALS[i] : `#${i + 1}`}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>{p.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {p.sessions} Sessions · {p.wins}W / {p.losses}L · {p.winRate.toFixed(0)}% WR
                {p.rebuys > 0 && ` · ${p.rebuys} Rebuys`}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className={`font-display ${profitClass(p.profit)}`} style={{ fontSize: '1rem' }}>
                {formatEuroSign(p.profit)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Ø {formatEuroSign(p.avgProfit)}
              </div>
            </div>
          </div>

          {/* Mini bar chart */}
          {p.sessions > 0 && (
            <div style={{ marginTop: '10px', display: 'flex', gap: '4px', alignItems: 'flex-end', height: '20px' }}>
              <div style={{ flex: p.wins, background: '#4ade80', borderRadius: '3px', minWidth: p.wins ? 4 : 0, opacity: 0.7 }} />
              <div style={{ flex: p.losses, background: '#f87171', borderRadius: '3px', minWidth: p.losses ? 4 : 0, opacity: 0.7 }} />
              <div style={{ flex: p.sessions - p.wins - p.losses, background: 'var(--text-muted)', borderRadius: '3px', minWidth: 0, opacity: 0.4 }} />
            </div>
          )}
        </div>
      ))}

      {/* Head-to-Head */}
      <div className="card" style={{ marginTop: '24px' }}>
        <div className="font-display" style={{
          fontSize: '0.8rem', color: 'var(--gold)',
          letterSpacing: '0.12em', marginBottom: '16px',
        }}>
          ⚔ HEAD-TO-HEAD
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '12px', alignItems: 'center', textAlign: 'center', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{h2hA}</div>
                <div className="font-display profit-pos" style={{ fontSize: '1.5rem' }}>{h2h.winsA}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                VS<br />
                <span style={{ fontSize: '0.7rem' }}>{h2h.draws} Unentsch.</span>
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{h2hB}</div>
                <div className="font-display profit-pos" style={{ fontSize: '1.5rem' }}>{h2h.winsB}</div>
              </div>
            </div>
            {/* H2H bar */}
            {h2h.total > 0 && (
              <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '8px' }}>
                <div style={{ flex: h2h.winsA, background: '#4ade80' }} />
                <div style={{ flex: h2h.draws, background: 'var(--text-muted)' }} />
                <div style={{ flex: h2h.winsB, background: '#60a5fa' }} />
              </div>
            )}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center' }}>
              {h2h.total} gemeinsame Spielabende
            </div>
          </div>
        )}

        {h2hA && h2hB && h2hA === h2hB && (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
            Bitte zwei verschiedene Spieler auswählen
          </div>
        )}
      </div>
    </div>
  )
}
