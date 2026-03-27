import { useState } from 'react'
import { db } from '../lib/supabase'
import { formatEuroSign } from '../lib/helpers'
import { showToast } from '../components/Toast'

export default function Eintrag({ players, onSessionAdded }) {
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [player, setPlayer] = useState('')
  const [buyin, setBuyin] = useState('')
  const [cashout, setCashout] = useState('')
  const [rebuys, setRebuys] = useState([]) // array of amounts
  const [showRebuyDialog, setShowRebuyDialog] = useState(false)
  const [rebuyAmounts, setRebuyAmounts] = useState(['20', '', ''])
  const [loading, setLoading] = useState(false)

  const totalBuyin = parseFloat(buyin || 0) + rebuys.reduce((s, r) => s + r, 0)
  const profit = parseFloat(cashout || 0) - totalBuyin
  const showPreview = buyin !== '' && cashout !== ''

  function openRebuyDialog() {
    setRebuyAmounts(['20', '', ''])
    setShowRebuyDialog(true)
  }
  function confirmRebuy() {
    const newRebuys = rebuyAmounts
      .map(r => parseFloat(r))
      .filter(r => !isNaN(r) && r > 0)
    if (newRebuys.length > 0) {
      setRebuys(prev => [...prev, ...newRebuys])
    }
    setShowRebuyDialog(false)
  }
  function removeRebuy(i) { setRebuys(rebuys.filter((_, idx) => idx !== i)) }

  async function handleSubmit() {
    if (!date || !player || buyin === '' || cashout === '') {
      showToast('⚠ Bitte alle Felder ausfüllen'); return
    }
    setLoading(true)
    const rebuyCount = rebuys.length
    const rebuyTotal = rebuys.reduce((s, r) => s + r, 0)

    const { error } = await db.from('poker_sessions').insert([{
      date,
      player_name: player,
      buy_in: totalBuyin,
      cash_out: parseFloat(cashout),
      rebuys: rebuyTotal,
      rebuy_count: rebuyCount,
    }])
    setLoading(false)
    if (error) { showToast('Fehler: ' + error.message); return }
    showToast('✓ Eintrag gespeichert!' + (rebuyTotal > 0 ? ` (inkl. ${rebuyTotal.toFixed(2)} € Rebuy)` : ''))
    setPlayer(''); setBuyin(''); setCashout(''); setRebuys([])
    onSessionAdded()
  }

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ EINTRAG
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Session hinzufügen
        </div>
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        {/* Date */}
        <div style={{ marginBottom: '16px' }}>
          <label className="section-label">Datum</label>
          <input
            className="input-field"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              width: '100%',
              display: 'block',
              colorScheme: 'dark',
              boxSizing: 'border-box',
              WebkitAppearance: 'none',
              appearance: 'none',
            }}
          />
        </div>

        {/* Player */}
        <div style={{ marginBottom: '16px' }}>
          <label className="section-label">Spieler</label>
          <select className="input-field" value={player} onChange={e => setPlayer(e.target.value)}>
            <option value="">— Spieler auswählen —</option>
            {players.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Buy-in */}
        <div style={{ marginBottom: '16px' }}>
          <label className="section-label">Buy-In (€)</label>
          <input
            className="input-field" type="number" placeholder="0.00" step="0.01" min="0"
            value={buyin} onChange={e => setBuyin(e.target.value)}
          />
        </div>

        {/* Rebuys */}
        {rebuys.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <label className="section-label">Rebuys ({rebuys.length}×)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {rebuys.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(244,114,182,0.08)', border: '1px solid rgba(244,114,182,0.3)',
                  borderRadius: '20px', padding: '4px 10px 4px 12px',
                }}>
                  <span style={{ fontFamily: 'Cinzel, serif', fontSize: '0.8rem', color: '#f472b6' }}>
                    {r.toFixed(2)}€
                  </span>
                  <button onClick={() => removeRebuy(i)} style={{
                    background: 'none', border: 'none', color: 'rgba(244,114,182,0.6)',
                    cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1, padding: 0,
                  }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={openRebuyDialog} className="btn-ghost" style={{ width: '100%', marginBottom: '16px', fontSize: '0.7rem', borderColor: 'rgba(244,114,182,0.3)', color: '#f472b6' }}>
          + REBUY HINZUFÜGEN
        </button>

        {/* Cash-out */}
        <div style={{ marginBottom: '20px' }}>
          <label className="section-label">Cash-Out (€)</label>
          <input
            className="input-field" type="number" placeholder="0.00" step="0.01" min="0"
            value={cashout} onChange={e => setCashout(e.target.value)}
          />
        </div>

        {/* Profit preview */}
        {showPreview && (
          <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: '1px solid rgba(201,168,76,0.1)',
          }}>
            <div>
              <div className="section-label" style={{ marginBottom: '2px' }}>Total Buy-In</div>
              <div style={{ color: 'var(--text-primary)' }}>{totalBuyin.toFixed(2)} €</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="section-label" style={{ marginBottom: '2px' }}>Profit / Verlust</div>
              <div className={`font-display ${profit > 0 ? 'profit-pos' : profit < 0 ? 'profit-neg' : 'profit-neu'}`}
                style={{ fontSize: '1.1rem', letterSpacing: '0.05em' }}>
                {formatEuroSign(profit)}
              </div>
            </div>
          </div>
        )}

        <button className="btn-gold" style={{ width: '100%' }} onClick={handleSubmit} disabled={loading}>
          {loading ? '…' : '♠ Eintrag speichern'}
        </button>
      </div>

      {/* Rebuy Dialog */}
      {showRebuyDialog && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 500, padding: '20px',
        }} onClick={() => setShowRebuyDialog(false)}>
          <div className="card" style={{ maxWidth: '320px', width: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize: '0.9rem', color: '#f472b6', letterSpacing: '0.1em', marginBottom: '6px' }}>
              🔄 REBUY HINZUFÜGEN
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Rebuy {rebuys.length + 1} für <strong style={{ color: 'var(--text-primary)' }}>{player || '—'}</strong>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Felder leer lassen wenn kein weiterer Rebuy
            </div>
            {rebuyAmounts.map((amt, i) => (
              <div key={i} style={{ marginBottom: '10px' }}>
                <label className="section-label">Rebuy {rebuys.length + i + 1} (€)</label>
                <input
                  className="input-field"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amt}
                  onChange={e => setRebuyAmounts(prev => prev.map((v, idx) => idx === i ? e.target.value : v))}
                  onFocus={e => e.target.select()}
                  autoFocus={i === 0}
                  style={{ textAlign: 'center', fontSize: '1.1rem' }}
                />
              </div>
            ))}
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '16px' }}>
              Standard 20€ — Betrag anpassen falls nötig
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setShowRebuyDialog(false)}>
                Abbrechen
              </button>
              <button className="btn-gold" style={{ flex: 1, borderColor: 'rgba(244,114,182,0.5)', background: 'rgba(244,114,182,0.15)', color: '#f472b6' }}
                onClick={confirmRebuy}>
                ✓ Bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
