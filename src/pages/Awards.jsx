import Avatar from '../components/Avatar'
import { useState } from 'react'
import { ACHIEVEMENTS } from '../lib/achievements'

const TIERS = [
  { level: 1, label: '🥉 EINSTEIGER', cls: 'tier-1', ids: ['first_win','iron_wallet','veteran','nit','punktlandung'] },
  { level: 2, label: '🥈 FORTGESCHRITTEN', cls: 'tier-2', ids: ['comeback','night_owl','unzerstoerbar','bad_beat','daylight_robbery','tourney_itm1'] },
  { level: 3, label: '🥇 EXPERTE', cls: 'tier-3', ids: ['big_winner','profit_king','rebuy_king','collector_80','iron_man','legend','hat_trick','tourney_winner','tourney_itm5'] },
  { level: 4, label: '💎 LEGENDE', cls: 'tier-4', ids: ['collector_100','profit_emperor','tourney_3wins'] },
]

const TIER_COLORS = {
  1: 'rgba(180,120,60,0.3)',
  2: 'rgba(160,160,180,0.3)',
  3: 'rgba(220,180,40,0.3)',
  4: 'rgba(100,200,255,0.3)',
}

export default function Awards({ sessions, tournaments, avatars = {} }) {
  const [yearFilter, setYearFilter] = useState(() => {
    const yrs = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
    return yrs.length > 0 ? yrs[0] : 'all'
  })
  const [selectedPlayer, setSelectedPlayer] = useState('all')
  const [openTiers, setOpenTiers] = useState({ 1: true, 2: true, 3: true, 4: true })

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

  // Filter achievements for selected player
  const displayAchs = evaluated.map(a => ({
    ...a,
    unlocked: selectedPlayer === 'all' ? a.unlocked : a.holders.includes(selectedPlayer),
    holders: selectedPlayer === 'all' ? a.holders : (a.holders.includes(selectedPlayer) ? [selectedPlayer] : []),
    showNames: selectedPlayer === 'all',
  }))

  // Sort players by badge count
  const sortedPlayers = [...allPlayers].sort((a, b) =>
    (playerBadgeCount[b] || 0) - (playerBadgeCount[a] || 0)
  )

  function toggleTier(level) {
    setOpenTiers(prev => ({ ...prev, [level]: !prev[level] }))
  }

  const totalAchs = ACHIEVEMENTS.length

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ AWARDS
        </div>
      </div>

      {/* Year filter */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[...years, 'all'].map(y => (
          <button key={y} onClick={() => { setYearFilter(y); setSelectedPlayer(null) }} className="btn-ghost"
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

      {/* Player overview */}
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '20px' }}>

        {/* Alle Button */}
        <div
          onClick={() => setSelectedPlayer('all')}
          style={{
            flexShrink: 0, width: '80px', textAlign: 'center', cursor: 'pointer',
            padding: '12px 8px', borderRadius: '12px',
            border: `1.5px solid ${selectedPlayer === 'all' ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.15)'}`,
            background: selectedPlayer === 'all' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.02)',
            transition: 'all 0.2s',
          }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            background: selectedPlayer === 'all' ? 'rgba(201,168,76,0.2)' : 'rgba(201,168,76,0.06)',
            border: `2px solid ${selectedPlayer === 'all' ? 'var(--gold)' : 'rgba(201,168,76,0.25)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.3rem', margin: '0 auto 6px',
          }}>🃏</div>
          <div style={{
            fontSize: '0.7rem', fontWeight: 600, marginBottom: '6px',
            color: selectedPlayer === 'all' ? 'var(--gold)' : 'var(--text-primary)',
          }}>Alle</div>
          <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
            <div style={{ height: '100%', borderRadius: '2px', width: '100%', background: selectedPlayer === 'all' ? 'var(--gold)' : 'rgba(201,168,76,0.3)' }} />
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            {totalAchs}/{totalAchs}
          </div>
        </div>

        {sortedPlayers.map(name => {
          const count = playerBadgeCount[name] || 0
          const pct = Math.round((count / totalAchs) * 100)
          const isSelected = selectedPlayer === name
          return (
            <div key={name}
              onClick={() => setSelectedPlayer(isSelected ? 'all' : name)}
              style={{
                flexShrink: 0, width: '80px', textAlign: 'center', cursor: 'pointer',
                padding: '12px 8px', borderRadius: '12px',
                border: `1.5px solid ${isSelected ? 'rgba(201,168,76,0.6)' : 'rgba(201,168,76,0.15)'}`,
                background: isSelected ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.2s',
              }}>
              {/* Avatar */}
              <Avatar name={name} src={avatars[name]} size={44} style={{ margin: '0 auto 6px', display: 'block' }} />
              {/* Name */}
              <div style={{
                fontSize: '0.7rem', fontWeight: 600, marginBottom: '6px',
                color: isSelected ? 'var(--gold)' : 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{name}</div>
              {/* Progress bar */}
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  width: `${pct}%`,
                  background: isSelected ? 'var(--gold)' : 'rgba(201,168,76,0.5)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {count}/{totalAchs}
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected player badge count */}
      {selectedPlayer && selectedPlayer !== 'all' && (
        <div style={{
          marginBottom: '16px', padding: '12px 16px', borderRadius: '10px',
          background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', color: 'var(--gold)' }}>
            👤 {selectedPlayer}
          </span>
          <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', color: 'var(--gold)' }}>
            {playerBadgeCount[selectedPlayer] || 0}/{totalAchs} · {Math.round(((playerBadgeCount[selectedPlayer] || 0) / totalAchs) * 100)}%
          </span>
        </div>
      )}

      {/* Achievements by tier */}
      {TIERS.map(tier => {
        const tierAchs = displayAchs.filter(a => tier.ids.includes(a.id))
        const unlockedInTier = tierAchs.filter(a => a.unlocked).length
        const isOpen = openTiers[tier.level]

        return (
          <div key={tier.level} style={{ marginBottom: '12px' }}>
            {/* Tier header */}
            <div
              onClick={() => toggleTier(tier.level)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderRadius: isOpen ? '10px 10px 0 0' : '10px',
                background: TIER_COLORS[tier.level],
                border: '1px solid rgba(255,255,255,0.08)',
                borderBottom: isOpen ? 'none' : '1px solid rgba(255,255,255,0.08)',
                cursor: 'pointer', userSelect: 'none',
              }}>
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.75rem', letterSpacing: '0.1em', color: 'var(--text-primary)' }}>
                {tier.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {unlockedInTier}/{tierAchs.length}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Badges grid */}
            {isOpen && (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px',
                padding: '10px', background: 'rgba(0,0,0,0.15)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderTop: 'none',
                borderRadius: '0 0 10px 10px',
                marginTop: '-1px',
              }}>
                {/* Unlocked first, then locked */}
                {[...tierAchs.filter(a => a.unlocked), ...tierAchs.filter(a => !a.unlocked)].map(a => (
                  <div key={a.id} style={{
                    borderRadius: '10px', padding: '14px 12px', textAlign: 'center',
                    background: a.unlocked ? 'linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.04))' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${a.unlocked ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.05)'}`,
                    opacity: a.unlocked ? 1 : 0.45,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>
                      {a.unlocked ? a.icon : '🔒'}
                    </div>
                    <div style={{
                      fontFamily: 'Cinzel, serif', fontSize: '0.65rem',
                      letterSpacing: '0.08em', color: a.unlocked ? 'var(--gold)' : 'var(--text-muted)',
                      marginBottom: '4px',
                    }}>{a.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.3, marginBottom: a.showNames && a.holders.length > 0 ? '6px' : 0 }}>{a.desc}</div>
                    {a.showNames && a.unlocked && a.holders.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'center', marginTop: '6px' }}>
                        {a.holders.map(h => (
                          <span key={h} style={{
                            background: 'rgba(201,168,76,0.15)', border: '1px solid rgba(201,168,76,0.3)',
                            borderRadius: '10px', padding: '1px 7px', fontSize: '0.62rem', color: 'var(--gold)',
                          }}>{h}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
