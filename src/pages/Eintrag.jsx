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
  const [rebuys, setRebuys] = useState([])
  const [loading, setLoading] = useState(false)

  const totalBuyin = parseFloat(buyin || 0) + rebuys.reduce((s, r) => s + parseFloat(r || 0), 0)
  const profit = parseFloat(cashout || 0) - totalBuyin
  const showPreview = buyin !== '' && cashout !== ''

  function addRebuy() { setRebuys([...rebuys, '']) }
  function updateRebuy(i, val) { const r = [...rebuys]; r[i] = val; setRebuys(r) }
  function removeRebuy(i) { setRebuys(rebuys.filter((_, idx) => idx !== i)) }

  async function handleSubmit() {
    if (!date || !player || buyin === '' || cashout === '') {
      showToast('⚠ Bitte alle Felder ausfüllen'); return
    }
    setLoading(true)
    const rebuyCount = rebuys.filter(r => parseFloat(r) > 0).length
    const rebuyTotal = rebuys.reduce((s, r) => s + parseFloat(r || 0), 0)

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
          <input className="input-field" type="date" value={date} onChange={e => setDate(e.target.value)} />
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
        {rebuys.map((r, i) => (
          <div key={i} style={{ marginBottom: '10px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label className="section-label">Rebuy {i + 1} (€)</label>
              <input
                className="input-field" type="number" placeholder="0.00" step="0.01" min="0"
                value={r} onChange={e => updateRebuy(i, e.target.value)}
              />
            </div>
            <button onClick={() => removeRebuy(i)} style={{
              marginTop: '20px', background: 'none', border: 'none',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem',
            }}>✕</button>
          </div>
        ))}

        <button onClick={addRebuy} className="btn-ghost" style={{ width: '100%', marginBottom: '16px', fontSize: '0.7rem' }}>
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
    </div>
  )
}
