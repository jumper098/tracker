import { useState } from 'react'
import { db } from '../lib/supabase'
import { formatDate, formatEuro, formatEuroSign, profitClass } from '../lib/helpers'
import { calcSettlement } from '../lib/settlement'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Sessions({ sessions, onRefresh }) {
  const [openNights, setOpenNights] = useState({})
  const [settlementNight, setSettlementNight] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [yearFilter, setYearFilter] = useState('all')

  // Group sessions by date
  const byDate = {}
  sessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  })
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  // Year filter
  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const filteredDates = yearFilter === 'all' ? sortedDates : sortedDates.filter(d => d.startsWith(yearFilter))

  // Stats
  const totalNights = filteredDates.length
  const totalPot = filteredDates.reduce((sum, d) => sum + byDate[d].reduce((s, e) => s + e.buy_in, 0), 0)

  function toggleNight(date) {
    setOpenNights(prev => ({ ...prev, [date]: !prev[date] }))
  }

  async function deleteSession(id) {
    const s = sessions.find(s => s.id === id)
    setConfirm({
      title: '✕ Eintrag löschen?',
      text: `Eintrag von ${s?.player_name} wirklich löschen?`,
      onOk: async () => {
        setConfirm(null)
        const { error } = await db.from('poker_sessions').delete().eq('id', id)
        if (error) { showToast('Fehler: ' + error.message); return }
        showToast('Eintrag gelöscht')
        onRefresh()
      }
    })
  }

  async function deleteNight(date) {
    const count = byDate[date].length
    setConfirm({
      title: '✕ Spielabend löschen?',
      text: `Alle ${count} Einträge vom ${formatDate(date)} löschen?`,
      onOk: async () => {
        setConfirm(null)
        const { error } = await db.from('poker_sessions').delete().eq('date', date)
        if (error) { showToast('Fehler: ' + error.message); return }
        showToast('Spielabend gelöscht')
        onRefresh()
      }
    })
  }

  const settlementResult = settlementNight ? calcSettlement(byDate[settlementNight]) : null
  const settlement = settlementResult?.transfers || []

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ SESSIONS
        </div>
      </div>

      {/* Quick stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
          <div className="font-display" style={{ fontSize: '1.4rem', color: 'var(--gold)' }}>{totalNights}</div>
          <div className="section-label" style={{ marginBottom: 0 }}>Spielabende</div>
        </div>
        <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
          <div className="font-display" style={{ fontSize: '1.1rem', color: 'var(--gold)' }}>{formatEuro(totalPot)}</div>
          <div className="section-label" style={{ marginBottom: 0 }}>Pot Total</div>
        </div>
      </div>

      {/* Year filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {['all', ...years].map(y => (
          <button key={y} onClick={() => setYearFilter(y)}
            className="btn-ghost"
            style={{
              whiteSpace: 'nowrap',
              background: yearFilter === y ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: yearFilter === y ? 'rgba(201,168,76,0.5)' : undefined,
              color: yearFilter === y ? 'var(--gold-light)' : undefined,
            }}>
            {y === 'all' ? 'Alle' : y}
          </button>
        ))}
      </div>

      {/* Night cards */}
      {filteredDates.length === 0 && (
        <div className="empty-state">Noch keine Sessions — spiel eine Runde! ♠</div>
      )}

      {filteredDates.map(date => {
        const night = byDate[date]
        const isOpen = openNights[date]
        const potTotal = night.reduce((s, e) => s + e.buy_in, 0)

        return (
          <div key={date} className="card" style={{ marginBottom: '12px', padding: '0' }}>
            {/* Night header */}
            <div
              onClick={() => toggleNight(date)}
              style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <div>
                <div className="font-display" style={{ fontSize: '0.85rem', color: 'var(--gold)', letterSpacing: '0.1em' }}>
                  {formatDate(date)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {night.length} Spieler · Pot {formatEuro(potTotal)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={e => { e.stopPropagation(); setSettlementNight(date) }}
                  className="btn-ghost"
                  style={{ fontSize: '0.65rem', padding: '5px 10px' }}
                >
                  💸 Ausgleich
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Night entries */}
            {isOpen && (
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '8px 16px 16px' }}>
                {night
                  .slice()
                  .sort((a, b) => (b.cash_out - b.buy_in) - (a.cash_out - a.buy_in))
                  .map(s => {
                    const profit = s.cash_out - s.buy_in
                    return (
                      <div key={s.id} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.player_name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            Buy-In: {formatEuro(s.buy_in)}
                            {s.rebuy_count > 0 && ` · ${s.rebuy_count}× Rebuy`}
                            {' · '}Cash-Out: {formatEuro(s.cash_out)}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`font-display ${profitClass(profit)}`} style={{ fontSize: '0.9rem' }}>
                            {formatEuroSign(profit)}
                          </span>
                          <button className="btn-danger" onClick={() => deleteSession(s.id)}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                <button
                  className="btn-danger"
                  style={{ marginTop: '12px', width: '100%' }}
                  onClick={() => deleteNight(date)}
                >
                  ✕ Ganzen Abend löschen
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Settlement modal */}
      {settlementNight && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 400, padding: '20px',
        }} onClick={() => setSettlementNight(null)}>
          <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize: '0.9rem', color: 'var(--gold)', letterSpacing: '0.12em', marginBottom: '4px' }}>
              💸 SCHULDENAUSGLEICH
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              {formatDate(settlementNight)} — minimale Überweisungen
            </div>

            {/* Adjustment notice */}
            {settlementResult?.adjustmentNote && (
              <div style={{
                background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.25)',
                borderRadius: '8px', padding: '10px 12px', marginBottom: '16px',
                fontSize: '0.78rem', color: 'var(--gold-light)',
              }}>
                ⚠ {settlementResult.adjustmentNote}
              </div>
            )}

            {settlement.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>
                Alles ausgeglichen ✓
              </div>
            ) : (
              settlement.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', background: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px', marginBottom: '8px',
                  border: '1px solid rgba(201,168,76,0.1)',
                }}>
                  <div style={{ fontSize: '0.9rem' }}>
                    <span style={{ color: '#f87171' }}>{t.from}</span>
                    <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>→</span>
                    <span style={{ color: '#4ade80' }}>{t.to}</span>
                  </div>
                  <div className="font-display" style={{ color: 'var(--gold)', fontSize: '0.9rem' }}>
                    {formatEuro(t.amount)}
                  </div>
                </div>
              ))
            )}

            <button className="btn-ghost" style={{ width: '100%', marginTop: '16px' }}
              onClick={() => setSettlementNight(null)}>
              Schließen
            </button>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          text={confirm.text}
          okLabel="Löschen"
          onOk={confirm.onOk}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
