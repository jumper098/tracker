import { useState, useEffect } from 'react'
import { db } from './lib/supabase'
import { Toast, showToast } from './components/Toast'
import PasswordGate from './components/PasswordGate'
import TabBar from './components/TabBar'
import Eintrag from './pages/Eintrag'
import Sessions from './pages/Sessions'
import Rangliste from './pages/Rangliste'
import Grafik from './pages/Grafik'
import Awards from './pages/Awards'
import Turnier from './pages/Turnier'

const DEFAULT_PLAYERS = ['Alex','Ben','Chris','Daniel','Eva','Felix','Gabi','Hans']

export default function App() {
  const [tab, setTab] = useState('eintrag')
  const [sessions, setSessions] = useState([])
  const [tournaments, setTournaments] = useState([])
  const [players, setPlayers] = useState(() => {
    const stored = localStorage.getItem('poker_players')
    return stored ? JSON.parse(stored) : DEFAULT_PLAYERS
  })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('connecting')

  useEffect(() => {
    loadAll()
    // Realtime subscription
    const channel = db.channel('poker_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_sessions' }, loadSessions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poker_tournaments' }, loadTournaments)
      .subscribe()
    return () => db.removeChannel(channel)
  }, [])

  async function loadAll() {
    setLoading(true)
    await Promise.all([loadSessions(), loadTournaments()])
    setLoading(false)
    setStatus('connected')
  }

  async function loadSessions() {
    const { data, error } = await db
      .from('poker_sessions')
      .select('*')
      .order('date', { ascending: false })
    if (error) { setStatus('error'); return }
    setSessions(data || [])
    // Auto-update player list from db
    if (data) {
      const dbPlayers = [...new Set(data.map(s => s.player_name))]
      setPlayers(prev => {
        const merged = [...new Set([...prev, ...dbPlayers])].sort()
        localStorage.setItem('poker_players', JSON.stringify(merged))
        return merged
      })
    }
  }

  async function loadTournaments() {
    const { data, error } = await db
      .from('poker_tournaments')
      .select('*')
      .order('date', { ascending: false })
    if (!error) setTournaments(data || [])
  }

  function addPlayer(name) {
    const trimmed = name.trim()
    if (!trimmed || players.includes(trimmed)) return
    const updated = [...players, trimmed].sort()
    setPlayers(updated)
    localStorage.setItem('poker_players', JSON.stringify(updated))
    showToast(`✓ ${trimmed} hinzugefügt`)
  }

  function removePlayer(name) {
    const updated = players.filter(p => p !== name)
    setPlayers(updated)
    localStorage.setItem('poker_players', JSON.stringify(updated))
  }

  const pages = { eintrag: Eintrag, sessions: Sessions, rangliste: Rangliste, grafik: Grafik, awards: Awards, turnier: Turnier }
  const PageComponent = pages[tab]

  return (
    <PasswordGate>
      {/* Status indicator */}
      <div style={{
        position: 'fixed', top: '12px', right: '12px', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(20,20,22,0.9)', border: '1px solid rgba(201,168,76,0.15)',
        borderRadius: '20px', padding: '4px 10px',
        fontFamily: 'Cinzel, serif', fontSize: '0.6rem', letterSpacing: '0.1em',
      }}>
        <div style={{
          width: '7px', height: '7px', borderRadius: '50%',
          background: status === 'connected' ? '#4ade80' : status === 'error' ? '#f87171' : '#C9A84C',
          animation: status === 'connecting' ? 'pulse 1s infinite' : 'none',
        }} />
        <span style={{ color: 'var(--text-muted)' }}>
          {status === 'connected' ? 'LIVE' : status === 'error' ? 'OFFLINE' : '…'}
        </span>
      </div>

      {/* Player management button */}
      <PlayerManager players={players} onAdd={addPlayer} onRemove={removePlayer} sessions={sessions} />

      {/* Main content */}
      <div style={{ minHeight: '100vh' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '2rem', animation: 'spin 1s linear infinite' }}>♠</div>
            <div className="font-display" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.2em' }}>LADEN…</div>
          </div>
        ) : (
          <PageComponent
            sessions={sessions}
            tournaments={tournaments}
            players={players}
            onSessionAdded={loadSessions}
            onRefresh={loadAll}
          />
        )}
      </div>

      <TabBar active={tab} onChange={setTab} />
      <Toast />

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </PasswordGate>
  )
}

// ─── Player Manager Modal ────────────────────────────────────────────────────
function PlayerManager({ players, onAdd, onRemove, sessions }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const usedPlayers = new Set(sessions.map(s => s.player_name))

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', top: '12px', left: '12px', zIndex: 200,
          background: 'rgba(20,20,22,0.9)', border: '1px solid rgba(201,168,76,0.15)',
          borderRadius: '20px', padding: '4px 10px',
          fontFamily: 'Cinzel, serif', fontSize: '0.6rem',
          color: 'var(--text-muted)', letterSpacing: '0.1em', cursor: 'pointer',
        }}
      >
        👥 SPIELER
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, padding: '20px',
        }} onClick={() => setOpen(false)}>
          <div className="card" style={{ maxWidth: '360px', width: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize: '0.85rem', color: 'var(--gold)', marginBottom: '16px', letterSpacing: '0.1em' }}>
              👥 SPIELER VERWALTEN
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input className="input-field" placeholder="Neuer Spieler..." value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { onAdd(newName); setNewName('') } }}
              />
              <button className="btn-gold" style={{ padding: '10px 16px', flexShrink: 0 }}
                onClick={() => { onAdd(newName); setNewName('') }}>+</button>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {players.map(p => (
                <div key={p} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: '0.95rem' }}>{p}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {usedPlayers.has(p) && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {sessions.filter(s => s.player_name === p).length}× gespielt
                      </span>
                    )}
                    {!usedPlayers.has(p) && (
                      <button className="btn-danger" onClick={() => onRemove(p)}>✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button className="btn-ghost" style={{ width: '100%', marginTop: '16px' }} onClick={() => setOpen(false)}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </>
  )
}
