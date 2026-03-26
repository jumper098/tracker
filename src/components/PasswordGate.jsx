import { useState } from 'react'

const CORRECT_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'allin2024'
const STORAGE_KEY = 'poker_tracker_auth'

export default function PasswordGate({ children }) {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  const [unlocked, setUnlocked] = useState(stored === 'true')
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  if (unlocked) return children

  function tryLogin() {
    if (input === CORRECT_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true')
      setUnlocked(true)
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setTimeout(() => setError(false), 2000)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '360px',
        padding: '40px 32px',
        textAlign: 'center',
        animation: shake ? 'shake 0.4s ease' : 'none',
      }}>
        {/* Logo */}
        <div style={{ fontSize: '3rem', marginBottom: '8px' }}>♠</div>
        <div className="font-display" style={{
          fontSize: '1.1rem',
          letterSpacing: '0.2em',
          color: 'var(--gold)',
          marginBottom: '6px',
        }}>ALL IN</div>
        <div className="font-display" style={{
          fontSize: '0.65rem',
          letterSpacing: '0.25em',
          color: 'var(--text-muted)',
          marginBottom: '36px',
        }}>POKER TRACKER</div>

        <div style={{ marginBottom: '12px', textAlign: 'left' }}>
          <label className="section-label">Zugangspasswort</label>
          <input
            className="input-field"
            type="password"
            placeholder="Passwort eingeben..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && tryLogin()}
            autoFocus
            style={{ borderColor: error ? 'rgba(231,76,60,0.6)' : undefined }}
          />
          {error && (
            <div style={{ color: '#e74c3c', fontSize: '0.8rem', marginTop: '6px' }}>
              ✕ Falsches Passwort
            </div>
          )}
        </div>

        <button className="btn-gold" style={{ width: '100%' }} onClick={tryLogin}>
          ♠ Eintreten
        </button>

        <div style={{
          marginTop: '24px',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
        }}>
          Nur für eingeladene Spieler
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0) }
          20% { transform: translateX(-10px) }
          40% { transform: translateX(10px) }
          60% { transform: translateX(-8px) }
          80% { transform: translateX(8px) }
        }
      `}</style>
    </div>
  )
}
