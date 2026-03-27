import Avatar from './components/Avatar'
import { useState, useEffect } from 'react'
import { db } from './lib/supabase'
import { useAvatars } from './hooks/useAvatars'
import { Toast, showToast } from './components/Toast'
import TabBar from './components/TabBar'
import Eintrag from './pages/Eintrag'
import Sessions from './pages/Sessions'
import Rangliste from './pages/Rangliste'
import Grafik from './pages/Grafik'
import Awards from './pages/Awards'
import Turnier from './pages/Turnier'

const DEFAULT_PLAYERS = []

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
  const { avatars, uploadAvatar, deleteAvatar } = useAvatars()

  useEffect(() => {
    loadAll()
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
    const { data, error } = await db.from('poker_sessions').select('*').order('date', { ascending: false })
    if (error) { setStatus('error'); return }
    setSessions(data || [])
    if (data) {
      // Only add players from DB that have actual sessions
      const dbPlayers = [...new Set(data.map(s => s.player_name))]
      setPlayers(prev => {
        // If localStorage was manually set (not default), only add DB players that are new
        const stored = localStorage.getItem('poker_players')
        const base = stored ? JSON.parse(stored) : []
        // Merge: keep manually added + all from DB
        const merged = [...new Set([...base, ...dbPlayers])].sort()
        localStorage.setItem('poker_players', JSON.stringify(merged))
        return merged
      })
    }
  }

  async function loadTournaments() {
    const { data, error } = await db.from('poker_tournaments').select('*').order('date', { ascending: false })
    if (!error) setTournaments(data || [])
  }

  function addPlayer(name) {
    const trimmed = name.trim()
    if (!trimmed || players.includes(trimmed)) return
    const updated = [...players, trimmed].sort()
    setPlayers(updated)
    localStorage.setItem('poker_players', JSON.stringify(updated))
    showToast('✓ ' + trimmed + ' hinzugefügt')
  }

  function removePlayer(name) {
    const updated = players.filter(p => p !== name)
    setPlayers(updated)
    localStorage.setItem('poker_players', JSON.stringify(updated))
  }

  async function renamePlayer(oldName, newName) {
    const { error } = await db.from('poker_sessions').update({ player_name: newName }).eq('player_name', oldName)
    if (error) { showToast('Fehler: ' + error.message); return }
    const updated = players.map(p => p === oldName ? newName : p).sort()
    setPlayers(updated)
    localStorage.setItem('poker_players', JSON.stringify(updated))
    await loadSessions()
    showToast('✓ ' + oldName + ' → ' + newName)
  }

  const pages = { eintrag: Eintrag, sessions: Sessions, rangliste: Rangliste, grafik: Grafik, awards: Awards, turnier: Turnier }
  const PageComponent = pages[tab]

  return (
    <div>
      {/* Status indicator */}
      <div style={{
        position: 'fixed', top: '10px', right: '10px', zIndex: 200,
        display: 'flex', alignItems: 'center', gap: '6px',
        background: 'rgba(20,20,22,0.95)', border: '1px solid rgba(201,168,76,0.2)',
        borderRadius: '20px', padding: '7px 12px',
        fontFamily: 'Cinzel, serif', fontSize: '0.65rem', letterSpacing: '0.1em',
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

      <PlayerManager
        players={players}
        onAdd={addPlayer}
        onRemove={removePlayer}
        onRename={renamePlayer}
        sessions={sessions}
        avatars={avatars}
        onUploadAvatar={uploadAvatar}
        onDeleteAvatar={deleteAvatar}
      />

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
            avatars={avatars}
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
    </div>
  )
}

// ─── Player Manager Modal ────────────────────────────────────────────────────
function PlayerManager({ players, onAdd, onRemove, onRename, sessions, avatars, onUploadAvatar, onDeleteAvatar }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingPlayer, setRenamingPlayer] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  const usedPlayers = new Set(sessions.map(s => s.player_name))

  function startRename(name) { setRenamingPlayer(name); setRenameValue(name) }

  async function confirmRename() {
    if (!renameValue.trim() || renameValue.trim() === renamingPlayer) { setRenamingPlayer(null); return }
    setRenameLoading(true)
    await onRename(renamingPlayer, renameValue.trim())
    setRenameLoading(false)
    setRenamingPlayer(null)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', top: '10px', left: '10px', zIndex: 200,
        background: 'rgba(20,20,22,0.95)', border: '1px solid rgba(201,168,76,0.3)',
        borderRadius: '20px', padding: '7px 14px',
        fontFamily: 'Cinzel, serif', fontSize: '0.7rem',
        color: 'var(--gold)', letterSpacing: '0.1em', cursor: 'pointer',
      }}>
        👥 SPIELER
      </button>

      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, padding: '20px',
        }} onClick={() => { setOpen(false); setRenamingPlayer(null) }}>
          <div className="card" style={{ maxWidth: '380px', width: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize: '0.9rem', color: 'var(--gold)', marginBottom: '16px', letterSpacing: '0.1em' }}>
              👥 SPIELER VERWALTEN
            </div>

            {/* Neuer Spieler */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <input className="input-field" placeholder="Neuer Spieler..." value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { onAdd(newName); setNewName('') } }}
              />
              <button className="btn-gold" style={{ padding: '10px 18px', flexShrink: 0 }}
                onClick={() => { onAdd(newName); setNewName('') }}>+</button>
            </div>

            {/* Spielerliste */}
            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              {players.map(p => (
                <div key={p} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  {renamingPlayer === p ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input className="input-field" value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmRename() }}
                        autoFocus style={{ flex: 1 }} />
                      <button className="btn-gold" style={{ padding: '8px 12px', flexShrink: 0, fontSize: '0.75rem' }}
                        onClick={confirmRename} disabled={renameLoading}>
                        {renameLoading ? '…' : '✓'}
                      </button>
                      <button className="btn-ghost" style={{ padding: '8px 10px', flexShrink: 0 }}
                        onClick={() => setRenamingPlayer(null)}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Avatar */}
                      <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative' }}>
                          <Avatar name={p} src={avatars[p]} size={40} />
                        <input type="file" accept="image/*" style={{ display: 'none' }}
                          onChange={e => { if (e.target.files[0]) onUploadAvatar(p, e.target.files[0]) }} />
                        <div style={{
                          position: 'absolute', bottom: '-2px', right: '-2px',
                          background: 'var(--gold)', borderRadius: '50%',
                          width: '14px', height: '14px', fontSize: '0.55rem',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>📷</div>
                      </label>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '1rem' }}>{p}</div>
                        {usedPlayers.has(p) && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {sessions.filter(s => s.player_name === p).length}× gespielt
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {avatars[p] && (
                          <button className="btn-danger" style={{ fontSize: '0.65rem', padding: '4px 8px' }}
                            onClick={() => onDeleteAvatar(p)}>🗑</button>
                        )}
                        <button className="btn-ghost" style={{ padding: '5px 10px', fontSize: '0.75rem' }}
                          onClick={() => startRename(p)}>✏️</button>
                        {!usedPlayers.has(p) && (
                          <button className="btn-danger" onClick={() => onRemove(p)}>✕</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                localStorage.removeItem('poker_players')
                window.location.reload()
              }}
              style={{ width: '100%', marginTop: '10px', padding: '8px', background: 'none', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '8px', color: 'rgba(248,113,113,0.6)', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'Cinzel, serif', letterSpacing: '0.06em' }}>
              🔄 Spielerliste aktualisieren
            </button>
            <button className="btn-ghost" style={{ width: '100%', marginTop: '8px' }}
              onClick={() => { setOpen(false); setRenamingPlayer(null) }}>
              Schließen
            </button>
          </div>
        </div>
      )}
    </>
  )
}
