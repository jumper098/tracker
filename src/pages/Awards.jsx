import { useState } from 'react'
import { ACHIEVEMENTS } from '../lib/achievements'

const TIERS = [
  { level: 1, label: '🥉 STUFE 1 — EINSTEIGER', ids: ['first_win','iron_wallet','veteran','nit','punktlandung'] },
  { level: 2, label: '🥈 STUFE 2 — FORTGESCHRITTEN', ids: ['comeback','night_owl','unzerstoerbar','bad_beat','daylight_robbery','tourney_winner'] },
  { level: 3, label: '🥇 STUFE 3 — EXPERTE', ids: ['big_winner','profit_king','rebuy_king','collector_80','iron_man','legend','hat_trick','tourney_itm5'] },
  { level: 4, label: '💎 STUFE 4 — LEGENDE', ids: ['collector_100','profit_emperor','tourney_5wins'] },
]

export default function Awards({ sessions, tournaments }) {
  const [yearFilter, setYearFilter] = useState('all')
  const [playerFilter, setPlayerFilter] = useState('')

  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const filtered = yearFilter === 'all' ? sessions : sessions.filter(s => s.date.startsWith(yearFilter))
  const allPlayers = [...new Set(filtered.map(s => s.player_name))].sort()

  // Build stats map
  const statsMap = {}
  filtered.forEach(s => {
    const k = s.player_name.trim()
    if (!statsMap[k]) statsMap[k] = { sessions: 0, profit: 0, wins: 0, losses: 0, buyin: 0 }
    statsMap[k].sessions++
    statsMap[k].profit += (s.cash_out - s.buy_in)
    statsMap[k].buyin += s.buy_in
    if (s.cash_out > s.buy_in) statsMap[k].wins++
    if (s.cash_out < s.buy_in) statsMap[k].losses++
  })

  // Evaluate achievements
  const baseAchs = ACHIEVEMENTS.filter(a => !a.meta)
  const evaluated = ACHIEVEMENTS.map(a => {
    if (a.meta) return { ...a, holders: [], unlocked: false }
    const holders = a.holders(statsMap, filtered, tournaments)
    return { ...a, holders, unlocked: holders.length > 0 }
  })

  // Count badges per player
  const playerBadgeCount = {}
  evaluated.forEach(a => {
    if (a.meta) return
    a.holders.forEach(name => { playerBadgeCount[name] = (playerBadgeCount[name] || 0) + 1 })
  })

  // Fill meta achievements
  evaluated.forEach(a => {
    if (!a.meta) return
    const threshold = a.id === 'collector_100' ? 100 : 50
    a.holders = Object.entries(playerBadgeCount)
      .filter(([, c]) => Math.round((c / baseAchs.length) * 100) >= threshold)
      .map(([n]) => n)
    a.unlocked = a.holders.length > 0
  })

  // Apply player filter
  const display = evaluated.map(a => ({
    ...a,
    unlocked: playerFilter ? a.holders.includes(playerFilter) : a.unlocked,
    holders: playerFilter ? (a.holders.includes(playerFilter) ? [playerFilter] : []) : a.holders,
  }))

  const unlockedCount = display.filter(a => a.unlocked).length

  function getTier(id) {
    for (const t of TIERS) { if (t.ids.includes(id)) return t.level }
    return 3
  }

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ AWARDS
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          {unlockedCount} / {ACHIEVEMENTS.length} freigeschaltet
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

      {/* Player filter */}
      <div style={{ marginBottom: '20px' }}>
        <select className="input-field" value={playerFilter} onChange={e => setPlayerFilter(e.target.value)}>
          <option value="">— Alle Spieler —</option>
          {allPlayers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Progress bar (player filter) */}
      {playerFilter && (
        <div style={{ marginBottom: '20px', padding: '14px 16px', borderRadius: '10px',
          background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem' }}>{playerFilter}</span>
            <span className="font-display" style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>
              {unlockedCount} / {ACHIEVEMENTS.length} ({Math.round(unlockedCount / ACHIEVEMENTS.length * 100)}%)
            </span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px',
              width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%`,
              background: 'linear-gradient(90deg, var(--gold-dark), var(--gold))',
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
      )}

      {/* Achievements by tier */}
      {TIERS.map(tier => {
        const tierAchs = display.filter(a => tier.ids.includes(a.id))
        if (tierAchs.length === 0) return null
        return (
          <div key={tier.level} style={{ marginBottom: '24px' }}>
            <div style={{
              fontFamily: 'Cinzel, serif', fontSize: '0.7rem',
              letterSpacing: '0.12em', color: 'var(--text-muted)',
              marginBottom: '12px', paddingBottom: '6px',
              borderBottom: '1px solid rgba(201,168,76,0.15)',
            }}>
              {tier.label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {tierAchs.map(a => (
                <div key={a.id} className={`badge-card ${a.unlocked ? 'unlocked' : 'locked'}`}>
                  {!a.unlocked && <div style={{ fontSize: '1rem', marginBottom: '4px' }}>🔒</div>}
                  <div className="badge-icon">{a.icon}</div>
                  <div className="badge-name">{a.name}</div>
                  <div className="badge-desc">{a.desc}</div>
                  {a.unlocked && !playerFilter && a.holders.length > 0 && (
                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                      {a.holders.map(h => (
                        <span key={h} style={{
                          background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)',
                          borderRadius: '12px', padding: '2px 8px', fontSize: '0.7rem', color: 'var(--gold)',
                        }}>{h}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
