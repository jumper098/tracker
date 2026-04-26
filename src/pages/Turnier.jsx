import { useState, useEffect, useRef } from 'react'
import Avatar from '../components/Avatar'
import { db } from '../lib/supabase'
import { formatDate, formatEuro } from '../lib/helpers'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

const BLIND_PRESETS = {
  turbo: {
    label: '⚡ TURBO', color: '#f87171', desc: '12 Min · 10 Level', chips: 4200,
    blinds: [
      {sb:5,bb:10,duration:12},{sb:10,bb:25,duration:12},{sb:25,bb:50,duration:12},
      {sb:50,bb:100,duration:12},{sb:75,bb:150,duration:12},{sb:100,bb:200,duration:12},
      {sb:125,bb:250,duration:12},{sb:150,bb:300,duration:12},{sb:200,bb:400,duration:12},
      {sb:250,bb:500,duration:12},
    ]
  },
  standard: {
    label: '♠ STANDARD', color: '#C9A84C', desc: '20 Min · 14 Level', chips: 4800,
    blinds: [
      {sb:5,bb:10,duration:20},{sb:10,bb:25,duration:20},{sb:25,bb:50,duration:20},
      {sb:35,bb:75,duration:20},{sb:50,bb:100,duration:20},{sb:75,bb:150,duration:20},
      {sb:100,bb:200,duration:20},{sb:125,bb:250,duration:20},{sb:150,bb:300,duration:20},
      {sb:175,bb:350,duration:20},{sb:200,bb:400,duration:20},{sb:225,bb:450,duration:20},
      {sb:250,bb:500,duration:20},{sb:300,bb:600,duration:20},
    ]
  },
  deepstack: {
    label: '🏔 DEEP STACK', color: '#60a5fa', desc: '30 Min · 12 Level', chips: 5500,
    blinds: [
      {sb:5,bb:10,duration:30},{sb:10,bb:25,duration:30},{sb:25,bb:50,duration:30},
      {sb:35,bb:75,duration:30},{sb:50,bb:100,duration:30},{sb:75,bb:150,duration:30},
      {sb:100,bb:200,duration:30},{sb:150,bb:300,duration:30},{sb:200,bb:400,duration:30},
      {sb:250,bb:500,duration:30},{sb:300,bb:600,duration:30},{sb:350,bb:700,duration:30},
    ]
  },
}

// Timer is always calculated from timerStartedAt — survives reloads
function calcRemaining(t) {
  if (!t) return 0
  const lvl = t.timerLevel || 0
  const totalSecs = (t.blinds[lvl]?.duration || 20) * 60
  if (t.timerPaused) return Math.max(0, totalSecs - (t.timerElapsed || 0))
  if (t.timerStartedAt) {
    const elapsed = Math.floor((Date.now() - t.timerStartedAt) / 1000)
    return Math.max(0, totalSecs - (t.timerElapsed || 0) - elapsed)
  }
  return totalSecs
}

export default function Turnier({ sessions, tournaments, onRefresh, players, avatars = {} }) {
  const [view, setView] = useState('create')
  const [t, setT] = useState(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef(null)
  const tRef = useRef(null)

  // Form
  const [tName, setTName] = useState('Poker Turnier')
  const [tBuyin, setTBuyin] = useState('20')
  const [tChips, setTChips] = useState('5000')
  const [tPlayers, setTPlayers] = useState([])
  const [preset, setPreset] = useState('standard')
  const [blinds, setBlinds] = useState(BLIND_PRESETS.standard.blinds.map(b => ({...b})))
  const [payouts, setPayouts] = useState([{place:1,pct:50},{place:2,pct:30},{place:3,pct:20}])
  const [globalDur, setGlobalDur] = useState('')

  // UI
  const [confirm, setConfirm] = useState(null)
  const [detailT, setDetailT] = useState(null)
  const [rebuyConfirm, setRebuyConfirm] = useState(null)

  // Keep tRef current
  useEffect(() => { tRef.current = t }, [t])
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer(tournament) {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!tournament || tournament.timerPaused) {
      setTimeLeft(calcRemaining(tournament))
      return
    }
    setTimeLeft(calcRemaining(tournament))
    timerRef.current = setInterval(() => {
      const cur = tRef.current
      if (!cur || cur.timerPaused) { clearInterval(timerRef.current); return }
      const rem = calcRemaining(cur)
      setTimeLeft(rem)
      if (rem <= 0) {
        clearInterval(timerRef.current)
        const nextLvl = (cur.timerLevel || 0) + 1
        if (nextLvl < cur.blinds.length) {
          showToast(cur.blinds[nextLvl].pause ? '☕ Pause!' : '🔔 Nächstes Level!')
          advanceLevel(cur, nextLvl)
        } else {
          showToast('🏁 Letztes Level!')
        }
      }
    }, 1000)
  }

  // ── DB ────────────────────────────────────────────────────────────────────
  // Each client has a unique ID — we embed it in writes to ignore our own echoes
  const myId = useRef(Math.random().toString(36).slice(2))

  function writeDb(tournament) {
    db.from('live_tournament').upsert(
      { id: 'current', data: { tournament, writerId: myId.current }, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    ).catch(() => {})
  }

  function updateT(updater) {
    setT(prev => {
      if (!prev) return prev
      const updated = typeof updater === 'function' ? updater(prev) : updater
      setTimeout(() => writeDb(updated), 0)
      return updated
    })
  }

  // ── Realtime + initial load ───────────────────────────────────────────────
  useEffect(() => {
    // Load existing tournament on mount
    db.from('live_tournament').select('data').eq('id', 'current').single()
      .then(({ data }) => {
        if (data?.data?.tournament) {
          const tournament = data.data.tournament
          setT(tournament)
          startTimer(tournament)
          // view auto-derives from t
        }
      }).catch(() => {})

    // Listen for remote changes only
    const ch = db.channel('live_t')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_tournament' }, payload => {
        // Ignore our own writes
        if (payload.new?.data?.writerId === myId.current) return

        const tournament = payload.new?.data?.tournament
        if (tournament) {
          setT(prev => {
            const lvlChanged = !prev || tournament.timerLevel !== prev.timerLevel
            const pauseChanged = !prev || tournament.timerPaused !== prev.timerPaused
            if (lvlChanged || pauseChanged) {
              startTimer(tournament)
            }
            return tournament
          })
          // view derives from t — no setView needed
        } else {
          if (timerRef.current) clearInterval(timerRef.current)
          setT(null)
          setView('create')
        }
      })
      .subscribe()

    return () => db.removeChannel(ch)
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  function startTournament() {
    if (tPlayers.length < 2) { showToast('⚠ Mindestens 2 Spieler'); return }
    const activeBlinds = blinds.filter(b => b.pause || (b.sb && b.bb))
    if (activeBlinds.length === 0) { showToast('⚠ Mindestens 1 Level'); return }
    const now = Date.now()
    const newT = {
      id: now.toString(),
      name: tName || 'Turnier',
      buyin: parseFloat(tBuyin) || 20,
      chips: parseInt(tChips) || 5000,
      date: new Date().toISOString().split('T')[0],
      players: tPlayers.map(n => ({ name: n, eliminated: false, place: null, rebuys: 0 })),
      blinds: activeBlinds,
      payouts,
      results: [],
      timerLevel: 0,
      timerElapsed: 0,
      timerStartedAt: now,
      timerPaused: false,
    }
    setT(newT)
    startTimer(newT)
    writeDb(newT)
    // view derives from t automatically
  }

  function toggleTimer() {
    const prev = tRef.current
    if (!prev) return
    const lvl = prev.timerLevel || 0
    const totalSecs = (prev.blinds[lvl]?.duration || 20) * 60
    let updated
    if (prev.timerPaused) {
      updated = { ...prev, timerPaused: false, timerStartedAt: Date.now() }
      setT(updated)
      startTimer(updated)
    } else {
      const elapsed = totalSecs - calcRemaining(prev)
      if (timerRef.current) clearInterval(timerRef.current)
      updated = { ...prev, timerPaused: true, timerElapsed: elapsed, timerStartedAt: null }
      setT(updated)
      setTimeLeft(calcRemaining(updated))
    }
    setTimeout(() => writeDb(updated), 0)
  }

  function advanceLevel(cur, nextLvl) {
    const updated = { ...cur, timerLevel: nextLvl, timerElapsed: 0, timerStartedAt: Date.now(), timerPaused: false }
    setT(updated)
    startTimer(updated)
    writeDb(updated)
  }

  function addRebuy(name) {
    setT(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name ? { ...p, rebuys: (p.rebuys||0)+1, eliminated: false, place: null } : p)
      }
      setTimeout(() => writeDb(updated), 0)
      return updated
    })
    showToast(`↺ Rebuy für ${name}`)
  }

  function removeRebuy(name) {
    setT(prev => {
      if (!prev) return prev
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name && (p.rebuys||0) > 0 ? { ...p, rebuys: p.rebuys-1 } : p)
      }
      setTimeout(() => writeDb(updated), 0)
      return updated
    })
  }

  function eliminatePlayer(name) {
    setT(prev => {
      if (!prev) return prev
      const remaining = prev.players.filter(p => !p.eliminated && p.name !== name)
      const place = remaining.length + 1
      const updated = {
        ...prev,
        players: prev.players.map(p => p.name === name ? { ...p, eliminated: true, place } : p),
        results: [...(prev.results||[]).filter(r=>r.name!==name), { name, place }],
      }
      writeDb(updated)
      return updated
    })
  }

  function rejoinPlayer(name) {
    updateT(prev => ({
      ...prev,
      players: prev.players.map(p => p.name === name ? { ...p, eliminated: false, place: null } : p),
      results: (prev.results||[]).filter(r => r.name !== name),
    }))
  }

  async function endTournament() {
    if (!t) return
    const { error } = await db.from('poker_tournaments').insert([{
      id: crypto.randomUUID(),
      name: t.name, date: t.date, buyin: t.buyin,
      players: t.players, results: t.results, payouts: t.payouts,
    }])
    if (error) { showToast('Fehler: ' + error.message); return }
    await db.from('live_tournament').delete().eq('id', 'current')
    if (timerRef.current) clearInterval(timerRef.current)
    setT(null) // view auto-switches to create since t is null
    setView('create')
    onRefresh()
    showToast('✓ Turnier gespeichert!')
  }

  async function deleteTournament(id) {
    setConfirm({
      title: '✕ Turnier löschen?', text: 'Dieses Turnier wirklich löschen?',
      onOk: async () => {
        setConfirm(null)
        await db.from('poker_tournaments').delete().eq('id', id)
        showToast('Turnier gelöscht')
        onRefresh()
      }
    })
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const lvl = t?.timerLevel || 0
  const currentBlind = t?.blinds[lvl]
  const nextBlind = t?.blinds[lvl+1]
  const isPause = currentBlind?.pause
  const timerMin = String(Math.floor(timeLeft/60)).padStart(2,'0')
  const timerSec = String(timeLeft%60).padStart(2,'0')
  const timerColor = isPause ? '#60a5fa' : timeLeft<=60 ? '#f87171' : '#4ade80'
  const realLevelNum = t ? t.blinds.slice(0,lvl+1).filter(b=>!b.pause).length : 0
  const activePlayers = t ? t.players.filter(p=>!p.eliminated).length : 0
  const totalRebuys = t ? t.players.reduce((s,p) => s+(p.rebuys||0), 0) : 0
  const totalPot = t ? (t.players.length + totalRebuys) * t.buyin : 0
  const totalChips = t ? (t.players.length + totalRebuys) * t.chips : 0
  const avgStack = activePlayers > 0 ? Math.round(totalChips / activePlayers) : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign:'center', marginBottom:'20px', paddingTop:'12px' }}>
        <div className="font-display" style={{ fontSize:'1.3rem', color:'var(--gold)', letterSpacing:'0.15em' }}>♠ TURNIER</div>
      </div>

      {/* Sub nav — only when no active tournament */}
      {!t && (
        <div style={{ display:'flex', gap:'6px', marginBottom:'20px' }}>
          {[
            ...(t ? [{id:'live',label:'🔴 Live'}] : []),
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
      {!t && view === 'create' && (
        <div>
          <div className="card" style={{ marginBottom:'14px' }}>
            <div style={{ marginBottom:'12px' }}>
              <label className="section-label">Turniername</label>
              <input className="input-field" value={tName} onChange={e=>setTName(e.target.value)} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>
                <label className="section-label">Buy-In (€)</label>
                <input className="input-field" type="number" value={tBuyin} onChange={e=>setTBuyin(e.target.value)} />
              </div>
              <div>
                <label className="section-label">Startchips</label>
                <input className="input-field" type="number" value={tChips} onChange={e=>setTChips(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Presets */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'6px', marginBottom:'14px' }}>
            {[
              ...Object.entries(BLIND_PRESETS).map(([key,p]) => ({key,...p})),
              {key:'custom',label:'✏ CUSTOM',color:'#a78bfa',desc:'Eigene Struktur',chips:5000,blinds:[]}
            ].map(p => (
              <button key={p.key} onClick={() => {
                setPreset(p.key)
                if (p.key !== 'custom') { setBlinds(p.blinds.map(b=>({...b}))); setTChips(String(p.chips)) }
              }} className="btn-ghost" style={{
                padding:'8px 4px', textAlign:'center',
                background: preset===p.key ? 'rgba(201,168,76,0.15)' : undefined,
                borderColor: preset===p.key ? p.color : undefined,
              }}>
                <div style={{ fontFamily:'Cinzel,serif', fontSize:'0.62rem', color: preset===p.key ? p.color : 'var(--text-muted)' }}>{p.label}</div>
                <div style={{ fontSize:'0.55rem', color:'var(--text-muted)', marginTop:'2px' }}>{p.desc}</div>
              </button>
            ))}
          </div>

          {/* Blind table */}
          <div className="card" style={{ marginBottom:'14px' }}>
            <div className="font-display" style={{ fontSize:'0.75rem', color:'var(--gold)', letterSpacing:'0.1em', marginBottom:'12px' }}>BLIND STRUKTUR</div>
            <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'10px', padding:'8px 10px', borderRadius:'8px', background:'rgba(201,168,76,0.05)', border:'1px solid rgba(201,168,76,0.15)' }}>
              <span style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'Cinzel,serif', whiteSpace:'nowrap' }}>Alle Level:</span>
              <input className="input-field" type="number" placeholder="Min" value={globalDur} onChange={e=>setGlobalDur(e.target.value)} style={{ width:'70px', textAlign:'center' }} />
              <button className="btn-ghost" style={{ flex:1, fontSize:'0.65rem' }}
                onClick={() => { const d=parseInt(globalDur); if(d) setBlinds(prev=>prev.map(b=>b.pause?b:{...b,duration:d})) }}>✓ Übernehmen</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 1fr 56px 36px', gap:'4px', padding:'4px 6px', borderRadius:'6px', background:'rgba(201,168,76,0.08)', marginBottom:'6px' }}>
              {['#','SB','BB','MIN',''].map((h,i) => (
                <div key={i} style={{ fontFamily:'Cinzel,serif', fontSize:'0.52rem', color:'var(--gold)', textAlign:'center' }}>{h}</div>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'4px', marginBottom:'8px' }}>
              {blinds.map((b, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'24px 1fr 1fr 56px 36px', gap:'4px', alignItems:'center', background: b.pause?'rgba(96,165,250,0.05)':'transparent', borderRadius:'6px', padding:'2px 0' }}>
                  <div style={{ textAlign:'center', fontSize:'0.65rem', color: b.pause?'#60a5fa':'var(--text-muted)' }}>{b.pause?'☕':i+1}</div>
                  {b.pause ? (
                    <div style={{ gridColumn:'2/4', fontSize:'0.75rem', color:'#60a5fa', padding:'6px 8px', fontFamily:'Cinzel,serif', letterSpacing:'0.1em' }}>☕ PAUSE</div>
                  ) : (
                    <>
                      <input className="input-field" type="number" value={b.sb} style={{ padding:'6px 8px', textAlign:'center' }}
                        onChange={e=>setBlinds(prev=>prev.map((bl,idx)=>idx===i?{...bl,sb:e.target.value}:bl))} />
                      <input className="input-field" type="number" value={b.bb} style={{ padding:'6px 8px', textAlign:'center' }}
                        onChange={e=>setBlinds(prev=>prev.map((bl,idx)=>idx===i?{...bl,bb:e.target.value}:bl))} />
                    </>
                  )}
                  <input className="input-field" type="number" value={b.duration} style={{ padding:'6px 8px', textAlign:'center' }}
                    onChange={e=>setBlinds(prev=>prev.map((bl,idx)=>idx===i?{...bl,duration:e.target.value}:bl))} />
                  <div style={{ display:'flex', flexDirection:'column', gap:'2px' }}>
                    <button className="btn-danger" style={{ padding:'3px 4px', fontSize:'0.6rem' }}
                      onClick={()=>setBlinds(prev=>prev.filter((_,idx)=>idx!==i))}>✕</button>
                    {!b.pause && (
                      <button onClick={() => setBlinds(prev => { const n=[...prev]; n.splice(i+1,0,{pause:true,duration:10}); return n })}
                        style={{ padding:'3px 4px', fontSize:'0.6rem', borderRadius:'4px', border:'1px solid rgba(96,165,250,0.4)', background:'rgba(96,165,250,0.08)', color:'#60a5fa', cursor:'pointer' }}>☕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-ghost" style={{ width:'100%', fontSize:'0.65rem' }}
              onClick={()=>setBlinds(prev=>[...prev,{sb:'',bb:'',duration:20}])}>+ Level</button>
          </div>

          {/* Payouts */}
          <div className="card" style={{ marginBottom:'14px' }}>
            <div className="font-display" style={{ fontSize:'0.75rem', color:'var(--gold)', letterSpacing:'0.1em', marginBottom:'12px' }}>AUSZAHLUNGSSTRUKTUR</div>
            {payouts.map((p, i) => {
              const pot = tPlayers.length * parseFloat(tBuyin||20)
              const euroVal = Math.round(pot * p.pct / 100)
              return (
                <div key={i} style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px' }}>
                  <span style={{ minWidth:'24px', color:'var(--text-muted)', fontSize:'0.85rem', textAlign:'center' }}>
                    {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}
                  </span>
                  <input className="input-field" type="text" inputMode="decimal"
                    value={p.pct===0?'':String(p.pct)} placeholder="0"
                    onChange={e => { const v=parseFloat(e.target.value.replace(',','.')); setPayouts(prev=>prev.map((po,idx)=>idx===i?{...po,pct:isNaN(v)?0:v}:po)) }}
                    style={{ flex:1, textAlign:'center' }} />
                  <span style={{ color:'var(--text-muted)', fontSize:'0.8rem' }}>%</span>
                  <div style={{ textAlign:'right', minWidth:'48px' }}>
                    <div style={{ fontFamily:'Cinzel,serif', fontSize:'0.8rem', color:'var(--gold)' }}>{tPlayers.length>0?euroVal+'€':'—'}</div>
                    <div style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{p.pct>0?p.pct+'%':''}</div>
                  </div>
                  <button className="btn-danger" onClick={()=>setPayouts(prev=>prev.filter((_,idx)=>idx!==i).map((po,idx)=>({...po,place:idx+1})))}>✕</button>
                </div>
              )
            })}
            <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
              <button className="btn-ghost" style={{ flex:1, fontSize:'0.65rem' }}
                onClick={()=>setPayouts(prev=>[...prev,{place:prev.length+1,pct:0}])}>+ Platz</button>
              <button className="btn-ghost" style={{ flex:1, fontSize:'0.65rem', color:'#60a5fa', borderColor:'rgba(96,165,250,0.3)' }}
                onClick={() => {
                  const n=payouts.length
                  const pre={1:[100],2:[65,35],3:[50,30,20],4:[45,28,17,10],5:[40,25,17,11,7]}
                  const pcts=pre[Math.min(n,5)]||Array(n).fill(Math.floor(100/n))
                  setPayouts(pcts.map((pct,i)=>({place:i+1,pct})))
                }}>⚡ Auto</button>
            </div>
            <div style={{ fontSize:'0.75rem', color:payouts.reduce((s,p)=>s+(p.pct||0),0)===100?'#4ade80':'#f87171', textAlign:'right', marginTop:'8px' }}>
              Gesamt: {payouts.reduce((s,p)=>s+(p.pct||0),0).toFixed(1)}%{payouts.reduce((s,p)=>s+(p.pct||0),0)===100&&' ✓'}
            </div>
          </div>

          {/* Players */}
          <div className="card" style={{ marginBottom:'20px' }}>
            <div className="font-display" style={{ fontSize:'0.75rem', color:'var(--gold)', letterSpacing:'0.1em', marginBottom:'12px' }}>SPIELER ({tPlayers.length})</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
              {players.map(name => (
                <button key={name} onClick={()=>setTPlayers(prev=>prev.includes(name)?prev.filter(p=>p!==name):[...prev,name])}
                  style={{ padding:'6px 14px', borderRadius:'20px', cursor:'pointer', fontSize:'0.85rem',
                    border:`1px solid ${tPlayers.includes(name)?'rgba(201,168,76,0.6)':'rgba(255,255,255,0.1)'}`,
                    background:tPlayers.includes(name)?'rgba(201,168,76,0.15)':'transparent',
                    color:tPlayers.includes(name)?'var(--gold)':'var(--text-muted)' }}>
                  {tPlayers.includes(name)?'✓ ':''}{name}
                </button>
              ))}
            </div>
          </div>

          <button className="btn-gold" style={{ width:'100%' }} onClick={startTournament}>🎰 Turnier starten</button>
        </div>
      )}

      {/* ── LIVE ── */}
      {t && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', padding:'8px 12px', borderRadius:'8px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-display" style={{ fontSize:'0.7rem', color:'var(--gold-light)' }}>{t.name}</span>
            <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{activePlayers} im Spiel</span>
          </div>

          {/* Timer card */}
          <div style={{ borderRadius:'14px', background:'rgba(0,0,0,0.35)', border:`1px solid ${isPause?'rgba(96,165,250,0.3)':'rgba(201,168,76,0.2)'}`, marginBottom:'14px', overflow:'hidden' }}>
            {isPause ? (
              <div style={{ textAlign:'center', padding:'18px 16px 12px' }}>
                <div className="font-display" style={{ fontSize:'0.6rem', color:'#60a5fa', letterSpacing:'0.18em', marginBottom:'6px' }}>☕ PAUSE</div>
                <div style={{ fontFamily:'Cinzel,serif', fontSize:'3.8rem', color:timerColor, lineHeight:1 }}>{timerMin}:{timerSec}</div>
                {nextBlind && !nextBlind.pause && (
                  <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', marginTop:'10px' }}>
                    Nächste Blinds → <span style={{ color:'var(--gold)' }}>{nextBlind.sb} / {nextBlind.bb}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ textAlign:'center', padding:'18px 16px 10px' }}>
                  <div style={{ fontFamily:'Cinzel,serif', fontSize:'0.55rem', color:'var(--text-muted)', letterSpacing:'0.18em', marginBottom:'4px' }}>LEVEL {realLevelNum}</div>
                  <div style={{ fontFamily:'Cinzel,serif', fontSize:'5rem', color:timerColor, lineHeight:1, letterSpacing:'0.05em' }}>{timerMin}:{timerSec}</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1px 1fr 1px 1fr', background:'rgba(201,168,76,0.06)', borderTop:'1px solid rgba(201,168,76,0.2)' }}>
                  {[
                    {label:'SMALL BLIND', value:currentBlind?.sb},
                    null,
                    {label:'BIG BLIND', value:currentBlind?.bb},
                    null,
                    {label:'POT', value:totalPot+'€', color:'#4ade80'},
                  ].map((item,i) => item===null
                    ? <div key={i} style={{ background:'rgba(201,168,76,0.15)' }} />
                    : <div key={i} style={{ textAlign:'center', padding:'10px 4px' }}>
                        <div style={{ fontFamily:'Cinzel,serif', fontSize:'0.42rem', color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:'3px' }}>{item.label}</div>
                        <div className="font-display" style={{ fontSize:'1.1rem', color:item.color||'var(--gold)' }}>{item.value}</div>
                      </div>
                  )}
                </div>
                {nextBlind && (
                  <div style={{ display:'flex', justifyContent:'center', gap:'16px', padding:'8px 16px', background:'rgba(0,0,0,0.2)', borderTop:'1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>Nächstes: {nextBlind.pause?'☕ Pause':`${nextBlind.sb} / ${nextBlind.bb}`}</div>
                    <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>{nextBlind.duration} Min</div>
                  </div>
                )}
              </>
            )}
            <div style={{ display:'flex', gap:'8px', justifyContent:'center', padding:'10px 16px 14px' }}>
              <button onClick={toggleTimer} style={{ padding:'9px 22px', borderRadius:'8px', cursor:'pointer', border:'1px solid rgba(74,222,128,0.4)', background:'rgba(74,222,128,0.12)', color:'#4ade80', fontFamily:'Cinzel,serif', fontSize:'0.72rem' }}>
                {t.timerPaused ? '▶ WEITER' : '⏸ PAUSE'}
              </button>
              <button onClick={() => { if(lvl>0) advanceLevel(t,lvl-1) }} disabled={lvl===0}
                style={{ padding:'9px 16px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'0.8rem',cursor:'pointer',opacity:lvl===0?0.3:1 }}>◄</button>
              <button onClick={() => { if(lvl<t.blinds.length-1) advanceLevel(t,lvl+1) }} disabled={lvl>=t.blinds.length-1}
                style={{ padding:'9px 16px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'0.8rem',cursor:'pointer',opacity:lvl>=t.blinds.length-1?0.3:1 }}>►</button>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'8px' }}>
            {[
              {label:'GESAMTPOT', value:totalPot+'€', color:'var(--gold)'},
              {label:'BUY-INS', value:t.players.length, color:'#4ade80'},
              {label:'REBUYS', value:totalRebuys, color:'#f472b6'},
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', padding:'10px 8px', borderRadius:'10px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:'0.48rem', color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:'4px', fontFamily:'Cinzel,serif' }}>{s.label}</div>
                <div className="font-display" style={{ fontSize:'1.4rem', color:s.color, lineHeight:1 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'14px' }}>
            {[
              {label:'CHIPS IM UMLAUF', value:totalChips.toLocaleString()},
              {label:'Ø STACK', value:avgStack.toLocaleString()},
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', padding:'8px', borderRadius:'10px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:'0.48rem', color:'var(--text-muted)', letterSpacing:'0.1em', marginBottom:'4px', fontFamily:'Cinzel,serif' }}>{s.label}</div>
                <div className="font-display" style={{ fontSize:'1rem', color:'#38bdf8', lineHeight:1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Payouts */}
          {t.payouts.some(p=>p.pct>0) && (
            <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
              {t.payouts.filter(p=>p.pct>0).map((p,i) => (
                <div key={i} style={{ flex:1, textAlign:'center', padding:'8px 4px', borderRadius:'8px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize:'1rem' }}>{['🥇','🥈','🥉'][i]||`${i+1}.`}</div>
                  <div className="font-display" style={{ fontSize:'0.9rem', color:'var(--gold)' }}>{Math.round(totalPot*p.pct/100)}€</div>
                  <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>{p.pct}%</div>
                </div>
              ))}
            </div>
          )}

          {/* Active players */}
          <div style={{ marginBottom:'14px' }}>
            <div className="font-display" style={{ fontSize:'0.7rem', color:'#4ade80', letterSpacing:'0.12em', marginBottom:'8px' }}>NOCH IM SPIEL ({activePlayers})</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
              {t.players.filter(p=>!p.eliminated).map(p => (
                <div key={p.name} style={{ display:'flex', alignItems:'center', gap:'5px', padding:'7px 8px', borderRadius:'10px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
                  <Avatar name={p.name} avatars={avatars} size={22} />
                  <span style={{ flex:1, fontSize:'0.72rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                  {(p.rebuys||0)>0 && (
                    <>
                      <span style={{ fontFamily:'Cinzel,serif',fontSize:'0.65rem',color:'#f472b6',background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.3)',borderRadius:'6px',padding:'1px 5px',flexShrink:0 }}>{p.rebuys}×</span>
                      <button onClick={()=>removeRebuy(p.name)} style={{ width:'18px',height:'18px',borderRadius:'50%',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer',flexShrink:0 }}>−</button>
                    </>
                  )}
                  <button onClick={()=>setRebuyConfirm(p.name)} style={{ width:'18px',height:'18px',borderRadius:'50%',border:'1px solid rgba(244,114,182,0.4)',background:'rgba(244,114,182,0.1)',color:'#f472b6',fontSize:'0.7rem',cursor:'pointer',flexShrink:0 }}>+</button>
                  <button onClick={()=>eliminatePlayer(p.name)} style={{ padding:'2px 5px',borderRadius:'5px',border:'1px solid rgba(248,113,113,0.3)',background:'rgba(248,113,113,0.08)',color:'#f87171',fontSize:'0.62rem',cursor:'pointer',flexShrink:0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* Eliminated */}
          {t.players.filter(p=>p.eliminated).length > 0 && (
            <div style={{ marginBottom:'14px' }}>
              <div className="font-display" style={{ fontSize:'0.7rem', color:'#f87171', letterSpacing:'0.12em', marginBottom:'8px' }}>AUSGESCHIEDEN</div>
              {[...t.players.filter(p=>p.eliminated)].sort((a,b)=>(a.place||99)-(b.place||99)).map(p => {
                const medal = p.place===1?'🥇':p.place===2?'🥈':p.place===3?'🥉':`${p.place}.`
                const prize = t.payouts[p.place-1] ? Math.round(totalPot*t.payouts[p.place-1].pct/100) : 0
                return (
                  <div key={p.name} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',borderRadius:'8px',background:'rgba(248,113,113,0.06)',border:'1px solid rgba(248,113,113,0.15)',marginBottom:'4px' }}>
                    <span style={{ fontSize:'0.85rem' }}>{medal}</span>
                    <Avatar name={p.name} avatars={avatars} size={22} />
                    <span style={{ fontSize:'0.78rem',color:'#f87171',flex:1 }}>{p.name}</span>
                    {prize>0 && <span style={{ fontFamily:'Cinzel,serif',fontSize:'0.78rem',color:'#4ade80' }}>+{prize}€</span>}
                    <button onClick={()=>rejoinPlayer(p.name)} style={{ width:'22px',height:'22px',borderRadius:'50%',border:'1px solid rgba(74,222,128,0.5)',background:'rgba(74,222,128,0.12)',color:'#4ade80',fontSize:'0.9rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>+</button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ display:'flex', gap:'10px' }}>
            <button className="btn-ghost" style={{ flex:1 }} onClick={()=>setView('create')}>← Zurück</button>
            <button style={{ flex:1,background:'rgba(192,57,43,0.1)',color:'#e74c3c',border:'1px solid rgba(192,57,43,0.35)',borderRadius:'10px',padding:'13px',fontFamily:'Cinzel,serif',fontSize:'0.72rem',letterSpacing:'0.1em',cursor:'pointer' }}
              onClick={()=>setConfirm({title:'✕ Turnier beenden?',text:'Turnier speichern und beenden?',onOk:()=>{setConfirm(null);endTournament()}})}>
              ✕ Beenden & Speichern
            </button>
          </div>
        </div>
      )}

      {/* ── HISTORY ── */}
      {!t && view === 'history' && (
        <div>
          {tournaments.length===0 && <div className="empty-state">Noch keine Turniere ♠</div>}
          {[...tournaments].sort((a,b)=>b.date?.localeCompare(a.date)).map(ht => (
            <div key={ht.id} className="card" style={{ marginBottom:'12px',padding:'16px',cursor:'pointer' }} onClick={()=>setDetailT(ht)}>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px' }}>
                <div>
                  <div className="font-display" style={{ fontSize:'0.85rem',color:'var(--gold)' }}>{ht.name}</div>
                  <div style={{ fontSize:'0.78rem',color:'var(--text-muted)' }}>{formatDate(ht.date)} · {(ht.players||[]).length} Spieler · {formatEuro(ht.buyin)} Buy-In</div>
                </div>
                <button className="btn-danger" onClick={e=>{e.stopPropagation();deleteTournament(ht.id)}}>✕</button>
              </div>
              {[...(ht.results||[])].sort((a,b)=>(a.place||99)-(b.place||99)).slice(0,3).map(r => (
                <div key={r.name} style={{ display:'flex',justifyContent:'space-between',fontSize:'0.85rem',padding:'4px 0' }}>
                  <span>{r.place===1?'🥇':r.place===2?'🥈':r.place===3?'🥉':`#${r.place}`} {r.name}</span>
                </div>
              ))}
              <div style={{ fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'6px',textAlign:'right',fontFamily:'Cinzel,serif' }}>Details ▶</div>
            </div>
          ))}
        </div>
      )}

      {/* ── RANKINGS ── */}
      {!t && view === 'rankings' && (
        <div>
          {(() => {
            const stats = {}
            tournaments.flatMap(t=>t.results||[]).forEach(r => {
              if (!stats[r.name]) stats[r.name]={name:r.name,wins:0,top3:0,played:0}
              stats[r.name].played++
              if (r.place===1) stats[r.name].wins++
              if (r.place<=3) stats[r.name].top3++
            })
            const sorted = Object.values(stats).sort((a,b)=>b.wins-a.wins||b.top3-a.top3)
            if (sorted.length===0) return <div className="empty-state">Noch keine Turnier-Ergebnisse ♠</div>
            return sorted.map((p,i) => (
              <div key={p.name} className="card" style={{ marginBottom:'10px',padding:'14px 16px',display:'flex',alignItems:'center',gap:'12px' }}>
                <div style={{ fontSize:i<3?'1.4rem':'0.9rem',minWidth:'28px',textAlign:'center' }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
                <Avatar name={p.name} avatars={avatars} size={38} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600 }}>{p.name}</div>
                  <div style={{ fontSize:'0.72rem',color:'var(--text-muted)' }}>{p.wins}× 🥇 · {p.top3}× Top 3 · {p.played} Turniere</div>
                </div>
              </div>
            ))
          })()}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailT && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:450,padding:'20px' }}
          onClick={()=>setDetailT(null)}>
          <div className="card" style={{ maxWidth:'400px',width:'100%',padding:'24px',maxHeight:'85vh',overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div className="font-display" style={{ fontSize:'1rem',color:'var(--gold)',marginBottom:'4px' }}>🎰 {detailT.name}</div>
            <div style={{ fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:'20px' }}>{formatDate(detailT.date)}</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'20px' }}>
              {[{label:'Spieler',value:(detailT.players||[]).length},{label:'Buy-In',value:formatEuro(detailT.buyin)},{label:'Pot',value:formatEuro((detailT.players||[]).length*detailT.buyin)}].map(s=>(
                <div key={s.label} style={{ textAlign:'center',padding:'10px 8px',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.06)' }}>
                  <div className="font-display" style={{ fontSize:'0.85rem',color:'var(--gold)' }}>{s.value}</div>
                  <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:'2px' }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div className="font-display" style={{ fontSize:'0.72rem',color:'var(--gold)',marginBottom:'10px' }}>ENDERGEBNIS</div>
            {[...(detailT.results||[])].sort((a,b)=>(a.place||99)-(b.place||99)).map(r => {
              const medal = r.place===1?'🥇':r.place===2?'🥈':r.place===3?'🥉':`#${r.place}`
              const prize = detailT.payouts?.[r.place-1] ? Math.round((detailT.players||[]).length*detailT.buyin*detailT.payouts[r.place-1].pct/100) : 0
              return (
                <div key={r.name} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'8px',marginBottom:'6px',background:r.place<=3?'rgba(201,168,76,0.06)':'rgba(0,0,0,0.15)',border:`1px solid ${r.place===1?'rgba(201,168,76,0.3)':'rgba(255,255,255,0.05)'}` }}>
                  <span style={{ fontSize:'1.1rem' }}>{medal}</span>
                  <Avatar name={r.name} avatars={avatars} size={30} />
                  <span style={{ flex:1,fontWeight:600 }}>{r.name}</span>
                  {prize>0 && <span className="font-display profit-pos">+{formatEuro(prize)}</span>}
                </div>
              )
            })}
            <button className="btn-ghost" style={{ width:'100%',marginTop:'20px' }} onClick={()=>setDetailT(null)}>Schließen</button>
          </div>
        </div>
      )}

      {/* ── Rebuy Confirm ── */}
      {rebuyConfirm && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:450,padding:'20px' }}
          onClick={()=>setRebuyConfirm(null)}>
          <div className="card" style={{ maxWidth:'320px',width:'100%',padding:'24px',textAlign:'center' }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:'2rem',marginBottom:'8px' }}>🔄</div>
            <div className="font-display" style={{ fontSize:'0.9rem',color:'#f472b6',letterSpacing:'0.1em',marginBottom:'6px' }}>REBUY</div>
            <div style={{ fontSize:'0.95rem',marginBottom:'6px' }}>{rebuyConfirm}</div>
            <div style={{ fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:'20px' }}>+{t?.buyin}€ · {t?.chips?.toLocaleString()} Chips</div>
            <div style={{ display:'flex',gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={()=>setRebuyConfirm(null)}>Abbrechen</button>
              <button className="btn-ghost" style={{ flex:1,borderColor:'rgba(244,114,182,0.5)',color:'#f472b6' }}
                onClick={()=>{ addRebuy(rebuyConfirm); setRebuyConfirm(null) }}>✓ Bestätigen</button>
            </div>
          </div>
        </div>
      )}

      {confirm && <ConfirmDialog {...confirm} onCancel={()=>setConfirm(null)} />}
    </div>
  )
}
