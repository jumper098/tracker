import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { formatDate, formatEuro } from '../lib/helpers'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Default blind structure ───────────────────────────────────────────────
const DEFAULT_BLINDS = [
  { sb: 25, bb: 50, duration: 20 },
  { sb: 50, bb: 100, duration: 20 },
  { sb: 75, bb: 150, duration: 20 },
  { sb: 100, bb: 200, duration: 20 },
  { sb: 150, bb: 300, duration: 20 },
  { sb: 200, bb: 400, duration: 20 },
  { sb: 300, bb: 600, duration: 20 },
  { sb: 400, bb: 800, duration: 20 },
  { pause: true, duration: 10, label: 'PAUSE' },
  { sb: 500, bb: 1000, duration: 20 },
  { sb: 750, bb: 1500, duration: 20 },
  { sb: 1000, bb: 2000, duration: 20 },
]

export default function Turnier({ sessions, tournaments, onRefresh, players }) {
  const [view, setView] = useState('home') // home | create | live | history | rankings
  const [activeTournament, setActiveTournament] = useState(null)
  const [confirm, setConfirm] = useState(null)

  // Create form state
  const [tName, setTName] = useState('')
  const [tBuyin, setTBuyin] = useState('20')
  const [tChips, setTChips] = useState('5000')
  const [tPlayers, setTPlayers] = useState([])
  const [blinds, setBlinds] = useState(DEFAULT_BLINDS.map(b => ({ ...b })))
  const [payouts, setPayouts] = useState([{ place: 1, pct: 50 }, { place: 2, pct: 30 }, { place: 3, pct: 20 }])

  // Live timer state
  const [currentLevel, setCurrentLevel] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function startTimerFor(level, t) {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft((t.blinds[level].duration || 20) * 60)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          if (level < t.blinds.length - 1) {
            const next = level + 1
            setCurrentLevel(next)
            showToast(t.blinds[next].pause ? '☕ Pause!' : '🔔 Nächstes Level!')
            startTimerFor(next, t)
          } else {
            showToast('🏁 Letztes Level!')
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function toggleTimer() {
    setPaused(p => {
      if (p) {
        // Resume
        timerRef.current = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) { clearInterval(timerRef.current); return 0 }
            return prev - 1
          })
        }, 1000)
      } else {
        if (timerRef.current) clearInterval(timerRef.current)
      }
      return !p
    })
  }

  function startTournament() {
    if (tPlayers.length < 2) { showToast('⚠ Mindestens 2 Spieler'); return }
    const activeBlinds = blinds.filter(b => b.pause || (b.sb && b.bb))
    if (activeBlinds.length === 0) { showToast('⚠ Mindestens 1 Level'); return }

    const t = {
      id: Date.now().toString(),
      name: tName || 'Turnier',
      buyin: parseFloat(tBuyin) || 20,
      chips: parseInt(tChips) || 5000,
      date: new Date().toISOString().split('T')[0],
      players: tPlayers.map(name => ({ name, eliminated: false, place: null, rebuys: 0 })),
      blinds: activeBlinds,
      payouts,
      results: [],
    }
    setActiveTournament(t)
    setCurrentLevel(0)
    setPaused(false)
    startTimerFor(0, t)
    setView('live')
  }

  async function endTournament() {
    if (!activeTournament) return
    if (timerRef.current) clearInterval(timerRef.current)

    const { error } = await db.from('poker_tournaments').insert([{
      name: activeTournament.name,
      date: activeTournament.date,
      buyin: activeTournament.buyin,
      players: activeTournament.players,
      results: activeTournament.results,
      payouts: activeTournament.payouts,
    }])
    if (error) { showToast('Fehler: ' + error.message); return }
    showToast('✓ Turnier gespeichert!')
    setActiveTournament(null)
    setView('home')
    onRefresh()
  }

  async function deleteTournament(id) {
    setConfirm({
      title: '✕ Turnier löschen?',
      text: 'Dieses Turnier wirklich löschen?',
      onOk: async () => {
        setConfirm(null)
        await db.from('poker_tournaments').delete().eq('id', id)
        showToast('Turnier gelöscht')
        onRefresh()
      }
    })
  }

  function eliminatePlayer(name) {
    setActiveTournament(prev => {
      const remaining = prev.players.filter(p => !p.eliminated).length
      const place = remaining
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name ? { ...p, eliminated: true, place } : p),
        results: [...(prev.results || []), { name, place }],
      }
      // Check if tournament is over (1 player left)
      const stillIn = updated.players.filter(p => !p.eliminated)
      if (stillIn.length === 1) {
        const winner = stillIn[0]
        updated.players = updated.players.map(p => p.name === winner.name ? { ...p, place: 1 } : p)
        updated.results = [...updated.results, { name: winner.name, place: 1 }]
        showToast(`🏆 ${winner.name} gewinnt das Turnier!`)
      }
      return updated
    })
  }

  function addRebuyToPlayer(name) {
    setActiveTournament(prev => ({
      ...prev,
      players: prev.players.map(p => p.name === name ? { ...p, rebuys: (p.rebuys || 0) + 1, eliminated: false, place: null } : p),
    }))
    showToast(`↺ Rebuy für ${name}`)
  }

  const timerMin = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const timerSec = String(timeLeft % 60).padStart(2, '0')
  const currentBlind = activeTournament?.blinds[currentLevel]
  const isPause = currentBlind?.pause
  const nextBlind = activeTournament?.blinds[currentLevel + 1]
  const timerColor = isPause ? '#60a5fa' : timeLeft <= 60 ? '#f87171' : '#4ade80'

  // Quick stats for tournament home
  const allResults = tournaments.flatMap(t => t.results || [])
  const winCounts = {}
  allResults.filter(r => r.place === 1).forEach(r => { winCounts[r.name] = (winCounts[r.name] || 0) + 1 })
  const topWinner = Object.entries(winCounts).sort((a, b) => b[1] - a[1])[0]

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ TURNIER
        </div>
      </div>

      {/* Sub navigation */}
      {view !== 'live' && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'home', label: '🏠 Home' },
            { id: 'create', label: '✚ Erstellen' },
            { id: 'history', label: '📋 Verlauf' },
            { id: 'rankings', label: '🏆 Rangliste' },
          ].map(v => (
            <button key={v.id} onClick={() => setView(v.id)} className="btn-ghost"
              style={{
                whiteSpace: 'nowrap',
                background: view === v.id ? 'rgba(201,168,76,0.2)' : undefined,
                borderColor: view === v.id ? 'rgba(201,168,76,0.5)' : undefined,
                color: view === v.id ? 'var(--gold-light)' : undefined,
              }}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* HOME */}
      {view === 'home' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Turniere', value: tournaments.length },
              { label: 'Top Gewinner', value: topWinner ? `${topWinner[0]} (${topWinner[1]}×)` : '—' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: '14px', textAlign: 'center' }}>
                <div className="font-display" style={{ fontSize: s.label === 'Top Gewinner' ? '0.85rem' : '1.4rem', color: 'var(--gold)' }}>{s.value}</div>
                <div className="section-label" style={{ marginBottom: 0 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {activeTournament && (
            <div className="card" style={{ marginBottom: '16px', padding: '16px', border: '1px solid rgba(201,168,76,0.4)' }}>
              <div className="font-display" style={{ fontSize: '0.8rem', color: 'var(--gold)', marginBottom: '8px' }}>
                🎰 LAUFENDES TURNIER
              </div>
              <div style={{ marginBottom: '12px' }}>{activeTournament.name}</div>
              <button className="btn-gold" style={{ width: '100%' }} onClick={() => setView('live')}>
                ▶ Zum Live-View
              </button>
            </div>
          )}

          <button className="btn-gold" style={{ width: '100%' }} onClick={() => setView('create')}>
            ✚ Neues Turnier erstellen
          </button>
        </div>
      )}

      {/* CREATE */}
      {view === 'create' && (
        <div>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ marginBottom: '14px' }}>
              <label className="section-label">Turnier Name</label>
              <input className="input-field" placeholder="Poker Night #1" value={tName} onChange={e => setTName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label className="section-label">Buy-In (€)</label>
                <input className="input-field" type="number" value={tBuyin} onChange={e => setTBuyin(e.target.value)} />
              </div>
              <div>
                <label className="section-label">Start-Chips</label>
                <input className="input-field" type="number" value={tChips} onChange={e => setTChips(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>
              SPIELER ({tPlayers.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {players.map(name => (
                <button key={name} onClick={() => setTPlayers(prev => prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name])}
                  style={{
                    padding: '6px 14px', borderRadius: '20px', cursor: 'pointer',
                    border: `1px solid ${tPlayers.includes(name) ? 'rgba(201,168,76,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    background: tPlayers.includes(name) ? 'rgba(201,168,76,0.15)' : 'transparent',
                    color: tPlayers.includes(name) ? 'var(--gold)' : 'var(--text-muted)',
                    fontSize: '0.85rem', transition: 'all 0.2s',
                  }}>
                  {tPlayers.includes(name) ? '✓ ' : ''}{name}
                </button>
              ))}
            </div>
          </div>

          {/* Blind structure */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>
              BLIND STRUKTUR
            </div>
            {blinds.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                {b.pause ? (
                  <div style={{ flex: 1, color: '#60a5fa', fontSize: '0.85rem', padding: '8px 0' }}>☕ PAUSE</div>
                ) : (
                  <>
                    <input className="input-field" type="number" placeholder="SB" value={b.sb}
                      onChange={e => setBlinds(prev => prev.map((bl, idx) => idx === i ? { ...bl, sb: e.target.value } : bl))}
                      style={{ flex: 1 }} />
                    <input className="input-field" type="number" placeholder="BB" value={b.bb}
                      onChange={e => setBlinds(prev => prev.map((bl, idx) => idx === i ? { ...bl, bb: e.target.value } : bl))}
                      style={{ flex: 1 }} />
                  </>
                )}
                <input className="input-field" type="number" placeholder="Min" value={b.duration}
                  onChange={e => setBlinds(prev => prev.map((bl, idx) => idx === i ? { ...bl, duration: e.target.value } : bl))}
                  style={{ width: '60px', flex: 'none' }} />
                <button className="btn-danger" onClick={() => setBlinds(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem' }}
                onClick={() => setBlinds(prev => [...prev, { sb: '', bb: '', duration: 20 }])}>
                + LEVEL
              </button>
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}
                onClick={() => setBlinds(prev => [...prev, { pause: true, duration: 10 }])}>
                ☕ PAUSE
              </button>
            </div>
          </div>

          {/* Payouts */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>
              AUSZAHLUNG
            </div>
            {payouts.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ minWidth: '24px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>#{p.place}</div>
                <input className="input-field" type="number" placeholder="%" value={p.pct}
                  onChange={e => setPayouts(prev => prev.map((po, idx) => idx === i ? { ...po, pct: parseFloat(e.target.value) } : po))}
                  style={{ flex: 1 }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
                <button className="btn-danger" onClick={() => setPayouts(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
              </div>
            ))}
            <button className="btn-ghost" style={{ width: '100%', fontSize: '0.65rem', marginTop: '4px' }}
              onClick={() => setPayouts(prev => [...prev, { place: prev.length + 1, pct: 0 }])}>
              + PLATZ
            </button>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'right' }}>
              Gesamt: {payouts.reduce((s, p) => s + (p.pct || 0), 0).toFixed(0)}%
            </div>
          </div>

          <button className="btn-gold" style={{ width: '100%' }} onClick={startTournament}>
            🎰 Turnier starten
          </button>
        </div>
      )}

      {/* LIVE */}
      {view === 'live' && activeTournament && (
        <div>
          <div className="font-display" style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--gold)', marginBottom: '4px', letterSpacing: '0.15em' }}>
            {activeTournament.name}
          </div>

          {/* Timer card */}
          <div className="card" style={{ textAlign: 'center', padding: '24px 16px', marginBottom: '16px' }}>
            {isPause ? (
              <div style={{ fontSize: '0.85rem', color: '#60a5fa', fontFamily: 'Cinzel', letterSpacing: '0.2em', marginBottom: '8px' }}>☕ PAUSE</div>
            ) : (
              <div style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'Cinzel' }}>LEVEL {currentLevel + 1}</span>
                <div style={{ fontSize: '1.1rem', color: 'var(--gold)', fontFamily: 'Cinzel', marginTop: '2px' }}>
                  {currentBlind?.sb} / {currentBlind?.bb}
                </div>
              </div>
            )}
            <div style={{ fontSize: '3.5rem', fontFamily: 'Cinzel', color: timerColor, letterSpacing: '0.1em', lineHeight: 1 }}>
              {timerMin}:{timerSec}
            </div>
            {nextBlind && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                Nächstes: {nextBlind.pause ? '☕ Pause' : `${nextBlind.sb}/${nextBlind.bb}`} ({nextBlind.duration} min)
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
              <button className="btn-ghost" onClick={toggleTimer} style={{ fontSize: '0.75rem', padding: '8px 20px' }}>
                {paused ? '▶ Weiter' : '⏸ Pause'}
              </button>
              <button className="btn-ghost" onClick={() => {
                if (currentLevel < activeTournament.blinds.length - 1) {
                  const next = currentLevel + 1
                  setCurrentLevel(next)
                  startTimerFor(next, activeTournament)
                }
              }} style={{ fontSize: '0.75rem', padding: '8px 20px' }}>
                ⏭ Weiter
              </button>
            </div>
          </div>

          {/* Players */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>
              SPIELER ({activeTournament.players.filter(p => !p.eliminated).length} übrig)
            </div>
            {activeTournament.players.filter(p => !p.eliminated).map(p => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  {p.rebuys > 0 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.rebuys}× Rebuy</div>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-ghost" style={{ fontSize: '0.65rem', padding: '4px 8px' }}
                    onClick={() => addRebuyToPlayer(p.name)}>↺</button>
                  <button className="btn-danger" style={{ fontSize: '0.72rem' }}
                    onClick={() => eliminatePlayer(p.name)}>✕ Out</button>
                </div>
              </div>
            ))}

            {activeTournament.players.filter(p => p.eliminated).length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <div className="section-label">Ausgeschieden</div>
                {activeTournament.players.filter(p => p.eliminated)
                  .sort((a, b) => (a.place || 99) - (b.place || 99))
                  .map(p => (
                    <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', opacity: 0.6, fontSize: '0.85rem' }}>
                      <span>{p.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>#{p.place}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setView('home')}>← Zurück</button>
            <button className="btn-gold" style={{ flex: 1 }} onClick={endTournament}>🏁 Beenden & Speichern</button>
          </div>
        </div>
      )}

      {/* HISTORY */}
      {view === 'history' && (
        <div>
          {tournaments.length === 0 && <div className="empty-state">Noch keine Turniere ♠</div>}
          {[...tournaments].sort((a, b) => b.date?.localeCompare(a.date)).map(t => (
            <div key={t.id} className="card" style={{ marginBottom: '12px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div className="font-display" style={{ fontSize: '0.85rem', color: 'var(--gold)' }}>{t.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {formatDate(t.date)} · {(t.players||[]).length} Spieler · {formatEuro(t.buyin)} Buy-In
                  </div>
                </div>
                <button className="btn-danger" onClick={() => deleteTournament(t.id)}>✕</button>
              </div>
              {(t.results || []).slice(0, 3).map(r => (
                <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0' }}>
                  <span>{r.place === 1 ? '🥇' : r.place === 2 ? '🥈' : r.place === 3 ? '🥉' : `#${r.place}`} {r.name}</span>
                  {r.payout && <span style={{ color: '#4ade80' }}>+{formatEuro(r.payout)}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* RANKINGS */}
      {view === 'rankings' && (
        <div>
          {(() => {
            const statsMap = {}
            tournaments.forEach(t => {
              const playerCount = (t.players || []).length
              ;(t.results || []).forEach(r => {
                if (!statsMap[r.name]) statsMap[r.name] = { name: r.name, tournaments: 0, wins: 0, itm: 0, earnings: 0 }
                statsMap[r.name].tournaments++
                if (r.place === 1) statsMap[r.name].wins++
                if (r.place <= Math.max(3, Math.floor(playerCount * 0.33))) statsMap[r.name].itm++
                if (r.payout) statsMap[r.name].earnings += r.payout
              })
            })
            const ranked = Object.values(statsMap).sort((a, b) => b.wins - a.wins || b.itm - a.itm)
            if (ranked.length === 0) return <div className="empty-state">Noch keine Daten ♠</div>
            return ranked.map((p, i) => (
              <div key={p.name} className="card" style={{ marginBottom: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: i < 3 ? '1.3rem' : '0.9rem', minWidth: '28px' }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {p.tournaments} Turniere · {p.wins} Siege · {p.itm}× ITM
                    </div>
                  </div>
                  {p.earnings > 0 && (
                    <div className="font-display profit-pos" style={{ fontSize: '0.9rem' }}>+{formatEuro(p.earnings)}</div>
                  )}
                </div>
              </div>
            ))
          })()}
        </div>
      )}

      {confirm && (
        <ConfirmDialog title={confirm.title} text={confirm.text} okLabel="Löschen"
          onOk={confirm.onOk} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
