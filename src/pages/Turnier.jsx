import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { formatDate, formatEuro } from '../lib/helpers'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

// Sync live tournament to/from Supabase live_tournament table
function useLiveTournamentSync(activeTournament, setActiveTournament, setView, currentLevel, timeLeft, paused) {
  const isHostRef = useRef(false)

  // On mount: check if there's a live tournament in DB
  useEffect(() => {
    async function checkLive() {
      const { data } = await db.from('live_tournament').select('data').eq('id', 'current').single()
      if (data?.data && !activeTournament) {
        setActiveTournament({ ...data.data.tournament, readOnly: true })
        setView('live')
      }
    }
    checkLive()

    // Subscribe to realtime changes on live_tournament
    const channel = db.channel('live_tournament_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_tournament' }, (payload) => {
        if (isHostRef.current) return // Host doesn't need to react to own updates
        const d = payload.new?.data
        if (d?.tournament) {
          setActiveTournament(prev => {
            if (!prev || prev.readOnly) return { ...d.tournament, readOnly: true }
            return prev
          })
          setView('live')
        } else if (!d) {
          // Tournament ended
          setActiveTournament(prev => prev?.readOnly ? null : prev)
          setView(prev => prev === 'live' ? 'create' : prev)
        }
      })
      .subscribe()

    return () => { db.removeChannel(channel) }
  }, [])

  // When host updates tournament state, push to DB (throttled)
  const lastSyncRef = useRef(0)
  useEffect(() => {
    if (!activeTournament || activeTournament.readOnly) return
    isHostRef.current = true
    const now = Date.now()
    if (now - lastSyncRef.current < 2000) return // max once per 2 seconds
    lastSyncRef.current = now
    db.from('live_tournament').upsert({
      id: 'current',
      data: { tournament: activeTournament, level: currentLevel, timeLeft, paused },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' }).then(() => {})
  }, [JSON.stringify(activeTournament?.players), currentLevel, Math.floor(timeLeft / 10)])
}

// ─── Blind Presets ────────────────────────────────────────────────────────────
const BLIND_PRESETS = {
  turbo: {
    label: '⚡ TURBO', color: '#f87171', desc: '12 Min · 10 Level',
    chips: 4200,
    blinds: [
      {sb:5,bb:10,duration:12},{sb:10,bb:25,duration:12},{sb:25,bb:50,duration:12},
      {sb:50,bb:100,duration:12},{sb:75,bb:150,duration:12},{sb:100,bb:200,duration:12},
      {sb:125,bb:250,duration:12},{sb:150,bb:300,duration:12},{sb:200,bb:400,duration:12},
      {sb:250,bb:500,duration:12},
    ]
  },
  standard: {
    label: '♠ STANDARD', color: '#C9A84C', desc: '20 Min · 14 Level',
    chips: 4800,
    blinds: [
      {sb:5,bb:10,duration:20},{sb:10,bb:25,duration:20},{sb:25,bb:50,duration:20},
      {sb:35,bb:75,duration:20},{sb:50,bb:100,duration:20},{sb:75,bb:150,duration:20},
      {sb:100,bb:200,duration:20},{sb:125,bb:250,duration:20},{sb:150,bb:300,duration:20},
      {sb:175,bb:350,duration:20},{sb:200,bb:400,duration:20},{sb:225,bb:450,duration:20},
      {sb:250,bb:500,duration:20},{sb:300,bb:600,duration:20},
    ]
  },
  deepstack: {
    label: '🏔 DEEP STACK', color: '#60a5fa', desc: '30 Min · 12 Level',
    chips: 5500,
    blinds: [
      {sb:5,bb:10,duration:30},{sb:10,bb:25,duration:30},{sb:25,bb:50,duration:30},
      {sb:35,bb:75,duration:30},{sb:50,bb:100,duration:30},{sb:75,bb:150,duration:30},
      {sb:100,bb:200,duration:30},{sb:150,bb:300,duration:30},{sb:200,bb:400,duration:30},
      {sb:250,bb:500,duration:30},{sb:300,bb:600,duration:30},{sb:350,bb:700,duration:30},
    ]
  },
}

export default function Turnier({ sessions, tournaments, onRefresh, players, avatars = {} }) {
  const [view, setView] = useState('create')
  const [activeTournament, setActiveTournament] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [detailTournament, setDetailTournament] = useState(null)

  // Create form
  const [tName, setTName] = useState('Poker Turnier')
  const [tBuyin, setTBuyin] = useState('20')
  const [tChips, setTChips] = useState('5000')
  const [tPlayers, setTPlayers] = useState([])
  const [selectedPreset, setSelectedPreset] = useState('standard')
  const [blinds, setBlinds] = useState(BLIND_PRESETS.standard.blinds.map(b => ({...b})))
  const [payouts, setPayouts] = useState([{place:1,pct:50},{place:2,pct:30},{place:3,pct:20}])
  const [globalDuration, setGlobalDuration] = useState('')

  // Live timer
  const [currentLevel, setCurrentLevel] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef(null)
  const pausedRef = useRef(false)

  // Live sync
  useLiveTournamentSync(activeTournament, setActiveTournament, setView, currentLevel, timeLeft, paused)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function startTimerFor(level, t) {
    if (timerRef.current) clearInterval(timerRef.current)
    const secs = (t.blinds[level].duration || 20) * 60
    setTimeLeft(secs)
    pausedRef.current = false
    setPaused(false)
    timerRef.current = setInterval(() => {
      if (pausedRef.current) return
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setCurrentLevel(lvl => {
            const next = lvl + 1
            if (next < t.blinds.length) {
              showToast(t.blinds[next].pause ? '☕ Pause!' : '🔔 Nächstes Level!')
              setTimeout(() => startTimerFor(next, t), 100)
              return next
            }
            showToast('🏁 Letztes Level!')
            return lvl
          })
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function toggleTimer() {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }

  function applyPreset(key) {
    const p = BLIND_PRESETS[key]
    setSelectedPreset(key)
    setBlinds(p.blinds.map(b => ({...b})))
    setTChips(String(p.chips))
  }

  function applyGlobalDuration() {
    const d = parseInt(globalDuration)
    if (!d) return
    setBlinds(prev => prev.map(b => b.pause ? b : {...b, duration: d}))
  }

  function calcPayouts(pot, payoutPcts) {
    return payoutPcts.map(p => Math.round(pot * p.pct / 100))
  }

  function getTotalPot(t) {
    const totalRebuys = t.players.reduce((s, p) => s + (p.rebuys || 0), 0)
    return (t.players.length + totalRebuys) * t.buyin
  }

  function startTournament() {
    if (tPlayers.length < 2) { showToast('⚠ Mindestens 2 Spieler'); return }
    const activeBlinds = blinds.filter(b => b.pause || (b.sb && b.bb))
    if (activeBlinds.length === 0) { showToast('⚠ Mindestens 1 Level'); return }
    const pot = tPlayers.length * parseFloat(tBuyin || 20)
    const payoutAmounts = calcPayouts(pot, payouts)
    const t = {
      id: Date.now().toString(),
      name: tName || 'Turnier',
      buyin: parseFloat(tBuyin) || 20,
      chips: parseInt(tChips) || 5000,
      date: new Date().toISOString().split('T')[0],
      players: tPlayers.map(name => ({ name, eliminated: false, place: null, rebuys: 0 })),
      blinds: activeBlinds,
      payouts,
      payoutAmounts,
      results: [],
    }
    setActiveTournament(t)
    setCurrentLevel(0)
    startTimerFor(0, t)
    setView('live')
    // Notify others via Supabase realtime (they see via shared state)
  }

  function addRebuy(name) {
    setActiveTournament(prev => {
      if (prev?.readOnly) {
        // Viewer is making a change — become co-editor
        isHostRef.current = true
      }
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name ? {...p, rebuys: (p.rebuys||0)+1, eliminated: false, place: null} : p)
      }
      const pot = getTotalPot(updated)
      updated.payoutAmounts = calcPayouts(pot, updated.payouts)
      return updated
    })
    showToast(`↺ Rebuy für ${name}`)
  }

  function removeRebuy(name) {
    setActiveTournament(prev => {
      const player = prev.players.find(p => p.name === name)
      if (!player || (player.rebuys || 0) <= 0) return prev
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name ? {...p, rebuys: Math.max(0, (p.rebuys||0)-1)} : p)
      }
      updated.payoutAmounts = calcPayouts(getTotalPot(updated), updated.payouts)
      return updated
    })
  }

  function eliminatePlayer(name) {
    setActiveTournament(prev => {
      const remaining = prev.players.filter(p => !p.eliminated).length
      const place = remaining
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name ? {...p, eliminated: true, place} : p),
        results: [...(prev.results||[]), {name, place}],
      }
      const stillIn = updated.players.filter(p => !p.eliminated)
      if (stillIn.length === 1) {
        const winner = stillIn[0]
        updated.players = updated.players.map(p => p.name === winner.name ? {...p, place: 1} : p)
        updated.results = [...updated.results, {name: winner.name, place: 1}]
        showToast(`🏆 ${winner.name} gewinnt!`)
      }
      return updated
    })
  }

  async function endTournament() {
    if (!activeTournament) return
    if (timerRef.current) clearInterval(timerRef.current)
    const pot = getTotalPot(activeTournament)
    const payoutAmounts = calcPayouts(pot, activeTournament.payouts)
    const results = activeTournament.results.map(r => ({
      ...r,
      payout: payoutAmounts[r.place - 1] || 0
    }))
    const { error } = await db.from('poker_tournaments').insert([{
      id: crypto.randomUUID(),
      name: activeTournament.name,
      date: activeTournament.date,
      buyin: activeTournament.buyin,
      players: activeTournament.players,
      results,
      payouts: activeTournament.payouts,
    }])
    if (error) { showToast('Fehler: ' + error.message); return }
    // Clear live tournament from DB
    const { error: delError } = await db.from('live_tournament').delete().eq('id', 'current')
    if (delError) console.warn('Could not clear live tournament:', delError.message)
    showToast('✓ Turnier gespeichert!')
    setActiveTournament(null)
    setView('create')
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

  const timerMin = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const timerSec = String(timeLeft % 60).padStart(2, '0')
  const currentBlind = activeTournament?.blinds[currentLevel]
  const isPause = currentBlind?.pause
  const nextBlind = activeTournament?.blinds[currentLevel + 1]
  const realLevelNum = activeTournament ? activeTournament.blinds.slice(0, currentLevel + 1).filter(b => !b.pause).length : 0
  const timerColor = isPause ? '#60a5fa' : timeLeft <= 60 ? '#f87171' : '#4ade80'
  const totalPot = activeTournament ? getTotalPot(activeTournament) : 0
  const totalRebuys = activeTournament ? activeTournament.players.reduce((s,p) => s+(p.rebuys||0), 0) : 0

  // Tournament stats for home
  const allResults = tournaments.flatMap(t => t.results || [])
  const winCounts = {}
  allResults.filter(r => r.place === 1).forEach(r => { winCounts[r.name] = (winCounts[r.name]||0)+1 })
  const topWinner = Object.entries(winCounts).sort((a,b) => b[1]-a[1])[0]

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ TURNIER
        </div>
      </div>

      {/* Sub nav */}
      {view !== 'live' && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
          {[
            ...(activeTournament ? [{id:'live',label:'🔴 Live'}] : []),
            {id:'create',label:'✚ Erstellen'},
            {id:'history',label:'📋 Verlauf'},
            {id:'rankings',label:'🏆 Rangliste'},
          ].map(v => (
            <button key={v.id} onClick={() => setView(v.id)} className="btn-ghost"
              style={{
                flex:1, textAlign:'center', fontSize:'0.65rem',
                background: view===v.id ? 'rgba(201,168,76,0.2)' : undefined,
                borderColor: v.id==='live' ? 'rgba(248,113,113,0.5)' : view===v.id ? 'rgba(201,168,76,0.5)' : undefined,
                color: v.id==='live' ? '#f87171' : view===v.id ? 'var(--gold-light)' : undefined,
              }}>{v.label}</button>
          ))}
        </div>
      )}



      {/* ── CREATE ── */}
      {view === 'create' && (
        <div>
          {/* Basic info */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div style={{ marginBottom: '12px' }}>
              <label className="section-label">Turniername</label>
              <input className="input-field" value={tName} onChange={e => setTName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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

          {/* Blind presets */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>BLIND-STRUKTUR</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              {Object.entries(BLIND_PRESETS).map(([key, preset]) => (
                <button key={key} onClick={() => applyPreset(key)} style={{
                  padding: '14px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                  border: `1px solid ${selectedPreset === key ? preset.color : preset.color + '40'}`,
                  background: selectedPreset === key ? preset.color + '18' : preset.color + '08',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', color: preset.color, marginBottom: '4px' }}>{preset.label}</div>
                  <div style={{ fontSize: '0.62rem', color: preset.color + '99' }}>{preset.desc}</div>
                </button>
              ))}
              <button onClick={() => { setSelectedPreset('custom'); setBlinds([{sb:'',bb:'',duration:20}]) }} style={{
                padding: '14px 10px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                border: `1px solid ${selectedPreset === 'custom' ? '#a78bfa' : '#a78bfa40'}`,
                background: selectedPreset === 'custom' ? '#a78bfa18' : '#a78bfa08',
              }}>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', color: '#a78bfa', marginBottom: '4px' }}>✏ CUSTOM</div>
                <div style={{ fontSize: '0.62rem', color: '#a78bfa99' }}>Eigene Struktur</div>
              </button>
            </div>

            {/* Global duration */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Cinzel, serif', whiteSpace: 'nowrap' }}>Alle Level:</span>
              <input className="input-field" type="number" placeholder="Min" value={globalDuration}
                onChange={e => setGlobalDuration(e.target.value)}
                style={{ width: '70px', textAlign: 'center' }} />
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem' }} onClick={applyGlobalDuration}>✓ Übernehmen</button>
            </div>

            {/* Blind table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr 56px 32px', gap: '4px', padding: '4px 6px', borderRadius: '6px', background: 'rgba(201,168,76,0.08)', marginBottom: '6px' }}>
              {['#','SB','BB','MIN',''].map((h,i) => (
                <div key={i} style={{ fontFamily: 'Cinzel, serif', fontSize: '0.52rem', color: 'var(--gold)', textAlign: 'center' }}>{h}</div>
              ))}
            </div>

            {/* Blind rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
              {blinds.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 1fr 56px 32px', gap: '4px', alignItems: 'center' }}>
                  <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{b.pause ? '☕' : i+1}</div>
                  {b.pause ? (
                    <div style={{ gridColumn: '2/4', fontSize: '0.8rem', color: '#60a5fa', padding: '6px 8px' }}>PAUSE</div>
                  ) : (
                    <>
                      <input className="input-field" type="number" value={b.sb} style={{ padding: '6px 8px', textAlign: 'center' }}
                        onChange={e => setBlinds(prev => prev.map((bl,idx) => idx===i ? {...bl,sb:e.target.value} : bl))} />
                      <input className="input-field" type="number" value={b.bb} style={{ padding: '6px 8px', textAlign: 'center' }}
                        onChange={e => setBlinds(prev => prev.map((bl,idx) => idx===i ? {...bl,bb:e.target.value} : bl))} />
                    </>
                  )}
                  <input className="input-field" type="number" value={b.duration} style={{ padding: '6px 8px', textAlign: 'center' }}
                    onChange={e => setBlinds(prev => prev.map((bl,idx) => idx===i ? {...bl,duration:e.target.value} : bl))} />
                  <button className="btn-danger" style={{ padding: '4px' }} onClick={() => setBlinds(prev => prev.filter((_,idx) => idx!==i))}>✕</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem' }}
                onClick={() => setBlinds(prev => [...prev, {sb:'',bb:'',duration:20}])}>+ Level</button>
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}
                onClick={() => setBlinds(prev => [...prev, {pause:true,duration:10}])}>☕ Pause</button>
            </div>
          </div>

          {/* Payouts */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>AUSZAHLUNGSSTRUKTUR</div>

            {payouts.map((p, i) => {
              const pot = tPlayers.length * parseFloat(tBuyin||20)
              const euroVal = Math.round(pot * p.pct / 100)
              return (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ minWidth: '24px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                    {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                  </span>
                  <input
                    className="input-field"
                    type="text"
                    inputMode="decimal"
                    value={p.pct === 0 ? '' : String(p.pct)}
                    placeholder="0"
                    onChange={e => {
                      const raw = e.target.value.replace(',', '.')
                      const val = raw === '' ? 0 : parseFloat(raw)
                      setPayouts(prev => prev.map((po, idx) => idx === i ? {...po, pct: isNaN(val) ? 0 : val} : po))
                    }}
                    style={{ flex: 1, textAlign: 'center' }}
                  />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>%</span>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', color: 'var(--gold)', minWidth: '48px', textAlign: 'right' }}>
                    {tPlayers.length > 0 ? euroVal + '€' : '—'}
                  </span>
                  <button className="btn-danger" onClick={() => setPayouts(prev => prev.filter((_,idx) => idx!==i).map((po,idx)=>({...po,place:idx+1})))}>✕</button>
                </div>
              )
            })}

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem' }}
                onClick={() => setPayouts(prev => [...prev, {place:prev.length+1,pct:0}])}>+ Platz</button>
              <button className="btn-ghost" style={{ flex: 1, fontSize: '0.65rem', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}
                onClick={() => {
                  const n = payouts.length
                  const presets = {
                    1:[100], 2:[65,35], 3:[50,30,20], 4:[45,28,17,10], 5:[40,25,17,11,7]
                  }
                  const pcts = presets[Math.min(n,5)] || (() => {
                    // For >5 places: distribute evenly with top-heavy weighting
                    const base = Math.floor(100 / n)
                    const arr = Array(n).fill(base)
                    let remainder = 100 - base * n
                    for (let i = 0; i < remainder; i++) arr[i]++
                    return arr
                  })()
                  setPayouts(pcts.map((pct,i) => ({place:i+1, pct})))
                }}>⚡ Auto</button>
            </div>

            {/* Auto preview per place count */}
            <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'Cinzel, serif', color: '#60a5fa', marginRight: '6px' }}>⚡ Auto:</span>
              {payouts.length === 1 && '1. Platz: 100%'}
              {payouts.length === 2 && '1. 65% · 2. 35%'}
              {payouts.length === 3 && '1. 50% · 2. 30% · 3. 20%'}
              {payouts.length === 4 && '1. 45% · 2. 28% · 3. 17% · 4. 10%'}
              {payouts.length === 5 && '1. 40% · 2. 25% · 3. 17% · 4. 11% · 5. 7%'}
              {payouts.length > 5 && 'Gleichmäßige Verteilung'}
            </div>

            <div style={{ fontSize: '0.75rem', color: payouts.reduce((s,p)=>s+(p.pct||0),0)===100?'#4ade80':'#f87171', textAlign: 'right', marginTop: '8px', fontFamily: 'Cinzel, serif' }}>
              Gesamt: {payouts.reduce((s,p)=>s+(p.pct||0),0).toFixed(1)}%
              {payouts.reduce((s,p)=>s+(p.pct||0),0)===100 && ' ✓'}
            </div>
          </div>

          {/* Players */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--gold)', letterSpacing: '0.1em', marginBottom: '12px' }}>
              SPIELER ({tPlayers.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {players.map(name => (
                <button key={name} onClick={() => setTPlayers(prev => prev.includes(name) ? prev.filter(p=>p!==name) : [...prev,name])}
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

          <button className="btn-gold" style={{ width: '100%' }} onClick={startTournament}>🎰 Turnier starten</button>
        </div>
      )}

      {/* ── LIVE ── */}
      {view === 'live' && activeTournament && (
        <div>
          {/* Header bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-display" style={{ fontSize: '0.7rem', color: 'var(--gold-light)' }}>{activeTournament.name}</span>
            <span style={{ fontSize: '0.7rem', color: activeTournament.readOnly ? '#f472b6' : 'var(--text-muted)' }}>
              {activeTournament.readOnly ? '👁 Live' : `${activeTournament.players.filter(p=>!p.eliminated).length} im Spiel`}
            </span>
          </div>

          {/* Timer card */}
          <div style={{ borderRadius: '14px', background: 'rgba(0,0,0,0.35)', border: `1px solid ${isPause ? 'rgba(96,165,250,0.3)' : 'rgba(201,168,76,0.2)'}`, marginBottom: '14px', overflow: 'hidden' }}>
            {isPause ? (
              <div style={{ textAlign: 'center', padding: '18px 16px 12px' }}>
                <div className="font-display" style={{ fontSize: '0.6rem', color: '#60a5fa', letterSpacing: '0.18em', marginBottom: '6px' }}>☕ PAUSE</div>
                <div style={{ fontFamily: 'Cinzel, serif', fontSize: '3.8rem', color: timerColor, lineHeight: 1, letterSpacing: '0.05em' }}>{timerMin}:{timerSec}</div>
                {nextBlind && !nextBlind.pause && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '10px' }}>
                    Nächste Blinds → <span style={{ color: 'var(--gold)' }}>{nextBlind.sb} / {nextBlind.bb}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', padding: '18px 16px 10px' }}>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.18em', marginBottom: '4px' }}>LEVEL {realLevelNum}</div>
                  <div style={{ fontFamily: 'Cinzel, serif', fontSize: '5rem', color: timerColor, lineHeight: 1, letterSpacing: '0.05em' }}>{timerMin}:{timerSec}</div>
                </div>
                {/* SB / BB / POT */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', background: 'rgba(201,168,76,0.06)', borderTop: '1px solid rgba(201,168,76,0.2)' }}>
                  {[
                    {label:'SMALL BLIND', value: currentBlind?.sb},
                    {label:'BIG BLIND', value: currentBlind?.bb},
                    {label:'POT', value: totalPot+'€', color:'#4ade80'},
                  ].map((item, i) => (
                    <>
                      {i > 0 && <div key={`sep${i}`} style={{ background: 'rgba(201,168,76,0.15)' }} />}
                      <div key={item.label} style={{ textAlign: 'center', padding: '12px 6px' }}>
                        <div style={{ fontSize: '0.48rem', color: 'var(--text-muted)', letterSpacing: '0.12em', marginBottom: '3px' }}>{item.label}</div>
                        <div className="font-display" style={{ fontSize: '2rem', color: item.color || 'var(--gold)', lineHeight: 1 }}>{item.value}</div>
                      </div>
                    </>
                  ))}
                </div>
                {/* Next level */}
                {nextBlind && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ textAlign: 'center', padding: '7px 6px' }}>
                      <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginBottom: '2px' }}>{nextBlind.pause ? 'PAUSE' : 'NÄCHSTES SB'}</div>
                      <div className="font-display" style={{ fontSize: '1.05rem', color: 'rgba(201,168,76,0.35)' }}>{nextBlind.pause ? '☕' : nextBlind.sb}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div style={{ textAlign: 'center', padding: '7px 6px' }}>
                      <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginBottom: '2px' }}>{nextBlind.pause ? `${nextBlind.duration} MIN` : 'NÄCHSTES BB'}</div>
                      <div className="font-display" style={{ fontSize: '1.05rem', color: 'rgba(201,168,76,0.35)' }}>{nextBlind.pause ? '' : nextBlind.bb}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div style={{ textAlign: 'center', padding: '7px 6px' }}>
                      <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', marginBottom: '2px' }}>LEVEL {realLevelNum+1}</div>
                      <div className="font-display" style={{ fontSize: '1.05rem', color: 'rgba(201,168,76,0.35)' }}>{nextBlind.pause ? '' : `${nextBlind.duration}min`}</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', padding: '10px 16px 14px' }}>
              <button onClick={toggleTimer} style={{
                padding: '9px 22px', borderRadius: '8px', cursor: 'pointer',
                border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.12)',
                color: '#4ade80', fontFamily: 'Cinzel, serif', fontSize: '0.72rem',
              }}>{paused ? '▶ WEITER' : '⏸ PAUSE'}</button>
              <button onClick={() => { if(currentLevel>0){setCurrentLevel(l=>l-1);startTimerFor(currentLevel-1,activeTournament)} }}
                disabled={currentLevel===0}
                style={{ padding:'9px 16px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'0.8rem',cursor:'pointer',opacity:currentLevel===0?0.3:1 }}>◄</button>
              <button onClick={() => { const next=currentLevel+1; if(next<activeTournament.blinds.length){setCurrentLevel(next);startTimerFor(next,activeTournament)} }}
                disabled={currentLevel>=activeTournament.blinds.length-1}
                style={{ padding:'9px 16px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'0.8rem',cursor:'pointer',opacity:currentLevel>=activeTournament.blinds.length-1?0.3:1 }}>►</button>
            </div>
          </div>

          {/* Pot summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '14px' }}>
            {[
              {label:'GESAMTPOT', value: totalPot+'€', color:'var(--gold)'},
              {label:'BUY-INS', value: activeTournament.players.length, color:'#4ade80'},
              {label:'REBUYS', value: totalRebuys, color:'#f472b6'},
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', padding:'10px 8px', borderRadius:'10px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:'0.48rem', color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:'4px', fontFamily:'Cinzel,serif' }}>{s.label}</div>
                <div className="font-display" style={{ fontSize:'1.4rem', color:s.color, lineHeight:1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Payout preview */}
          {activeTournament.payouts.some(p=>p.pct>0) && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
              {activeTournament.payouts.filter(p=>p.pct>0).map((p,i) => (
                <div key={i} style={{ flex:1, textAlign:'center', padding:'8px 4px', borderRadius:'8px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize:'1rem' }}>{['🥇','🥈','🥉','4.','5.'][i]||`${i+1}.`}</div>
                  <div className="font-display" style={{ fontSize:'0.9rem', color:'var(--gold)' }}>
                    {Math.round(totalPot * p.pct / 100)}€
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active players with rebuy */}
          <div style={{ marginBottom: '14px' }}>
            <div className="font-display" style={{ fontSize: '0.7rem', color: '#4ade80', letterSpacing: '0.12em', marginBottom: '8px' }}>
              NOCH IM SPIEL ({activeTournament.players.filter(p=>!p.eliminated).length})
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              {activeTournament.players.filter(p=>!p.eliminated).map(p => (
                <div key={p.name} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 8px', borderRadius:'10px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  {avatars[p.name] ? (
                    <img src={avatars[p.name]} alt={p.name} style={{ width:'22px',height:'22px',borderRadius:'50%',objectFit:'cover',flexShrink:0 }} />
                  ) : (
                    <div style={{ width:'22px',height:'22px',borderRadius:'50%',background:'rgba(201,168,76,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',flexShrink:0 }}>👤</div>
                  )}
                  <span style={{ flex:1, fontSize:'0.72rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                  {(p.rebuys||0) > 0 && (
                    <>
                      <span style={{ fontFamily:'Cinzel,serif',fontSize:'0.65rem',color:'#f472b6',background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.3)',borderRadius:'6px',padding:'1px 5px',flexShrink:0 }}>{p.rebuys}×</span>
                      <button onClick={() => removeRebuy(p.name)} style={{ width:'18px',height:'18px',borderRadius:'50%',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer',flexShrink:0 }}>−</button>
                    </>
                  )}
                  <button onClick={() => addRebuy(p.name)} style={{ width:'18px',height:'18px',borderRadius:'50%',border:'1px solid rgba(244,114,182,0.4)',background:'rgba(244,114,182,0.1)',color:'#f472b6',fontSize:'0.7rem',cursor:'pointer',flexShrink:0 }}>+</button>
                  <button onClick={() => eliminatePlayer(p.name)} style={{ padding:'2px 5px',borderRadius:'5px',border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.08)',color:'#f87171',fontSize:'0.62rem',cursor:'pointer',flexShrink:0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Eliminated */}
          {activeTournament.players.filter(p=>p.eliminated).length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div className="font-display" style={{ fontSize: '0.7rem', color: '#f87171', letterSpacing: '0.12em', marginBottom: '8px' }}>AUSGESCHIEDEN</div>
              {[...activeTournament.players.filter(p=>p.eliminated)].sort((a,b)=>(a.place||99)-(b.place||99)).map(p => {
                const medal = p.place===1?'🥇':p.place===2?'🥈':p.place===3?'🥉':`${p.place}.`
                const prize = activeTournament.payouts[p.place-1] ? Math.round(totalPot * activeTournament.payouts[p.place-1].pct / 100) : 0
                return (
                  <div key={p.name} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',borderRadius:'8px',background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)',marginBottom:'4px' }}>
                    <span style={{ fontSize:'0.85rem' }}>{medal}</span>
                    <span style={{ fontSize:'0.78rem',color:'#f87171',flex:1 }}>{p.name}</span>
                    {prize > 0 && <span style={{ fontFamily:'Cinzel,serif',fontSize:'0.78rem',color:'#4ade80' }}>+{prize}€</span>}
                    <button onClick={() => setActiveTournament(prev => ({
                      ...prev,
                      players: prev.players.map(pl => pl.name === p.name ? {...pl, eliminated: false, place: null} : pl),
                      results: (prev.results||[]).filter(r => r.name !== p.name),
                    }))} style={{
                      width:'22px',height:'22px',borderRadius:'50%',
                      border:'1px solid rgba(74,222,128,0.5)',
                      background:'rgba(74,222,128,0.12)',
                      color:'#4ade80',fontSize:'0.9rem',cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
                    }}>+</button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display:'flex',gap:'10px' }}>
            <button className="btn-ghost" style={{ flex:1 }} onClick={() => setView('create')}>← Zurück</button>
            <button style={{ flex:1,background:'rgba(192,57,43,0.1)',color:'#e74c3c',border:'1px solid rgba(192,57,43,0.35)',borderRadius:'10px',padding:'13px',fontFamily:'Cinzel,serif',fontSize:'0.72rem',letterSpacing:'0.1em',cursor:'pointer' }}
              onClick={endTournament}>✕ Beenden & Speichern</button>
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {view === 'history' && (
        <div>
          {tournaments.length === 0 && <div className="empty-state">Noch keine Turniere ♠</div>}
          {[...tournaments].sort((a,b)=>b.date?.localeCompare(a.date)).map(t => (
            <div key={t.id} className="card" style={{ marginBottom:'12px',padding:'16px',cursor:'pointer' }}
              onClick={() => setDetailTournament(t)}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px' }}>
                <div>
                  <div className="font-display" style={{ fontSize:'0.85rem',color:'var(--gold)' }}>{t.name}</div>
                  <div style={{ fontSize:'0.78rem',color:'var(--text-muted)' }}>
                    {formatDate(t.date)} · {(t.players||[]).length} Spieler · {formatEuro(t.buyin)} Buy-In
                  </div>
                </div>
                <button className="btn-danger" onClick={e => { e.stopPropagation(); deleteTournament(t.id) }}>✕</button>
              </div>
              {(t.results||[]).slice(0,3).map(r => (
                <div key={r.name} style={{ display:'flex',justifyContent:'space-between',fontSize:'0.85rem',padding:'4px 0' }}>
                  <span>{r.place===1?'🥇':r.place===2?'🥈':r.place===3?'🥉':`#${r.place}`} {r.name}</span>
                  {r.payout > 0 && <span style={{ color:'#4ade80' }}>+{formatEuro(r.payout)}</span>}
                </div>
              ))}
              <div style={{ fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'6px',textAlign:'right',fontFamily:'Cinzel,serif',letterSpacing:'0.06em' }}>Details ▶</div>
            </div>
          ))}
        </div>
      )}

      {/* ── RANKINGS ── */}
      {view === 'rankings' && (
        <div>
          {(() => {
            const statsMap = {}
            tournaments.forEach(t => {
              const playerCount = (t.players||[]).length
              ;(t.results||[]).forEach(r => {
                if (!statsMap[r.name]) statsMap[r.name] = {name:r.name,tournaments:0,wins:0,itm:0,earnings:0}
                statsMap[r.name].tournaments++
                if (r.place===1) statsMap[r.name].wins++
                if (r.place<=Math.max(3,Math.floor(playerCount*0.33))) statsMap[r.name].itm++
                if (r.payout) statsMap[r.name].earnings+=r.payout
              })
            })
            const ranked = Object.values(statsMap).sort((a,b)=>b.wins-a.wins||b.itm-a.itm)
            if (ranked.length===0) return <div className="empty-state">Noch keine Daten ♠</div>
            return ranked.map((p,i) => (
              <div key={p.name} className="card" style={{ marginBottom:'10px',padding:'14px 16px' }}>
                <div style={{ display:'flex',alignItems:'center',gap:'12px' }}>
                  <div style={{ fontSize:i<3?'1.3rem':'0.9rem',minWidth:'28px' }}>{i<3?['🥇','🥈','🥉'][i]:`#${i+1}`}</div>
                  {avatars[p.name] ? (
                    <img src={avatars[p.name]} alt={p.name} style={{ width:'36px',height:'36px',borderRadius:'50%',objectFit:'cover',border:'2px solid rgba(201,168,76,0.35)' }} />
                  ) : (
                    <div style={{ width:'36px',height:'36px',borderRadius:'50%',background:'rgba(201,168,76,0.08)',border:'1px dashed rgba(201,168,76,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem' }}>👤</div>
                  )}
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600 }}>{p.name}</div>
                    <div style={{ fontSize:'0.75rem',color:'var(--text-muted)' }}>{p.tournaments} Turniere · {p.wins} Siege · {p.itm}× ITM</div>
                  </div>
                  {p.earnings>0 && <div className="font-display profit-pos" style={{ fontSize:'0.9rem' }}>+{formatEuro(p.earnings)}</div>}
                </div>
              </div>
            ))
          })()}
        </div>
      )}

      {/* Tournament Detail Modal */}
      {detailTournament && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:450,padding:'20px' }}
          onClick={() => setDetailTournament(null)}>
          <div className="card" style={{ maxWidth:'400px',width:'100%',padding:'24px',maxHeight:'85vh',overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="font-display" style={{ fontSize:'1rem',color:'var(--gold)',letterSpacing:'0.12em',marginBottom:'4px' }}>
              🎰 {detailTournament.name}
            </div>
            <div style={{ fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:'20px' }}>
              {formatDate(detailTournament.date)}
            </div>

            {/* Quick stats */}
            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'20px' }}>
              {[
                {label:'Spieler', value:(detailTournament.players||[]).length},
                {label:'Buy-In', value:formatEuro(detailTournament.buyin)},
                {label:'Pot', value:formatEuro((detailTournament.players||[]).length * detailTournament.buyin)},
              ].map(s => (
                <div key={s.label} style={{ textAlign:'center',padding:'10px 8px',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div className="font-display" style={{ fontSize:'0.85rem',color:'var(--gold)' }}>{s.value}</div>
                  <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:'2px',fontFamily:'Cinzel,serif',letterSpacing:'0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Final Results */}
            <div className="font-display" style={{ fontSize:'0.72rem',color:'var(--gold)',letterSpacing:'0.1em',marginBottom:'10px' }}>ENDERGEBNIS</div>
            {[...(detailTournament.results||[])].sort((a,b)=>(a.place||99)-(b.place||99)).map(r => {
              const medal = r.place===1?'🥇':r.place===2?'🥈':r.place===3?'🥉':`#${r.place}`
              return (
                <div key={r.name} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'8px',marginBottom:'6px',background:r.place<=3?'rgba(201,168,76,0.06)':'rgba(0,0,0,0.15)',border:`1px solid ${r.place===1?'rgba(201,168,76,0.3)':r.place<=3?'rgba(201,168,76,0.15)':'rgba(255,255,255,0.05)'}` }}>
                  <span style={{ fontSize:'1.1rem' }}>{medal}</span>
                  {avatars[r.name] ? (
                    <img src={avatars[r.name]} alt={r.name} style={{ width:'30px',height:'30px',borderRadius:'50%',objectFit:'cover',border:'1px solid rgba(201,168,76,0.3)' }} />
                  ) : (
                    <div style={{ width:'30px',height:'30px',borderRadius:'50%',background:'rgba(201,168,76,0.08)',border:'1px dashed rgba(201,168,76,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem' }}>👤</div>
                  )}
                  <span style={{ flex:1,fontWeight:600,fontSize:'0.95rem' }}>{r.name}</span>
                  {r.payout > 0 && <span className="font-display profit-pos" style={{ fontSize:'0.9rem' }}>+{formatEuro(r.payout)}</span>}
                </div>
              )
            })}

            {/* All players with rebuys */}
            {(detailTournament.players||[]).some(p => (p.rebuys||0) > 0) && (
              <>
                <div className="font-display" style={{ fontSize:'0.72rem',color:'var(--gold)',letterSpacing:'0.1em',marginBottom:'10px',marginTop:'16px' }}>REBUYS</div>
                {(detailTournament.players||[]).filter(p=>(p.rebuys||0)>0).map(p => (
                  <div key={p.name} style={{ display:'flex',justifyContent:'space-between',fontSize:'0.85rem',padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <span>{p.name}</span>
                    <span style={{ color:'#f472b6',fontFamily:'Cinzel,serif' }}>{p.rebuys}× Rebuy</span>
                  </div>
                ))}
              </>
            )}

            <button className="btn-ghost" style={{ width:'100%',marginTop:'20px' }} onClick={() => setDetailTournament(null)}>
              Schließen
            </button>
          </div>
        </div>
      )}

      {confirm && <ConfirmDialog title={confirm.title} text={confirm.text} okLabel="Löschen" onOk={confirm.onOk} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
