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
  const [view, setView] = useState('history')
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
  const [expandedPlayer, setExpandedPlayer] = useState(null)
  const [tvMode, setTvMode] = useState(false)
  const [tourneyPhotos, setTourneyPhotos] = useState({})
  const [lightbox, setLightbox] = useState(null)

  // Keep tRef current
  useEffect(() => { tRef.current = t }, [t])
  useEffect(() => () => {
    // Only clear the local interval — do NOT pause in Supabase
    // Timer keeps running in background based on timerStartedAt
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  useEffect(() => { loadTourneyPhotos() }, [])

  async function loadTourneyPhotos() {
    const { data: files, error } = await db.storage.from('poker-photos').list('tournaments')
    if (error || !files) return
    const map = {}
    files.forEach(file => {
      const id = file.name.replace(/\.[^.]+$/, '')
      const { data } = db.storage.from('poker-photos').getPublicUrl('tournaments/' + file.name)
      map[id] = data.publicUrl
    })
    setTourneyPhotos(map)
  }

  async function handleTourneyPhotoUpload(e, id) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { showToast('⚠ Foto zu groß (max. 10 MB)'); return }
    showToast('📷 Foto wird hochgeladen…')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `tournaments/${id}.${ext}`
    const { error } = await db.storage.from('poker-photos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { showToast('⚠ Upload fehlgeschlagen: ' + error.message); return }
    const { data } = db.storage.from('poker-photos').getPublicUrl(path)
    const url = data.publicUrl + '?t=' + Date.now()
    setTourneyPhotos(prev => ({ ...prev, [id]: url }))
    showToast('📷 Foto gespeichert!')
  }

  async function removeTourneyPhoto(id) {
    const exts = ['jpg','jpeg','png','webp','heic']
    for (const ext of exts) {
      await db.storage.from('poker-photos').remove([`tournaments/${id}.${ext}`]).catch(() => {})
    }
    setTourneyPhotos(prev => { const n = { ...prev }; delete n[id]; return n })
    showToast('Foto entfernt')
  }

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

  async function writeDb(tournament) {
    try {
      const serverNow = new Date().toISOString()
      const { data } = await db.from('live_tournament').upsert(
        { id: 'current', data: { tournament, writerId: myId.current }, updated_at: serverNow },
        { onConflict: 'id' }
      ).select('updated_at').single()
      // If tournament is running, correct timerStartedAt using the real server time
      // This eliminates clock skew between devices
      if (data?.updated_at && !tournament.timerPaused && tournament.timerStartedAt) {
        const serverTs = new Date(data.updated_at).getTime()
        const localTs = Date.now()
        const skew = localTs - serverTs // positive = local clock is ahead
        if (Math.abs(skew) > 500) {
          // Correct the stored timerStartedAt by the skew
          const corrected = { ...tournament, timerStartedAt: tournament.timerStartedAt + skew }
          tRef.current = corrected
          setT(corrected)
        }
      }
    } catch (_) {}
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
    db.from('live_tournament').select('data, updated_at').eq('id', 'current').single()
      .then(({ data }) => {
        if (data?.data?.tournament) {
          let tournament = data.data.tournament
          // Correct for clock skew using the server's updated_at timestamp
          if (!tournament.timerPaused && tournament.timerStartedAt && data.updated_at) {
            const serverTs = new Date(data.updated_at).getTime()
            const localTs = Date.now()
            const skew = localTs - serverTs
            if (Math.abs(skew) > 500) {
              tournament = { ...tournament, timerStartedAt: tournament.timerStartedAt + skew }
            }
          }
          tRef.current = tournament
          setT(tournament)
          setView('live')
          startTimer(tournament)
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
    setView('live')
    writeDb(newT)
  }

  function adjustTimer(seconds) {
    const cur = tRef.current
    if (!cur) return
    // Shift timerStartedAt forward/backward to add/remove seconds
    // +30s means more time → shift startedAt forward (later) so elapsed is less
    // -30s means less time → shift startedAt backward (earlier) so elapsed is more
    const updated = { ...cur, timerStartedAt: (cur.timerStartedAt || Date.now()) - seconds * 1000 }
    tRef.current = updated
    setT(updated)
    setTimeLeft(calcRemaining(updated))
    setTimeout(() => writeDb(updated), 0)
  }

  function toggleTimer() {
    const prev = tRef.current
    if (!prev) return
    const lvl = prev.timerLevel || 0
    const totalSecs = (prev.blinds[lvl]?.duration || 20) * 60
    let updated
    if (prev.timerPaused) {
      // Bake the already-elapsed seconds INTO timerStartedAt.
      // calcRemaining does: totalSecs - timerElapsed - (Date.now() - timerStartedAt)/1000
      // We set timerElapsed=0 and timerStartedAt = Date.now() - prevElapsed*1000
      // So: totalSecs - 0 - (Date.now() - (Date.now() - prevElapsed*1000))/1000
      //   = totalSecs - prevElapsed  ✓
      // Any device receiving this later: Date.now() is also later by the same delta → still correct ✓
      const prevElapsed = prev.timerElapsed || 0
      updated = { ...prev, timerPaused: false, timerElapsed: 0, timerStartedAt: Date.now() - prevElapsed * 1000 }
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
    const prev = tRef.current
    if (!prev) return
    const remaining = prev.players.filter(p => !p.eliminated && p.name !== name)
    const place = remaining.length + 1
    const updated = {
      ...prev,
      players: prev.players.map(p => p.name === name ? { ...p, eliminated: true, place } : p),
      results: [...(prev.results||[]).filter(r=>r.name!==name), { name, place }],
    }
    setT(updated)
    setTimeout(() => writeDb(updated), 0)
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
    const snapshot = { ...t }
    // Clear immediately to prevent double-trigger
    tRef.current = null
    setT(null)
    setView('create')
    if (timerRef.current) clearInterval(timerRef.current)
    const { error } = await db.from('poker_tournaments').insert([{
      id: crypto.randomUUID(),
      name: snapshot.name, date: snapshot.date, buyin: snapshot.buyin,
      players: snapshot.players, results: snapshot.results, payouts: snapshot.payouts,
    }])
    if (error) { showToast('Fehler: ' + error.message); return }
    await db.from('live_tournament').delete().eq('id', 'current')
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

      {/* Sub nav — always visible except during live view */}
      {view !== 'live' && (
        <div style={{ display:'flex', gap:'6px', marginBottom:'20px' }}>
          {[
            ...(t ? [{id:'live',label:'🔴 Live'}] : []),
            {id:'create',label:'✚ Erstellen'},
            {id:'history',label:'🎰 Turniere'},
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

      {/* ── RESUME BANNER — shown when tournament is running but user is in overview ── */}
      {t && view !== 'live' && (
        <div style={{ marginBottom:'16px', padding:'14px 16px', borderRadius:'12px', background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.3)', display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ fontSize:'1.2rem' }}>🔴</div>
          <div style={{ flex:1 }}>
            <div className="font-display" style={{ fontSize:'0.75rem', color:'#4ade80', letterSpacing:'0.1em' }}>{t.name}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'2px' }}>
              Level {realLevelNum} · {activePlayers} im Spiel · {totalPot}€ Pot
            </div>
          </div>
          <button onClick={()=>setView('live')} style={{ padding:'9px 16px', borderRadius:'8px', border:'1px solid rgba(74,222,128,0.5)', background:'rgba(74,222,128,0.15)', color:'#4ade80', fontFamily:'Cinzel,serif', fontSize:'0.7rem', letterSpacing:'0.08em', cursor:'pointer', flexShrink:0 }}>
            ▶ FORTSETZEN
          </button>
        </div>
      )}

      {/* ── LIVE ── */}
      {t && view === 'live' && (() => {
        if (tvMode) return (
          <div style={{ position:'fixed',inset:0,background:'#0a0a0c',zIndex:1000,display:'flex',flexDirection:'column',padding:'14px 20px',fontFamily:'Cinzel,serif',overflow:'hidden' }}>

            {/* Top bar */}
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px',flexShrink:0 }}>
              <div style={{ fontSize:'1.1rem',color:'var(--gold)',letterSpacing:'0.2em' }}>🎰 {t.name}</div>
              <div style={{ display:'flex',gap:'10px' }}>
                <button onClick={()=>{ if(lvl>0) advanceLevel(t,lvl-1) }} disabled={lvl===0}
                  style={{ padding:'10px 18px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'1rem',cursor:'pointer',opacity:lvl===0?0.3:1 }}>◄</button>
                <button onClick={()=>{ if(lvl<t.blinds.length-1) advanceLevel(t,lvl+1) }} disabled={lvl>=t.blinds.length-1}
                  style={{ padding:'10px 18px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.12)',background:'rgba(255,255,255,0.05)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'1rem',cursor:'pointer',opacity:lvl>=t.blinds.length-1?0.3:1 }}>►</button>
                <button onClick={toggleTimer} style={{ padding:'10px 28px',borderRadius:'8px',border:`1px solid ${t.timerPaused?'rgba(74,222,128,0.5)':'rgba(248,113,113,0.4)'}`,background:t.timerPaused?'rgba(74,222,128,0.12)':'rgba(248,113,113,0.1)',color:t.timerPaused?'#4ade80':'#f87171',fontFamily:'Cinzel,serif',fontSize:'0.9rem',cursor:'pointer',letterSpacing:'0.1em' }}>
                  {t.timerPaused ? '▶ WEITER' : '⏸ PAUSE'}
                </button>
                <button onClick={()=>setTvMode(false)} style={{ padding:'10px 18px',borderRadius:'8px',border:'1px solid rgba(255,255,255,0.15)',background:'rgba(255,255,255,0.06)',color:'var(--text-muted)',fontFamily:'Cinzel,serif',fontSize:'0.8rem',cursor:'pointer' }}>✕ EXIT</button>
              </div>
            </div>

            {/* Main grid */}
            <div style={{ display:'grid',gridTemplateColumns:'1fr 420px',gap:'16px',flex:1,minHeight:0 }}>

              {/* LEFT */}
              <div style={{ display:'flex',flexDirection:'column',gap:'10px',minHeight:0 }}>

                {/* Timer + Blinds block */}
                <div style={{ textAlign:'center',background:'rgba(0,0,0,0.35)',borderRadius:'18px',border:`2px solid ${isPause?'rgba(96,165,250,0.4)':timerColor+'66'}`,padding:'16px 24px 12px',flex:'1 1 0',display:'flex',flexDirection:'column',justifyContent:'space-evenly',minHeight:0 }}>
                  {isPause
                    ? <div style={{ fontSize:'clamp(1rem,1.6vw,1.4rem)',color:'#60a5fa',letterSpacing:'0.3em' }}>☕ PAUSE</div>
                    : <div style={{ fontSize:'clamp(1rem,1.6vw,1.4rem)',color:'var(--text-muted)',letterSpacing:'0.3em' }}>LEVEL {realLevelNum}</div>
                  }

                  {/* TIMER — biggest element */}
                  <div style={{ fontSize:'clamp(8rem,20vw,17rem)',color:timerColor,lineHeight:1,letterSpacing:'0.04em',fontVariantNumeric:'tabular-nums' }}>
                    {timerMin}:{timerSec}
                  </div>

                  {/* Blinds */}
                  {!isPause && (
                    <div style={{ display:'flex',justifyContent:'center',gap:'0',marginTop:'20px',background:'rgba(201,168,76,0.06)',borderRadius:'12px',border:'1px solid rgba(201,168,76,0.15)',overflow:'hidden' }}>
                      <div style={{ flex:1,textAlign:'center',padding:'20px 28px' }}>
                        <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.75rem)',color:'var(--text-muted)',letterSpacing:'0.2em',marginBottom:'12px' }}>SMALL BLIND</div>
                        <div style={{ fontSize:'clamp(3.5rem,7vw,6rem)',color:'var(--gold)',lineHeight:1 }}>{currentBlind?.sb}</div>
                      </div>
                      <div style={{ width:'1px',background:'rgba(201,168,76,0.2)',margin:'12px 0' }} />
                      <div style={{ flex:1,textAlign:'center',padding:'20px 28px' }}>
                        <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.75rem)',color:'var(--text-muted)',letterSpacing:'0.2em',marginBottom:'12px' }}>BIG BLIND</div>
                        <div style={{ fontSize:'clamp(3.5rem,7vw,6rem)',color:'var(--gold)',lineHeight:1 }}>{currentBlind?.bb}</div>
                      </div>
                    </div>
                  )}

                  {/* Next level */}
                  {nextBlind && (
                    <div style={{ marginTop:'14px',padding:'10px 20px',borderRadius:'10px',background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.2)',display:'inline-flex',gap:'16px',justifyContent:'center',alignItems:'baseline' }}>
                      <span style={{ fontSize:'clamp(0.75rem,1.1vw,1rem)',color:'var(--text-muted)',letterSpacing:'0.15em' }}>NÄCHSTES LEVEL →</span>
                      <span style={{ fontSize:'clamp(2rem,3.8vw,3.2rem)',color:'#60a5fa',lineHeight:1 }}>
                        {nextBlind.pause ? '☕ Pause' : `${nextBlind.sb} / ${nextBlind.bb}`}
                      </span>
                      <span style={{ fontSize:'clamp(0.6rem,1vw,0.85rem)',color:'var(--text-muted)' }}>{nextBlind.duration} Min</span>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div style={{ display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',flexShrink:0 }}>
                  {[
                    {label:'GESAMTPOT',value:totalPot+'€',color:'#4ade80'},
                    {label:'CHIPS',value:totalChips.toLocaleString(),color:'#38bdf8'},
                    {label:'Ø STACK',value:avgStack.toLocaleString(),color:'#a78bfa'},
                    {label:'REBUYS',value:totalRebuys,color:'#f472b6'},
                  ].map(s=>(
                    <div key={s.label} style={{ textAlign:'center',padding:'16px 8px',borderRadius:'12px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ fontSize:'clamp(0.5rem,0.8vw,0.7rem)',color:'var(--text-muted)',letterSpacing:'0.12em',marginBottom:'8px' }}>{s.label}</div>
                      <div style={{ fontSize:'clamp(1.8rem,3.5vw,3rem)',color:s.color,lineHeight:1 }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* Payouts */}
                {t.payouts.some(p=>p.pct>0) && (
                  <div style={{ display:'flex',gap:'10px',flexShrink:0 }}>
                    {t.payouts.filter(p=>p.pct>0).map((p,i)=>(
                      <div key={i} style={{ flex:1,textAlign:'center',padding:'14px 8px',borderRadius:'12px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(201,168,76,0.18)' }}>
                        <div style={{ fontSize:'clamp(1.2rem,2vw,1.6rem)',marginBottom:'6px' }}>{['🥇','🥈','🥉'][i]||`${i+1}.`}</div>
                        <div style={{ fontSize:'clamp(1.6rem,3vw,2.6rem)',color:'var(--gold)',lineHeight:1 }}>{Math.round(totalPot*p.pct/100)}€</div>
                        <div style={{ fontSize:'clamp(0.55rem,0.9vw,0.75rem)',color:'var(--text-muted)',marginTop:'4px' }}>{p.pct}%</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* RIGHT — Players */}
              <div style={{ display:'flex',flexDirection:'column',gap:'8px',overflowY:'auto',minHeight:0 }}>
                <div style={{ fontSize:'clamp(0.6rem,0.9vw,0.75rem)',color:'#4ade80',letterSpacing:'0.2em',marginBottom:'4px',flexShrink:0 }}>IM SPIEL ({activePlayers})</div>
                {t.players.filter(p=>!p.eliminated).map(p=>(
                  <div key={p.name} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'12px 14px',borderRadius:'12px',background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.18)',flexShrink:0 }}>
                    <Avatar name={p.name} avatars={avatars} size={38} />
                    <span style={{ flex:1,fontSize:'clamp(0.9rem,1.5vw,1.2rem)',color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
                    {(p.rebuys||0)>0 && <span style={{ fontSize:'0.8rem',color:'#f472b6',background:'rgba(244,114,182,0.12)',border:'1px solid rgba(244,114,182,0.3)',borderRadius:'6px',padding:'3px 8px',flexShrink:0 }}>{p.rebuys}×R</span>}
                    <button onClick={()=>setRebuyConfirm(p.name)} style={{ padding:'6px 12px',borderRadius:'6px',border:'1px solid rgba(244,114,182,0.4)',background:'rgba(244,114,182,0.1)',color:'#f472b6',fontSize:'0.8rem',cursor:'pointer',flexShrink:0 }}>+R</button>
                    <button onClick={()=>eliminatePlayer(p.name)} style={{ padding:'6px 12px',borderRadius:'6px',border:'1px solid rgba(248,113,113,0.35)',background:'rgba(248,113,113,0.08)',color:'#f87171',fontSize:'0.8rem',cursor:'pointer',flexShrink:0 }}>✕</button>
                  </div>
                ))}

                {t.players.filter(p=>p.eliminated).length>0 && (
                  <>
                    <div style={{ fontSize:'clamp(0.6rem,0.9vw,0.75rem)',color:'#f87171',letterSpacing:'0.2em',marginTop:'10px',marginBottom:'4px',flexShrink:0 }}>AUSGESCHIEDEN</div>
                    {[...t.players.filter(p=>p.eliminated)].sort((a,b)=>(a.place||99)-(b.place||99)).map(p=>{
                      const medal=p.place===1?'🥇':p.place===2?'🥈':p.place===3?'🥉':`${p.place}.`
                      const prize=t.payouts[p.place-1]?Math.round(totalPot*t.payouts[p.place-1].pct/100):0
                      return (
                        <div key={p.name} style={{ display:'flex',alignItems:'center',gap:'8px',padding:'10px 12px',borderRadius:'10px',background:'rgba(248,113,113,0.05)',border:'1px solid rgba(248,113,113,0.12)',flexShrink:0 }}>
                          <span style={{ fontSize:'1rem',minWidth:'24px' }}>{medal}</span>
                          <Avatar name={p.name} avatars={avatars} size={30} />
                          <span style={{ flex:1,fontSize:'clamp(0.85rem,1.3vw,1.05rem)',color:'#f87171',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
                          {prize>0 && <span style={{ fontSize:'clamp(0.8rem,1.2vw,1rem)',color:'#4ade80',fontFamily:'Cinzel,serif',flexShrink:0 }}>+{prize}€</span>}
                          <button onClick={()=>rejoinPlayer(p.name)} style={{ width:'28px',height:'28px',borderRadius:'50%',border:'1px solid rgba(74,222,128,0.5)',background:'rgba(74,222,128,0.12)',color:'#4ade80',fontSize:'1.1rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>+</button>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Rebuy confirm — works in TV mode too */}
            {rebuyConfirm && (
              <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:'20px' }}>
                <div className="card" style={{ maxWidth:'360px',width:'100%',padding:'28px',textAlign:'center' }}>
                  <div style={{ fontSize:'2rem',marginBottom:'10px' }}>↺</div>
                  <div className="font-display" style={{ fontSize:'0.9rem',color:'var(--gold)',marginBottom:'6px' }}>REBUY BESTÄTIGEN</div>
                  <div style={{ fontSize:'1.1rem',marginBottom:'6px' }}>{rebuyConfirm}</div>
                  <div style={{ fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:'24px' }}>+{t?.buyin}€ · {t?.chips?.toLocaleString()} Chips</div>
                  <div style={{ display:'flex',gap:'10px' }}>
                    <button className="btn-ghost" style={{ flex:1 }} onClick={()=>setRebuyConfirm(null)}>Abbrechen</button>
                    <button style={{ flex:1,background:'rgba(244,114,182,0.12)',color:'#f472b6',border:'1px solid rgba(244,114,182,0.4)',borderRadius:'10px',padding:'13px',fontFamily:'Cinzel,serif',fontSize:'0.75rem',cursor:'pointer' }}
                      onClick={()=>{ addRebuy(rebuyConfirm); setRebuyConfirm(null) }}>✓ Bestätigen</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )

        return (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px', padding:'8px 12px', borderRadius:'8px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
            <span className="font-display" style={{ fontSize:'0.7rem', color:'var(--gold-light)' }}>{t.name}</span>
            <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
              <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{activePlayers} im Spiel</span>
              <button onClick={()=>setTvMode(true)} style={{ padding:'5px 12px',borderRadius:'7px',border:'1px solid rgba(201,168,76,0.35)',background:'rgba(201,168,76,0.08)',color:'var(--gold)',fontFamily:'Cinzel,serif',fontSize:'0.6rem',letterSpacing:'0.06em',cursor:'pointer' }}>📺 TV</button>
            </div>
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
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'10px' }}>
                    <button onClick={()=>adjustTimer(-30)} style={{ padding:'6px 10px', borderRadius:'7px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', fontFamily:'Cinzel,serif', fontSize:'0.65rem', cursor:'pointer' }}>−30s</button>
                    <div style={{ fontFamily:'Cinzel,serif', fontSize:'5rem', color:timerColor, lineHeight:1, letterSpacing:'0.05em' }}>{timerMin}:{timerSec}</div>
                    <button onClick={()=>adjustTimer(30)} style={{ padding:'6px 10px', borderRadius:'7px', border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', fontFamily:'Cinzel,serif', fontSize:'0.65rem', cursor:'pointer' }}>+30s</button>
                  </div>
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
            <button className="btn-ghost" style={{ flex:1 }} onClick={()=>setView('create')}>← Übersicht</button>
            <button style={{ flex:1,background:'rgba(192,57,43,0.1)',color:'#e74c3c',border:'1px solid rgba(192,57,43,0.35)',borderRadius:'10px',padding:'13px',fontFamily:'Cinzel,serif',fontSize:'0.72rem',letterSpacing:'0.1em',cursor:'pointer' }}
              onClick={()=>setConfirm({title:'✕ Turnier beenden?',text:'Turnier speichern und beenden?',onOk:()=>{setConfirm(null);endTournament()}})}>
              ✕ Beenden & Speichern
            </button>
          </div>
        </div>
        )
      })()}

      {/* ── HISTORY ── */}
      {view === 'history' && (
        <div>
          {tournaments.length===0 && <div className="empty-state">Noch keine Turniere ♠</div>}
          {[...tournaments].sort((a,b)=>b.date?.localeCompare(a.date)).map(ht => {
            const top3 = [...(ht.results||[])].sort((a,b)=>(a.place||99)-(b.place||99)).slice(0,3)
            const photo = tourneyPhotos[ht.id]
            return (
              <div key={ht.id} className="card" style={{ marginBottom:'12px',padding:'16px',cursor:'pointer' }} onClick={()=>setDetailT(ht)}>
                <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px' }}>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div className="font-display" style={{ fontSize:'0.85rem',color:'var(--gold)' }}>{ht.name}</div>
                    <div style={{ fontSize:'0.78rem',color:'var(--text-muted)' }}>{formatDate(ht.date)} · {(ht.players||[]).length} Spieler · {formatEuro(ht.buyin)} Buy-In</div>
                  </div>
                  <button className="btn-danger" style={{ flexShrink:0,marginLeft:'8px' }} onClick={e=>{e.stopPropagation();deleteTournament(ht.id)}}>✕</button>
                </div>

                <div style={{ display:'flex',gap:'10px',alignItems:'stretch' }}>
                  {/* Top 3 with avatars */}
                  <div style={{ flex:1,display:'flex',flexDirection:'column',gap:'5px' }}>
                    {top3.map(r => (
                      <div key={r.name} style={{ display:'flex',alignItems:'center',gap:'7px',fontSize:'0.85rem' }}>
                        <span style={{ minWidth:'20px' }}>{r.place===1?'🥇':r.place===2?'🥈':'🥉'}</span>
                        <Avatar name={r.name} avatars={avatars} size={24} />
                        <span style={{ overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Photo thumbnail */}
                  {photo && (
                    <div style={{ flexShrink:0,width:'80px',borderRadius:'8px',overflow:'hidden',border:'1px solid rgba(201,168,76,0.2)' }}>
                      <img src={photo} alt={ht.name} style={{ width:'100%',height:'100%',objectFit:'cover',display:'block' }} />
                    </div>
                  )}
                </div>

                <div style={{ fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'8px',textAlign:'right',fontFamily:'Cinzel,serif' }}>Details ▶</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── RANKINGS ── */}
      {view === 'rankings' && (
        <div>
          {(() => {
            const stats = {}
            tournaments.forEach(ht => {
              const payoutPlaces = (ht.payouts||[]).filter(p=>p.pct>0).length
              const totalRebuys = (ht.players||[]).reduce((s,p)=>s+(p.rebuys||0),0)
              const realPot = ((ht.players||[]).length + totalRebuys) * ht.buyin
              ;(ht.results||[]).forEach(r => {
                if (!stats[r.name]) stats[r.name]={name:r.name,wins:0,second:0,third:0,itm:0,played:0,rebuys:0,prizeMoney:0,bestPlace:Infinity,tournaments:[]}
                const s = stats[r.name]
                s.played++
                if (r.place===1) s.wins++
                if (r.place===2) s.second++
                if (r.place===3) s.third++
                if (r.place<=payoutPlaces) s.itm++
                if (r.place<s.bestPlace) s.bestPlace=r.place
                const playerData = (ht.players||[]).find(p=>p.name===r.name)
                s.rebuys += playerData?.rebuys||0
                const prize = r.place<=payoutPlaces && ht.payouts?.[r.place-1]
                  ? Math.round(realPot*ht.payouts[r.place-1].pct/100) : 0
                s.prizeMoney += prize
                s.tournaments.push({ name:ht.name, date:ht.date, place:r.place, prize, rebuys:playerData?.rebuys||0, buyin:ht.buyin })
              })
            })
            const sorted = Object.values(stats).sort((a,b)=>
              b.wins-a.wins || b.itm-a.itm || b.second-a.second || b.third-a.third || b.played-a.played
            )
            if (sorted.length===0) return <div className="empty-state">Noch keine Turnier-Ergebnisse ♠</div>
            return sorted.map((p,i) => {
              const itmPct = p.played>0 ? Math.round(p.itm/p.played*100) : 0
              const isOpen = expandedPlayer === p.name
              return (
                <div key={p.name} className="card" style={{ marginBottom:'10px',padding:'0',cursor:'pointer' }}
                  onClick={()=>setExpandedPlayer(isOpen ? null : p.name)}>

                  {/* Always visible row */}
                  <div style={{ display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px' }}>
                    <div style={{ fontSize:i<3?'1.4rem':'0.9rem',minWidth:'28px',textAlign:'center',flexShrink:0 }}>{i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`}</div>
                    <Avatar name={p.name} avatars={avatars} size={42} />
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontWeight:600,fontSize:'1rem',marginBottom:'3px' }}>{p.name}</div>
                      <div style={{ display:'flex',gap:'6px',flexWrap:'wrap' }}>
                        <span style={{ fontSize:'0.68rem',color:'#C9A84C' }}>🥇 {p.wins}×</span>
                        <span style={{ fontSize:'0.68rem',color:'#4ade80' }}>💰 {p.itm}× ITM</span>
                        <span style={{ fontSize:'0.68rem',color:'var(--text-muted)' }}>🎰 {p.played}</span>
                      </div>
                    </div>
                    <div style={{ textAlign:'right',flexShrink:0 }}>
                      {p.prizeMoney>0 && <div className="font-display" style={{ fontSize:'0.9rem',color:'#4ade80' }}>+{p.prizeMoney}€</div>}
                      <div style={{ fontSize:'0.7rem',color:'var(--text-muted)' }}>{itmPct}% ITM</div>
                    </div>
                    <div style={{ color:'var(--text-muted)',fontSize:'0.9rem',marginLeft:'4px' }}>{isOpen?'▲':'▼'}</div>
                  </div>

                  {/* Expanded stats */}
                  {isOpen && (
                    <div style={{ borderTop:'1px solid rgba(201,168,76,0.1)',padding:'14px 16px' }}
                      onClick={e=>e.stopPropagation()}>

                      {/* Stats grid */}
                      <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'10px' }}>
                        {[
                          {label:'Turniere',value:p.played},
                          {label:'Siege 🥇',value:p.wins},
                          {label:'ITM 💰',value:p.itm},
                          {label:'ITM %',value:itmPct+'%'},
                          {label:'Platz 2 🥈',value:p.second},
                          {label:'Platz 3 🥉',value:p.third},
                          {label:'Bester Platz',value:p.bestPlace===Infinity?'—':'#'+p.bestPlace},
                          {label:'Rebuys',value:p.rebuys},
                          {label:'Preisgeld',value:p.prizeMoney>0?'+'+p.prizeMoney+'€':'—',color:p.prizeMoney>0?'#4ade80':undefined},
                        ].map(s=>(
                          <div key={s.label} style={{ background:'rgba(0,0,0,0.2)',borderRadius:'8px',padding:'10px 8px',textAlign:'center',border:'1px solid rgba(255,255,255,0.04)' }}>
                            <div className="font-display" style={{ fontSize:'0.85rem',color:s.color||'var(--gold)' }}>{s.value}</div>
                            <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:'3px',fontFamily:'Cinzel,serif',letterSpacing:'0.06em' }}>{s.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* ITM bar */}
                      {p.played>0 && (
                        <div style={{ marginBottom:'14px' }}>
                          <div style={{ display:'flex',borderRadius:'6px',overflow:'hidden',height:'8px',marginBottom:'4px' }}>
                            <div style={{ flex:p.wins,background:'#C9A84C',opacity:0.9 }} />
                            <div style={{ flex:p.itm-p.wins,background:'#4ade80',opacity:0.7 }} />
                            <div style={{ flex:p.played-p.itm,background:'rgba(255,255,255,0.1)' }} />
                          </div>
                          <div style={{ display:'flex',justifyContent:'space-between',fontSize:'0.65rem',color:'var(--text-muted)' }}>
                            <span style={{ color:'#C9A84C' }}>🥇 {p.wins} Siege</span>
                            <span style={{ color:'#4ade80' }}>💰 {p.itm} ITM</span>
                            <span>🎰 {p.played} gesamt</span>
                          </div>
                        </div>
                      )}

                      {/* Tournament history */}
                      <div style={{ fontFamily:'Cinzel,serif',fontSize:'0.65rem',color:'var(--text-muted)',letterSpacing:'0.1em',marginBottom:'8px' }}>
                        TURNIER VERLAUF ({p.tournaments.length})
                      </div>
                      {[...p.tournaments].sort((a,b)=>b.date.localeCompare(a.date)).map((t,ti)=>{
                        const medal = t.place===1?'🥇':t.place===2?'🥈':t.place===3?'🥉':`#${t.place}`
                        return (
                          <div key={ti} style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.04)',fontSize:'0.8rem' }}>
                            <span style={{ color:'var(--text-muted)',fontSize:'0.72rem',minWidth:'72px' }}>{t.date}</span>
                            <span style={{ flex:1,marginLeft:'8px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--text-primary)' }}>{t.name}</span>
                            <span style={{ margin:'0 8px' }}>{medal}</span>
                            {t.rebuys>0 && <span style={{ fontSize:'0.65rem',color:'#f472b6',marginRight:'6px' }}>{t.rebuys}R</span>}
                            {t.prize>0
                              ? <span className="font-display" style={{ color:'#4ade80',fontSize:'0.78rem' }}>+{t.prize}€</span>
                              : <span style={{ color:'var(--text-muted)',fontSize:'0.78rem' }}>–</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailT && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:450,padding:'20px' }}
          onClick={()=>setDetailT(null)}>
          <div className="card" style={{ maxWidth:'400px',width:'100%',padding:'24px',maxHeight:'85vh',overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
            <div className="font-display" style={{ fontSize:'1rem',color:'var(--gold)',marginBottom:'4px' }}>🎰 {detailT.name}</div>
            <div style={{ fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:'16px' }}>{formatDate(detailT.date)}</div>

            {/* Stats grid */}
            {(() => {
              const totalRebuys = (detailT.players||[]).reduce((s,p)=>s+(p.rebuys||0),0)
              const totalEntries = (detailT.players||[]).length + totalRebuys
              const realPot = totalEntries * detailT.buyin
              return (
                <>
                  <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'8px' }}>
                    {[
                      {label:'Spieler',value:(detailT.players||[]).length},
                      {label:'Buy-In',value:formatEuro(detailT.buyin)},
                      {label:'Rebuys',value:totalRebuys,color:'#f472b6'},
                    ].map(s=>(
                      <div key={s.label} style={{ textAlign:'center',padding:'10px 8px',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.06)' }}>
                        <div className="font-display" style={{ fontSize:'0.85rem',color:s.color||'var(--gold)' }}>{s.value}</div>
                        <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:'2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'20px' }}>
                    {[
                      {label:'Entries gesamt',value:totalEntries},
                      {label:'Gesamtpot',value:formatEuro(realPot),color:'#4ade80'},
                    ].map(s=>(
                      <div key={s.label} style={{ textAlign:'center',padding:'10px 8px',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.06)' }}>
                        <div className="font-display" style={{ fontSize:'0.85rem',color:s.color||'var(--gold)' }}>{s.value}</div>
                        <div style={{ fontSize:'0.6rem',color:'var(--text-muted)',marginTop:'2px' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Photo */}
                  {(() => {
                    const photoUrl = tourneyPhotos[detailT.id]
                    return (
                      <div style={{ marginBottom:'20px' }}>
                        {photoUrl ? (
                          <div style={{ position:'relative',borderRadius:'12px',overflow:'hidden' }}>
                            <img src={photoUrl} alt={detailT.name} onClick={()=>setLightbox(photoUrl)}
                              style={{ width:'100%',maxHeight:'200px',objectFit:'cover',cursor:'pointer',display:'block' }} />
                            <button onClick={()=>removeTourneyPhoto(detailT.id)}
                              style={{ position:'absolute',top:'8px',right:'8px',background:'rgba(0,0,0,0.7)',border:'1px solid rgba(248,113,113,0.5)',color:'#f87171',borderRadius:'6px',padding:'4px 10px',fontSize:'0.7rem',cursor:'pointer',fontFamily:'Cinzel,serif' }}>
                              🗑 Entfernen
                            </button>
                          </div>
                        ) : (
                          <label style={{ display:'block',border:'2px dashed rgba(201,168,76,0.25)',borderRadius:'12px',padding:'16px',textAlign:'center',cursor:'pointer',background:'rgba(201,168,76,0.03)' }}>
                            <div style={{ fontSize:'1.5rem',marginBottom:'4px' }}>📷</div>
                            <div style={{ fontFamily:'Cinzel,serif',fontSize:'0.65rem',color:'var(--text-muted)',letterSpacing:'0.1em' }}>FOTO HINZUFÜGEN</div>
                            <input type="file" accept="image/*" style={{ display:'none' }}
                              onChange={e=>handleTourneyPhotoUpload(e, detailT.id)} />
                          </label>
                        )}
                      </div>
                    )
                  })()}

                  {/* Payouts */}
                  {(detailT.payouts||[]).some(p=>p.pct>0) && (
                    <>
                      <div className="font-display" style={{ fontSize:'0.72rem',color:'var(--gold)',marginBottom:'8px' }}>PREISGELD</div>
                      <div style={{ display:'flex',gap:'6px',marginBottom:'20px' }}>
                        {(detailT.payouts||[]).filter(p=>p.pct>0).map((p,i)=>(
                          <div key={i} style={{ flex:1,textAlign:'center',padding:'8px 4px',borderRadius:'8px',background:'rgba(0,0,0,0.2)',border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize:'1rem' }}>{['🥇','🥈','🥉'][i]||`${i+1}.`}</div>
                            <div className="font-display" style={{ fontSize:'0.9rem',color:'#4ade80' }}>{formatEuro(Math.round(realPot*p.pct/100))}</div>
                            <div style={{ fontSize:'0.6rem',color:'var(--text-muted)' }}>{p.pct}%</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Results */}
                  <div className="font-display" style={{ fontSize:'0.72rem',color:'var(--gold)',marginBottom:'10px' }}>ENDERGEBNIS</div>
                  {[...(detailT.results||[])].sort((a,b)=>(a.place||99)-(b.place||99)).map(r => {
                    const medal = r.place===1?'🥇':r.place===2?'🥈':r.place===3?'🥉':`#${r.place}`
                    const payoutPlaces = (detailT.payouts||[]).filter(p=>p.pct>0).length
                    const prize = r.place<=payoutPlaces && detailT.payouts?.[r.place-1]
                      ? Math.round(realPot*detailT.payouts[r.place-1].pct/100) : 0
                    const playerData = (detailT.players||[]).find(p=>p.name===r.name)
                    const rebuys = playerData?.rebuys||0
                    const itm = r.place <= payoutPlaces
                    return (
                      <div key={r.name} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'8px',marginBottom:'6px',background:itm?'rgba(201,168,76,0.06)':'rgba(0,0,0,0.15)',border:`1px solid ${r.place===1?'rgba(201,168,76,0.3)':itm?'rgba(74,222,128,0.15)':'rgba(255,255,255,0.05)'}` }}>
                        <span style={{ fontSize:'1.1rem',minWidth:'24px' }}>{medal}</span>
                        <Avatar name={r.name} avatars={avatars} size={30} />
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600,fontSize:'0.9rem' }}>{r.name}</div>
                          {rebuys>0 && <div style={{ fontSize:'0.65rem',color:'#f472b6' }}>{rebuys}× Rebuy</div>}
                        </div>
                        {prize>0
                          ? <span className="font-display" style={{ color:'#4ade80',fontSize:'0.85rem' }}>+{formatEuro(prize)}</span>
                          : <span style={{ fontSize:'0.7rem',color:'var(--text-muted)' }}>–</span>
                        }
                      </div>
                    )
                  })}

                  {/* Players who didn't finish (no result entry) */}
                  {(detailT.players||[]).filter(p=> !(detailT.results||[]).find(r=>r.name===p.name)).length > 0 && (
                    <>
                      <div className="font-display" style={{ fontSize:'0.65rem',color:'var(--text-muted)',letterSpacing:'0.1em',margin:'12px 0 6px' }}>WEITERE SPIELER</div>
                      {(detailT.players||[]).filter(p=> !(detailT.results||[]).find(r=>r.name===p.name)).map(p=>(
                        <div key={p.name} style={{ display:'flex',alignItems:'center',gap:'10px',padding:'8px 12px',borderRadius:'8px',marginBottom:'4px',background:'rgba(0,0,0,0.1)',border:'1px solid rgba(255,255,255,0.04)' }}>
                          <Avatar name={p.name} avatars={avatars} size={26} />
                          <span style={{ flex:1,fontSize:'0.85rem',color:'var(--text-muted)' }}>{p.name}</span>
                          {(p.rebuys||0)>0 && <span style={{ fontSize:'0.65rem',color:'#f472b6' }}>{p.rebuys}× Rebuy</span>}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )
            })()}

            <button className="btn-ghost" style={{ width:'100%',marginTop:'20px' }} onClick={()=>setDetailT(null)}>Schließen</button>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox && (
        <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center' }}
          onClick={()=>setLightbox(null)}>
          <img src={lightbox} alt="" style={{ maxWidth:'95%',maxHeight:'90vh',borderRadius:'10px',objectFit:'contain' }} />
          <button onClick={()=>setLightbox(null)}
            style={{ position:'absolute',top:'16px',right:'16px',background:'rgba(0,0,0,0.6)',border:'none',color:'white',fontSize:'1.5rem',cursor:'pointer',borderRadius:'50%',width:'36px',height:'36px',display:'flex',alignItems:'center',justifyContent:'center' }}>✕</button>
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
