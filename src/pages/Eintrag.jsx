import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { formatEuroSign } from '../lib/helpers'
import { showToast } from '../components/Toast'
import Avatar from '../components/Avatar'
import { calcYearBadges } from '../lib/badges'

// ─── Spieler des Monats Berechnung ───────────────────────────────────────────
function calcPlayerOfMonth(sessions, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  const monthSessions = sessions.filter(s => {
    const d = new Date(s.date)
    return d.getFullYear() === year && d.getMonth() + 1 === month
  })
  if (monthSessions.length === 0) return null

  const stats = {}
  monthSessions.forEach(s => {
    if (!stats[s.player_name]) stats[s.player_name] = {
      name: s.player_name, sessions: 0, profit: 0,
      wins: 0, bestSession: -Infinity, totalRebuys: 0
    }
    const p = stats[s.player_name]
    const profit = s.cash_out - s.buy_in
    p.sessions++
    p.profit += profit
    if (profit > 0) p.wins++
    if (profit > p.bestSession) p.bestSession = profit
    p.totalRebuys += (s.rebuy_count || 0)
  })

  const candidates = Object.values(stats).filter(p => p.sessions >= 2)
  if (candidates.length === 0) {
    // Falls niemand 2+ Sessions hat, nimm den Besten mit 1 Session
    const all = Object.values(stats)
    if (all.length === 0) return null
    return all.sort((a, b) => b.profit - a.profit)[0]
  }

  // Normalize & score
  const profits = candidates.map(p => p.profit)
  const maxProfit = Math.max(...profits)
  const minProfit = Math.min(...profits)
  const profitRange = maxProfit - minProfit || 1

  const scored = candidates.map(p => {
    const profitScore    = ((p.profit - minProfit) / profitRange) * 40
    const winRateScore   = (p.wins / p.sessions) * 25
    const sessionsScore  = Math.min(p.sessions / 6, 1) * 15
    const bestScore      = Math.max(0, Math.min(p.bestSession / 100, 1)) * 10
    const rebuyPenalty   = Math.min(p.totalRebuys / p.sessions, 1) * 10
    return { ...p, score: profitScore + winRateScore + sessionsScore + bestScore + (10 - rebuyPenalty) }
  })

  return scored.sort((a, b) => b.score - a.score)[0]
}

function getMonthLabel(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  return `${months[month - 1]} ${year}`
}

function getPastMonths(sessions, currentYM) {
  const monthSet = new Set(sessions.map(s => s.date.slice(0, 7)))
  monthSet.delete(currentYM)
  return [...monthSet].sort((a, b) => b.localeCompare(a))
}

// ─── Spieler des Monats Komponente ───────────────────────────────────────────
function PlayerOfMonth({ sessions, avatars }) {
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const current = calcPlayerOfMonth(sessions, currentYM)
  const pastMonths = getPastMonths(sessions, currentYM)

  if (!current && pastMonths.length === 0) return null

  return (
    <div style={{ marginBottom: '24px' }}>

      {/* ── Aktueller Spieler des Monats ── */}
      {current ? (
        <div style={{
          position: 'relative', borderRadius: '20px', overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(201,168,76,0.12) 0%, rgba(10,10,12,0.95) 60%)',
          border: '1px solid rgba(201,168,76,0.35)',
          padding: '24px 20px 20px',
          marginBottom: '12px',
        }}>
          {/* Glow hinter Avatar */}
          <div style={{
            position: 'absolute', top: '20px', left: '20px',
            width: '80px', height: '80px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(201,168,76,0.25) 0%, transparent 70%)',
            filter: 'blur(12px)',
            pointerEvents: 'none',
          }} />

          {/* Crown */}
          <div style={{
            position: 'absolute', top: '10px', left: '50px',
            fontSize: '1.1rem',
            filter: 'drop-shadow(0 0 6px rgba(201,168,76,0.8))',
            animation: 'crownFloat 3s ease-in-out infinite',
          }}>👑</div>

          {/* Header label */}
          <div style={{
            fontFamily: 'Cinzel, serif', fontSize: '0.55rem',
            color: 'rgba(201,168,76,0.6)', letterSpacing: '0.22em',
            marginBottom: '16px',
          }}>
            SPIELER DES MONATS · {getMonthLabel(currentYM).toUpperCase()}
          </div>

          {/* Main content */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Avatar mit Ring */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                position: 'absolute', inset: '-4px', borderRadius: '50%',
                background: 'conic-gradient(from 0deg, #C9A84C, #f5d885, #C9A84C, #8a6a1a, #C9A84C)',
                animation: 'ringRotate 4s linear infinite',
              }} />
              <div style={{
                position: 'relative', zIndex: 1,
                background: '#0a0a0c', borderRadius: '50%', padding: '3px',
              }}>
                <Avatar name={current.name} avatars={avatars} size={68} />
              </div>
            </div>

            {/* Name & Stats */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'Cinzel, serif', fontSize: '1.25rem',
                color: 'var(--gold)', letterSpacing: '0.05em',
                marginBottom: '8px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{current.name}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                {[
                  { label: 'PROFIT', value: (current.profit >= 0 ? '+' : '') + current.profit.toFixed(0) + '€', color: current.profit >= 0 ? '#4ade80' : '#f87171' },
                  { label: 'SESSIONS', value: current.sessions, color: '#60a5fa' },
                  { label: 'WINRATE', value: Math.round(current.wins / current.sessions * 100) + '%', color: '#a78bfa' },
                ].map(stat => (
                  <div key={stat.label} style={{
                    textAlign: 'center', padding: '7px 4px', borderRadius: '10px',
                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.95rem', color: stat.color, lineHeight: 1 }}>{stat.value}</div>
                    <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', letterSpacing: '0.15em', marginTop: '3px' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          padding: '18px', borderRadius: '16px', marginBottom: '12px',
          border: '1px dashed rgba(201,168,76,0.2)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '1.4rem', marginBottom: '6px', opacity: 0.4 }}>👑</div>
          <div style={{ fontFamily: 'Cinzel, serif', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
            NOCH KEIN SIEGER — {getMonthLabel(currentYM).toUpperCase()}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>
            Mind. 2 Sessions nötig
          </div>
        </div>
      )}

      {/* ── Vergangene Monate ── */}
      {pastMonths.length > 0 && (
        <div>
          <div style={{
            fontFamily: 'Cinzel, serif', fontSize: '0.5rem',
            color: 'rgba(255,255,255,0.2)', letterSpacing: '0.18em',
            marginBottom: '8px', paddingLeft: '2px',
          }}>VERGANGENE SIEGER</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pastMonths.map(ym => {
              const winner = calcPlayerOfMonth(sessions, ym)
              if (!winner) return null
              return (
                <div key={ym} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <Avatar name={winner.name} avatars={avatars} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.82rem', color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{winner.name}</div>
                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {getMonthLabel(ym)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontFamily: 'Cinzel, serif', fontSize: '0.78rem',
                      color: winner.profit >= 0 ? '#4ade80' : '#f87171',
                    }}>
                      {winner.profit >= 0 ? '+' : ''}{winner.profit.toFixed(0)}€
                    </div>
                    <div style={{ fontSize: '0.52rem', color: 'rgba(201,168,76,0.5)', marginTop: '1px' }}>👑</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes crownFloat {
          0%, 100% { transform: translateY(0px) rotate(-5deg); }
          50% { transform: translateY(-4px) rotate(5deg); }
        }
        @keyframes ringRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ─── Live Session ─────────────────────────────────────────────────────────────
function LiveSession({ players, avatars = {}, sessions = [], onEnd, onBack }) {
  const [session, setSession] = useState(null)
  const [view, setView] = useState('setup')
  const myId = useRef(Math.random().toString(36).slice(2))
  const sessionRef = useRef(null)
  const timerRef = useRef(null)
  const [elapsed, setElapsed] = useState(0)

  const today = new Date().toISOString().split('T')[0]
  const [sName, setSName] = useState('Poker Abend')
  const [sDate, setSDate] = useState(today)
  const [sBuyin, setSBuyin] = useState('20')
  const [sPlayers, setSPlayers] = useState([])

  const [rebuyModal, setRebuyModal] = useState(null)
  const [rebuyAmount, setRebuyAmount] = useState('')
  const [cashoutModal, setCashoutModal] = useState(null)
  const [cashoutValue, setCashoutValue] = useState('')
  const [addPlayerModal, setAddPlayerModal] = useState(false)
  const [addPlayerName, setAddPlayerName] = useState('')
  const [removeConfirm, setRemoveConfirm] = useState(null)
  const [endConfirm, setEndConfirm] = useState(false)

  useEffect(() => {
    db.from('live_session').select('data').eq('id', 'current').single()
      .then(({ data }) => {
        if (data?.data?.session) {
          const s = data.data.session
          sessionRef.current = s
          setSession(s)
          setView('live')
          startTimer(s.startedAt)
        }
      }).catch(() => {})
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function startTimer(startedAt) {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
  }

  function formatElapsed(secs) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  async function writeDb(s) {
    try {
      await db.from('live_session').upsert(
        { id: 'current', data: { session: s, writerId: myId.current }, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
    } catch (_) {}
  }

  function updateSession(updater) {
    const prev = sessionRef.current
    if (!prev) return
    const updated = typeof updater === 'function' ? updater(prev) : updater
    sessionRef.current = updated
    setSession(updated)
    setTimeout(() => writeDb(updated), 0)
  }

  useEffect(() => {
    const channel = db.channel('live_session_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_session' }, payload => {
        const d = payload.new?.data
        if (!d || d.writerId === myId.current) return
        if (d.session) {
          sessionRef.current = d.session
          setSession(d.session)
          if (view !== 'live') setView('live')
        }
      })
      .subscribe()
    return () => db.removeChannel(channel)
  }, [view])

  function startSession() {
    if (!sName || !sBuyin || sPlayers.length < 2) {
      showToast('⚠ Name, Buy-In und mind. 2 Spieler erforderlich'); return
    }
    const buyin = parseFloat(sBuyin)
    const startedAt = Date.now()
    const newSession = {
      name: sName, date: sDate, buyin, startedAt,
      players: sPlayers.map(name => ({ name, buyin, rebuys: [], cashout: null, joinedAt: startedAt }))
    }
    sessionRef.current = newSession
    setSession(newSession)
    setView('live')
    startTimer(startedAt)
    writeDb(newSession)
    showToast('♠ Session gestartet!')
  }

  function addRebuy(playerName, amount) {
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { showToast('⚠ Ungültiger Betrag'); return }
    updateSession(prev => ({
      ...prev,
      players: prev.players.map(p => p.name === playerName ? { ...p, rebuys: [...p.rebuys, amt] } : p)
    }))
    setRebuyModal(null); setRebuyAmount('')
    showToast(`↺ Rebuy für ${playerName}: ${amt}€`)
  }

  function setCashout(playerName, value) {
    const amount = parseFloat(value)
    if (isNaN(amount) || amount < 0) { showToast('⚠ Ungültiger Betrag'); return }
    updateSession(prev => ({
      ...prev,
      players: prev.players.map(p => p.name === playerName ? { ...p, cashout: amount } : p)
    }))
    setCashoutModal(null); setCashoutValue('')
    showToast(`✓ Cash-Out für ${playerName}: ${amount}€`)
  }

  function removeCashout(playerName) {
    updateSession(prev => ({
      ...prev,
      players: prev.players.map(p => p.name === playerName ? { ...p, cashout: null } : p)
    }))
  }

  function removePlayer(playerName) {
    updateSession(prev => ({ ...prev, players: prev.players.filter(p => p.name !== playerName) }))
    setRemoveConfirm(null)
    showToast(`✓ ${playerName} entfernt`)
  }

  function addPlayer() {
    if (!addPlayerName) return
    const s = sessionRef.current
    if (!s) return
    if (s.players.find(p => p.name === addPlayerName)) { showToast('⚠ Spieler bereits dabei'); return }
    updateSession(prev => ({
      ...prev,
      players: [...prev.players, { name: addPlayerName, buyin: prev.buyin, rebuys: [], cashout: null, joinedAt: Date.now(), lateJoin: true }]
    }))
    setAddPlayerModal(false); setAddPlayerName('')
    showToast(`✓ ${addPlayerName} ist dazugekommen`)
  }

  async function endSession() {
    const s = sessionRef.current
    if (!s) return
    const missing = s.players.filter(p => p.cashout === null).map(p => p.name)
    if (missing.length > 0) { showToast(`⚠ Cash-Out fehlt: ${missing.join(', ')}`); return }
    const durationSeconds = Math.floor((Date.now() - s.startedAt) / 1000)
    const inserts = s.players.map(p => {
      const totalBuyin = p.buyin + p.rebuys.reduce((a, r) => a + r, 0)
      return {
        date: s.date, player_name: p.name, buy_in: totalBuyin,
        cash_out: p.cashout, rebuys: p.rebuys.reduce((a, r) => a + r, 0),
        rebuy_count: p.rebuys.length, session_name: s.name, session_duration: durationSeconds,
      }
    })
    const { error } = await db.from('poker_sessions').insert(inserts)
    if (error) { showToast('Fehler: ' + error.message); return }
    await db.from('live_session').delete().eq('id', 'current')
    if (timerRef.current) clearInterval(timerRef.current)
    showToast('✓ Session gespeichert!')
    onEnd()
  }

  if (view === 'setup') return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
        <button onClick={onBack} className="btn-ghost" style={{ padding:'8px 14px', fontSize:'0.75rem' }}>← Zurück</button>
        <div className="font-display" style={{ fontSize:'0.9rem', color:'var(--gold)' }}>LIVE SESSION</div>
      </div>
      <div className="card" style={{ marginBottom:'16px' }}>
        <div style={{ marginBottom:'14px' }}>
          <label className="section-label">Session Name</label>
          <input className="input-field" value={sName} onChange={e => setSName(e.target.value)} placeholder="Poker Abend" />
        </div>
        <div style={{ marginBottom:'14px' }}>
          <label className="section-label">Datum</label>
          <input className="input-field" type="date" value={sDate} onChange={e => setSDate(e.target.value)}
            style={{ width:'100%', colorScheme:'dark', boxSizing:'border-box' }} />
        </div>
        <div style={{ marginBottom:'14px' }}>
          <label className="section-label">Buy-In (€) — gilt für alle</label>
          <input className="input-field" type="number" value={sBuyin} onChange={e => setSBuyin(e.target.value)}
            placeholder="20" min="0" step="0.5" />
        </div>
      </div>
      <div className="card" style={{ marginBottom:'16px' }}>
        <div className="font-display" style={{ fontSize:'0.72rem', color:'var(--gold)', marginBottom:'12px' }}>
          SPIELER AUSWÄHLEN ({sPlayers.length})
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px' }}>
          {players.map(name => {
            const sel = sPlayers.includes(name)
            return (
              <button key={name} onClick={() => setSPlayers(prev => sel ? prev.filter(p => p !== name) : [...prev, name])}
                style={{ display:'flex', alignItems:'center', gap:'7px', padding:'7px 14px', borderRadius:'20px', cursor:'pointer', fontSize:'0.85rem',
                  border:`1px solid ${sel ? 'rgba(201,168,76,0.6)' : 'rgba(255,255,255,0.1)'}`,
                  background: sel ? 'rgba(201,168,76,0.15)' : 'transparent',
                  color: sel ? 'var(--gold)' : 'var(--text-muted)' }}>
                <Avatar name={name} avatars={avatars} size={22} />
                {sel ? '✓ ' : ''}{name}
              </button>
            )
          })}
        </div>
      </div>
      <button className="btn-gold" style={{ width:'100%', fontSize:'1rem', padding:'16px' }} onClick={startSession}>
        ▶ SESSION STARTEN
      </button>
    </div>
  )

  if (!session) return null
  const totalPot = session.players.reduce((s, p) => s + p.buyin + p.rebuys.reduce((a,r) => a+r, 0), 0)
  const allCashedOut = session.players.every(p => p.cashout !== null)
  const cashoutSum = session.players.reduce((s, p) => s + (p.cashout || 0), 0)
  const diff = cashoutSum - totalPot
  const yearBadges = calcYearBadges(sessions)

  return (
    <div>
      <div style={{ marginBottom:'12px', padding:'12px 14px', borderRadius:'12px', background:'rgba(0,0,0,0.2)', border:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
          <div>
            <div className="font-display" style={{ fontSize:'0.8rem', color:'var(--gold)' }}>{session.name}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'2px' }}>{session.date}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:'Cinzel,serif', fontSize:'1.4rem', color:'#4ade80', letterSpacing:'0.05em' }}>
              ⏱ {formatElapsed(elapsed)}
            </div>
            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>LAUFZEIT</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div className="font-display" style={{ fontSize:'1rem', color:'var(--gold)' }}>{totalPot}€</div>
            <div style={{ fontSize:'0.6rem', color:'var(--text-muted)' }}>GESAMTPOT</div>
          </div>
        </div>
        <button onClick={() => setAddPlayerModal(true)}
          style={{ width:'100%', padding:'8px', borderRadius:'8px', border:'1px solid rgba(96,165,250,0.35)', background:'rgba(96,165,250,0.08)', color:'#60a5fa', fontFamily:'Cinzel,serif', fontSize:'0.7rem', letterSpacing:'0.08em', cursor:'pointer' }}>
          + SPIELER HINZUFÜGEN
        </button>
      </div>

      {session.players.map(p => {
        const totalBuyin = p.buyin + p.rebuys.reduce((a,r) => a+r, 0)
        const profit = p.cashout !== null ? p.cashout - totalBuyin : null
        const hasCashout = p.cashout !== null
        return (
          <div key={p.name} className="card" style={{ marginBottom:'10px', padding:'14px 16px',
            border:`1px solid ${hasCashout ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.07)'}`,
            background: hasCashout ? 'rgba(74,222,128,0.04)' : undefined }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <Avatar name={p.name} avatars={avatars} size={38} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <span style={{ fontWeight:600, fontSize:'0.95rem' }}>{p.name}</span>
                  {(yearBadges[p.name] || []).map((b, i) => (
                    <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', lineHeight:1, gap:'2px' }}>
                      <span style={{ fontSize:'0.75rem' }}>{b.emoji}</span>
                      <span style={{ fontSize:'0.55rem', color:'var(--text-muted)', fontFamily:'Cinzel,serif', fontWeight:600 }}>{b.year}</span>
                    </div>
                  ))}
                  {p.lateJoin && <span style={{ fontSize:'0.6rem', color:'#60a5fa', background:'rgba(96,165,250,0.12)', border:'1px solid rgba(96,165,250,0.3)', borderRadius:'4px', padding:'1px 6px' }}>LATE</span>}
                </div>
                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'2px' }}>
                  Buy-In: {totalBuyin}€
                  {p.rebuys.length > 0 && <span style={{ color:'#f472b6', marginLeft:'6px' }}>{p.rebuys.length}× Rebuy</span>}
                </div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'6px' }}>
                {hasCashout ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                    <div style={{ textAlign:'right' }}>
                      <div className="font-display" style={{ fontSize:'0.9rem', color:'#4ade80' }}>{p.cashout}€</div>
                      <div style={{ fontSize:'0.7rem', color: profit > 0 ? '#4ade80' : profit < 0 ? '#f87171' : 'var(--text-muted)' }}>
                        {profit > 0 ? '+' : ''}{profit}€
                      </div>
                    </div>
                    <button onClick={() => removeCashout(p.name)}
                      style={{ width:'24px', height:'24px', borderRadius:'50%', border:'1px solid rgba(255,255,255,0.15)', background:'rgba(255,255,255,0.05)', color:'var(--text-muted)', fontSize:'0.75rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => { setCashoutModal(p.name); setCashoutValue('') }}
                    style={{ padding:'7px 14px', borderRadius:'8px', border:'1px solid rgba(74,222,128,0.4)', background:'rgba(74,222,128,0.1)', color:'#4ade80', fontFamily:'Cinzel,serif', fontSize:'0.7rem', cursor:'pointer' }}>
                    Cash-Out
                  </button>
                )}
                <button onClick={() => setRebuyModal(p.name)}
                  style={{ padding:'5px 12px', borderRadius:'7px', border:'1px solid rgba(244,114,182,0.35)', background:'rgba(244,114,182,0.08)', color:'#f472b6', fontFamily:'Cinzel,serif', fontSize:'0.65rem', cursor:'pointer' }}>
                  + Rebuy
                </button>
                {!hasCashout && (
                  <button onClick={() => setRemoveConfirm(p.name)}
                    style={{ padding:'5px 8px', borderRadius:'7px', border:'1px solid rgba(248,113,113,0.3)', background:'rgba(248,113,113,0.06)', color:'#f87171', fontFamily:'Cinzel,serif', fontSize:'0.65rem', cursor:'pointer' }}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      {allCashedOut && (
        <div style={{ marginBottom:'12px', padding:'12px 16px', borderRadius:'10px',
          background: Math.abs(diff) < 0.01 ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
          border: `1px solid ${Math.abs(diff) < 0.01 ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem' }}>
            <span style={{ color:'var(--text-muted)' }}>Pot: {totalPot}€ · Cash-Outs: {cashoutSum}€</span>
            <span style={{ color: Math.abs(diff) < 0.01 ? '#4ade80' : '#f87171', fontFamily:'Cinzel,serif' }}>
              {Math.abs(diff) < 0.01 ? '✓ Ausgeglichen' : `Differenz: ${diff > 0 ? '+' : ''}${diff.toFixed(2)}€`}
            </span>
          </div>
        </div>
      )}

      <div style={{ marginBottom:'12px' }}>
        <button onClick={() => setEndConfirm(true)}
          style={{ width:'100%', padding:'14px', borderRadius:'10px', border:'1px solid rgba(201,168,76,0.4)', background:'rgba(201,168,76,0.12)', color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'0.8rem', cursor:'pointer', letterSpacing:'0.08em' }}>
          ✓ SESSION BEENDEN
        </button>
      </div>

      {rebuyModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'20px' }}
          onClick={() => { setRebuyModal(null); setRebuyAmount('') }}>
          <div className="card" style={{ maxWidth:'320px', width:'100%', padding:'24px', textAlign:'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'2rem', marginBottom:'8px' }}>↺</div>
            <div className="font-display" style={{ fontSize:'0.85rem', color:'#f472b6', marginBottom:'4px' }}>REBUY</div>
            <div style={{ fontSize:'1rem', marginBottom:'16px' }}>{rebuyModal}</div>
            <label className="section-label">Betrag (€)</label>
            <input className="input-field" type="number" value={rebuyAmount}
              onChange={e => setRebuyAmount(e.target.value)} onFocus={e => e.target.select()}
              placeholder={String(session?.buyin || 20)} min="0" step="0.5" autoFocus
              style={{ fontSize:'1.4rem', textAlign:'center', marginBottom:'16px' }} />
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => { setRebuyModal(null); setRebuyAmount('') }}>Abbrechen</button>
              <button onClick={() => addRebuy(rebuyModal, rebuyAmount || session?.buyin)}
                style={{ flex:1, padding:'13px', borderRadius:'10px', border:'1px solid rgba(244,114,182,0.4)', background:'rgba(244,114,182,0.12)', color:'#f472b6', fontFamily:'Cinzel,serif', fontSize:'0.75rem', cursor:'pointer' }}>
                ✓ Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}

      {cashoutModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'20px' }}
          onClick={() => setCashoutModal(null)}>
          <div className="card" style={{ maxWidth:'320px', width:'100%', padding:'24px' }} onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize:'0.85rem', color:'#4ade80', marginBottom:'6px' }}>💰 CASH-OUT</div>
            <div style={{ fontSize:'1rem', marginBottom:'16px' }}>{cashoutModal}</div>
            <label className="section-label">Betrag (€)</label>
            <input className="input-field" type="number" value={cashoutValue}
              onChange={e => setCashoutValue(e.target.value)} onFocus={e => e.target.select()}
              placeholder="0" min="0" step="0.5" autoFocus
              style={{ fontSize:'1.4rem', textAlign:'center', marginBottom:'16px' }} />
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setCashoutModal(null)}>Abbrechen</button>
              <button onClick={() => setCashout(cashoutModal, cashoutValue)}
                style={{ flex:1, padding:'13px', borderRadius:'10px', border:'1px solid rgba(74,222,128,0.4)', background:'rgba(74,222,128,0.12)', color:'#4ade80', fontFamily:'Cinzel,serif', fontSize:'0.75rem', cursor:'pointer' }}>
                ✓ Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}

      {addPlayerModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'20px' }}
          onClick={() => setAddPlayerModal(false)}>
          <div className="card" style={{ maxWidth:'320px', width:'100%', padding:'24px' }} onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize:'0.85rem', color:'#60a5fa', marginBottom:'16px' }}>+ SPIELER HINZUFÜGEN</div>
            <label className="section-label">Spieler</label>
            <select className="input-field" value={addPlayerName} onChange={e => setAddPlayerName(e.target.value)} style={{ marginBottom:'10px' }}>
              <option value="">— Spieler auswählen —</option>
              {players.filter(p => !session.players.find(sp => sp.name === p)).map(p =>
                <option key={p} value={p}>{p}</option>
              )}
            </select>
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'16px' }}>Buy-In: {session.buyin}€</div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setAddPlayerModal(false)}>Abbrechen</button>
              <button onClick={addPlayer}
                style={{ flex:1, padding:'13px', borderRadius:'10px', border:'1px solid rgba(96,165,250,0.4)', background:'rgba(96,165,250,0.12)', color:'#60a5fa', fontFamily:'Cinzel,serif', fontSize:'0.75rem', cursor:'pointer' }}>
                ✓ Hinzufügen
              </button>
            </div>
          </div>
        </div>
      )}

      {removeConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'20px' }}
          onClick={() => setRemoveConfirm(null)}>
          <div className="card" style={{ maxWidth:'320px', width:'100%', padding:'24px', textAlign:'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'2rem', marginBottom:'8px' }}>✕</div>
            <div className="font-display" style={{ fontSize:'0.85rem', color:'#f87171', marginBottom:'8px' }}>SPIELER ENTFERNEN?</div>
            <div style={{ fontSize:'1rem', marginBottom:'20px' }}>{removeConfirm}</div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setRemoveConfirm(null)}>Abbrechen</button>
              <button onClick={() => removePlayer(removeConfirm)}
                style={{ flex:1, padding:'13px', borderRadius:'10px', border:'1px solid rgba(248,113,113,0.4)', background:'rgba(248,113,113,0.1)', color:'#f87171', fontFamily:'Cinzel,serif', fontSize:'0.75rem', cursor:'pointer' }}>
                ✓ Entfernen
              </button>
            </div>
          </div>
        </div>
      )}

      {endConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'20px' }}
          onClick={() => setEndConfirm(false)}>
          <div className="card" style={{ maxWidth:'320px', width:'100%', padding:'24px', textAlign:'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'2rem', marginBottom:'8px' }}>♠</div>
            <div className="font-display" style={{ fontSize:'0.85rem', color:'var(--gold)', marginBottom:'8px' }}>SESSION BEENDEN?</div>
            {session.players.filter(p => p.cashout === null).length > 0 && (
              <div style={{ fontSize:'0.8rem', color:'#f87171', marginBottom:'12px' }}>
                ⚠ Cash-Out fehlt: {session.players.filter(p => p.cashout === null).map(p => p.name).join(', ')}
              </div>
            )}
            <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'24px' }}>
              {session.players.length} Spieler · {totalPot}€ Pot
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setEndConfirm(false)}>Abbrechen</button>
              <button onClick={() => { setEndConfirm(false); endSession() }}
                style={{ flex:1, padding:'13px', borderRadius:'10px', border:'1px solid rgba(201,168,76,0.4)', background:'rgba(201,168,76,0.12)', color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'0.75rem', cursor:'pointer' }}>
                ✓ Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Manual Entry ─────────────────────────────────────────────────────────────
function ManualEntry({ players, onSessionAdded }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [player, setPlayer] = useState('')
  const [buyin, setBuyin] = useState('')
  const [cashout, setCashout] = useState('')
  const [rebuys, setRebuys] = useState([])
  const [showRebuyDialog, setShowRebuyDialog] = useState(false)
  const [rebuyAmounts, setRebuyAmounts] = useState(['20', '0'])
  const [loading, setLoading] = useState(false)

  const totalBuyin = parseFloat(buyin || 0) + rebuys.reduce((s, r) => s + r, 0)
  const profit = parseFloat(cashout || 0) - totalBuyin
  const showPreview = buyin !== '' && cashout !== ''

  function openRebuyDialog() { setRebuyAmounts(['20', '0']); setShowRebuyDialog(true) }
  function confirmRebuy() {
    const newRebuys = rebuyAmounts.map(r => parseFloat(r)).filter(r => !isNaN(r) && r > 0)
    if (newRebuys.length > 0) setRebuys(prev => [...prev, ...newRebuys])
    setShowRebuyDialog(false)
  }
  function removeRebuy(i) { setRebuys(rebuys.filter((_, idx) => idx !== i)) }

  async function handleSubmit() {
    if (!date || !player || buyin === '' || cashout === '') {
      showToast('⚠ Bitte alle Felder ausfüllen'); return
    }
    setLoading(true)
    const rebuyTotal = rebuys.reduce((s, r) => s + r, 0)
    const { error } = await db.from('poker_sessions').insert([{
      date, player_name: player, buy_in: totalBuyin,
      cash_out: parseFloat(cashout), rebuys: rebuyTotal, rebuy_count: rebuys.length,
    }])
    setLoading(false)
    if (error) { showToast('Fehler: ' + error.message); return }
    showToast('✓ Eintrag gespeichert!')
    setPlayer(''); setBuyin(''); setCashout(''); setRebuys([])
    onSessionAdded()
  }

  return (
    <div>
      <div className="font-display" style={{ fontSize:'0.72rem', color:'var(--text-muted)', letterSpacing:'0.12em', marginBottom:'12px' }}>
        MANUELLER EINTRAG
      </div>
      <div className="card" style={{ marginBottom:'16px' }}>
        <div style={{ marginBottom:'14px' }}>
          <label className="section-label">Datum</label>
          <input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ width:'100%', colorScheme:'dark', boxSizing:'border-box' }} />
        </div>
        <div style={{ marginBottom:'14px' }}>
          <label className="section-label">Spieler</label>
          <select className="input-field" value={player} onChange={e => setPlayer(e.target.value)}>
            <option value="">— Spieler auswählen —</option>
            {players.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:'14px' }}>
          <label className="section-label">Buy-In (€)</label>
          <input className="input-field" type="number" placeholder="0.00" step="0.01" min="0"
            value={buyin} onChange={e => setBuyin(e.target.value)} />
        </div>
        {rebuys.length > 0 && (
          <div style={{ marginBottom:'12px' }}>
            <label className="section-label">Rebuys ({rebuys.length}×)</label>
            <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
              {rebuys.map((r, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', background:'rgba(244,114,182,0.08)', border:'1px solid rgba(244,114,182,0.3)', borderRadius:'20px', padding:'4px 10px 4px 12px' }}>
                  <span style={{ fontFamily:'Cinzel,serif', fontSize:'0.8rem', color:'#f472b6' }}>{r.toFixed(2)}€</span>
                  <button onClick={() => removeRebuy(i)} style={{ background:'none', border:'none', color:'rgba(244,114,182,0.6)', cursor:'pointer', fontSize:'0.85rem', padding:0 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button onClick={openRebuyDialog} className="btn-ghost" style={{ width:'100%', marginBottom:'14px', fontSize:'0.7rem', borderColor:'rgba(244,114,182,0.3)', color:'#f472b6' }}>
          + REBUY HINZUFÜGEN
        </button>
        <div style={{ marginBottom:'16px' }}>
          <label className="section-label">Cash-Out (€)</label>
          <input className="input-field" type="number" placeholder="0.00" step="0.01" min="0"
            value={cashout} onChange={e => setCashout(e.target.value)} />
        </div>
        {showPreview && (
          <div style={{ background:'rgba(0,0,0,0.2)', borderRadius:'10px', padding:'14px 16px', marginBottom:'16px', display:'flex', justifyContent:'space-between', alignItems:'center', border:'1px solid rgba(201,168,76,0.1)' }}>
            <div>
              <div className="section-label" style={{ marginBottom:'2px' }}>Total Buy-In</div>
              <div style={{ color:'var(--text-primary)' }}>{totalBuyin.toFixed(2)} €</div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div className="section-label" style={{ marginBottom:'2px' }}>Profit / Verlust</div>
              <div className={`font-display ${profit > 0 ? 'profit-pos' : profit < 0 ? 'profit-neg' : 'profit-neu'}`}
                style={{ fontSize:'1.1rem' }}>{formatEuroSign(profit)}</div>
            </div>
          </div>
        )}
        <button className="btn-gold" style={{ width:'100%' }} onClick={handleSubmit} disabled={loading}>
          {loading ? '…' : '♠ Eintrag speichern'}
        </button>
      </div>
      {showRebuyDialog && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500, padding:'20px' }}
          onClick={() => setShowRebuyDialog(false)}>
          <div className="card" style={{ maxWidth:'320px', width:'100%', padding:'24px' }} onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize:'0.9rem', color:'#f472b6', marginBottom:'16px' }}>🔄 REBUY HINZUFÜGEN</div>
            {rebuyAmounts.map((amt, i) => (
              <div key={i} style={{ marginBottom:'10px' }}>
                <label className="section-label">Rebuy {rebuys.length + i + 1} (€)</label>
                <input className="input-field" type="text" inputMode="decimal" placeholder="0" value={amt}
                  onChange={e => setRebuyAmounts(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  onFocus={e => e.target.select()} autoFocus={i === 0} style={{ textAlign:'center', fontSize:'1.1rem' }} />
              </div>
            ))}
            <button className="btn-ghost" style={{ width:'100%', marginBottom:'12px', fontSize:'0.68rem' }}
              onClick={() => setRebuyAmounts(prev => [...prev, ''])}>+ Noch einen</button>
            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn-ghost" style={{ flex:1 }} onClick={() => setShowRebuyDialog(false)}>Abbrechen</button>
              <button className="btn-gold" style={{ flex:1, borderColor:'rgba(244,114,182,0.5)', background:'rgba(244,114,182,0.15)', color:'#f472b6' }} onClick={confirmRebuy}>✓</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Eintrag ─────────────────────────────────────────────────────────────
export default function Eintrag({ players, avatars = {}, sessions = [], onSessionAdded }) {
  const [mode, setMode] = useState('home')
  const [hasLive, setHasLive] = useState(false)

  useEffect(() => {
    db.from('live_session').select('id').eq('id', 'current').single()
      .then(({ data }) => { if (data) setHasLive(true) })
      .catch(() => {})
  }, [])

  if (mode === 'live') return (
    <div style={{ padding:'20px 16px 100px' }}>
      <LiveSession
        players={players} avatars={avatars} sessions={sessions}
        onEnd={() => { setHasLive(false); setMode('home'); onSessionAdded() }}
        onBack={() => setMode('home')}
      />
    </div>
  )

  if (mode === 'manual') return (
    <div style={{ padding:'20px 16px 100px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
        <button onClick={() => setMode('home')} className="btn-ghost" style={{ padding:'8px 14px', fontSize:'0.75rem' }}>← Zurück</button>
        <div className="font-display" style={{ fontSize:'0.9rem', color:'var(--gold)' }}>MANUELLER EINTRAG</div>
      </div>
      <ManualEntry players={players} onSessionAdded={() => { onSessionAdded(); setMode('home') }} />
    </div>
  )

  return (
    <div style={{ padding:'20px 16px 100px' }}>
      <div style={{ textAlign:'center', marginBottom:'28px', paddingTop:'12px' }}>
        <div className="font-display" style={{ fontSize:'1.3rem', color:'var(--gold)', letterSpacing:'0.15em' }}>♠ EINTRAG</div>
      </div>

      {/* Live session banner */}
      {hasLive && (
        <div style={{ marginBottom:'16px', padding:'14px 16px', borderRadius:'12px', background:'rgba(74,222,128,0.08)', border:'1px solid rgba(74,222,128,0.3)', display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ fontSize:'1.2rem' }}>🟢</div>
          <div style={{ flex:1 }}>
            <div className="font-display" style={{ fontSize:'0.75rem', color:'#4ade80' }}>SESSION LÄUFT</div>
            <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'2px' }}>Tippe auf Fortsetzen um weiterzumachen</div>
          </div>
          <button onClick={() => setMode('live')} style={{ padding:'9px 16px', borderRadius:'8px', border:'1px solid rgba(74,222,128,0.5)', background:'rgba(74,222,128,0.15)', color:'#4ade80', fontFamily:'Cinzel,serif', fontSize:'0.7rem', cursor:'pointer' }}>
            ▶ FORTSETZEN
          </button>
        </div>
      )}

      {/* Main buttons */}
      <button onClick={() => setMode('live')}
        style={{ width:'100%', padding:'24px', borderRadius:'16px', border:'2px solid rgba(201,168,76,0.4)', background:'rgba(201,168,76,0.08)', color:'var(--gold)', fontFamily:'Cinzel,serif', fontSize:'1.1rem', letterSpacing:'0.12em', cursor:'pointer', marginBottom:'12px', display:'flex', alignItems:'center', justifyContent:'center', gap:'12px' }}>
        ▶ LIVE SESSION STARTEN
      </button>

      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px', marginTop:'4px' }}>
        <div style={{ flex:1, height:'1px', background:'rgba(255,255,255,0.07)' }} />
        <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontFamily:'Cinzel,serif', letterSpacing:'0.1em' }}>ODER</div>
        <div style={{ flex:1, height:'1px', background:'rgba(255,255,255,0.07)' }} />
      </div>

      <button onClick={() => setMode('manual')} className="btn-ghost" style={{ width:'100%', fontSize:'0.8rem', marginBottom:'28px' }}>
        ✏️ Manuell eintragen
      </button>

      {/* Trennlinie vor Spieler des Monats */}
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px' }}>
        <div style={{ flex:1, height:'1px', background:'rgba(201,168,76,0.15)' }} />
        <div style={{ fontSize:'0.5rem', color:'rgba(201,168,76,0.4)', fontFamily:'Cinzel,serif', letterSpacing:'0.2em' }}>HALL OF FAME</div>
        <div style={{ flex:1, height:'1px', background:'rgba(201,168,76,0.15)' }} />
      </div>

      {/* Spieler des Monats */}
      <PlayerOfMonth sessions={sessions} avatars={avatars} />
    </div>
  )
}
