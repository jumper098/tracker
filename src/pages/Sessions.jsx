import { useState, useEffect, useRef } from 'react'
import { db } from '../lib/supabase'
import { formatDate, formatEuro, formatEuroSign, profitClass } from '../lib/helpers'
import { calcSettlement } from '../lib/settlement'
import { showToast } from '../components/Toast'
import ConfirmDialog from '../components/ConfirmDialog'
import Avatar from '../components/Avatar'

export default function Sessions({ sessions, onRefresh, avatars = {} }) {
  const [openNights, setOpenNights] = useState({})
  const [settlementNight, setSettlementNight] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [yearFilter, setYearFilter] = useState(() => {
    const yrs = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
    return yrs.length > 0 ? yrs[0] : 'all'
  })
  const [photos, setPhotos] = useState({})
  const [lightbox, setLightbox] = useState(null)
  const [editSession, setEditSession] = useState(null)
  const [editValues, setEditValues] = useState({})

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

  useEffect(() => { loadPhotos() }, [])

  async function loadPhotos() {
    const { data: files, error } = await db.storage.from('poker-photos').list('nights')
    if (error || !files) return
    const newPhotos = {}
    files.forEach(file => {
      const date = file.name.replace(/\.[^.]+$/, '')
      const { data } = db.storage.from('poker-photos').getPublicUrl('nights/' + file.name)
      newPhotos[date] = data.publicUrl
    })
    setPhotos(newPhotos)
  }

  async function handlePhotoUpload(e, date) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { showToast('⚠ Foto zu groß (max. 10 MB)'); return }
    showToast('📷 Foto wird hochgeladen…')
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `nights/${date}.${ext}`
    const { error } = await db.storage.from('poker-photos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { showToast('⚠ Upload fehlgeschlagen: ' + error.message); return }
    const { data } = db.storage.from('poker-photos').getPublicUrl(path)
    setPhotos(prev => ({ ...prev, [date]: data.publicUrl + '?t=' + Date.now() }))
    showToast('📷 Foto gespeichert!')
  }

  async function removePhoto(date) {
    const exts = ['jpg','jpeg','png','webp','heic']
    for (const ext of exts) {
      await db.storage.from('poker-photos').remove([`nights/${date}.${ext}`]).catch(() => {})
    }
    setPhotos(prev => { const n = { ...prev }; delete n[date]; return n })
    showToast('Foto entfernt')
  }

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

  function openEdit(s) {
    setEditSession(s)
    setEditValues({
      date: s.date,
      buyin: ((s.buy_in || 0) - (s.rebuys || 0)).toFixed(2),
      rebuys: (s.rebuys || 0).toFixed(2),
      rebuy_count: s.rebuy_count || 0,
      cashout: (s.cash_out || 0).toFixed(2),
    })
  }

  async function saveEdit() {
    const buyin = parseFloat(editValues.buyin) || 0
    const rebuys = parseFloat(editValues.rebuys) || 0
    const rebuy_count = parseInt(editValues.rebuy_count) || 0
    const cashout = parseFloat(editValues.cashout) || 0
    const totalBuyin = buyin + rebuys

    const { error } = await db.from('poker_sessions').update({
      date: editValues.date,
      buy_in: totalBuyin,
      cash_out: cashout,
      rebuys: rebuys,
      rebuy_count: rebuy_count,
    }).eq('id', editSession.id)

    if (error) { showToast('Fehler: ' + error.message); return }
    showToast('✓ Eintrag aktualisiert!')
    setEditSession(null)
    onRefresh()
  }

  const settlementResult = settlementNight ? calcSettlement(byDate[settlementNight]) : null
  const settlement = settlementResult?.transfers || []

  const editProfit = editSession
    ? (parseFloat(editValues.cashout) || 0) - (parseFloat(editValues.buyin) || 0) - (parseFloat(editValues.rebuys) || 0)
    : 0

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ SESSIONS
        </div>
      </div>

      {/* Top 3 Last Night */}
      {(() => {
        const lastNightDate = filteredDates[0]
        if (!lastNightDate) return null
        const lastNight = byDate[lastNightDate]
        const top3 = [...lastNight]
          .sort((a, b) => (b.cash_out - b.buy_in) - (a.cash_out - a.buy_in))
          .slice(0, 3)
        return (
          <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div className="font-display" style={{ fontSize: '0.72rem', color: 'var(--gold)', letterSpacing: '0.12em' }}>
                🃏 LETZTER ABEND
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {formatDate(lastNightDate)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {top3.map((s, i) => {
                const profit = s.cash_out - s.buy_in
                const medals = ['🥇', '🥈', '🥉']
                return (
                  <div key={s.id} style={{
                    flex: 1, textAlign: 'center', padding: '12px 6px',
                    borderRadius: '10px',
                    background: i === 0 ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${i === 0 ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.05)'}`,
                  }}>
                    <div style={{ marginBottom: '6px' }}>
                      <Avatar name={s.player_name} src={avatars[s.player_name]} size={38} style={{ margin: '0 auto' }} />
                    </div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, marginBottom: '3px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: i === 0 ? 'var(--gold)' : 'var(--text-primary)' }}>
                      {s.player_name}
                    </div>
                    <div style={{ fontSize: '0.75rem' }}>
                      {medals[i]}
                    </div>
                    <div className={`font-display ${profitClass(profit)}`} style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                      {profit >= 0 ? '+' : ''}{profit.toFixed(0)}€
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

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
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {[...years, 'all'].map(y => (
          <button key={y} onClick={() => setYearFilter(y)} className="btn-ghost"
            style={{
              flex: 1,
              textAlign: 'center',
              background: yearFilter === y ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: yearFilter === y ? 'rgba(201,168,76,0.5)' : undefined,
              color: yearFilter === y ? 'var(--gold-light)' : undefined,
            }}>
            {y === 'all' ? 'Alle' : y}
          </button>
        ))}
      </div>

      {filteredDates.length === 0 && (
        <div className="empty-state">Noch keine Sessions — spiel eine Runde! ♠</div>
      )}

      {filteredDates.map(date => {
        const night = byDate[date]
        const isOpen = openNights[date]
        const potTotal = night.reduce((s, e) => s + e.buy_in, 0)
        const photoUrl = photos[date]

        return (
          <div key={date} className="card" style={{ marginBottom: '12px', padding: '0' }}>
            <div onClick={() => toggleNight(date)}
              style={{ padding: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="font-display" style={{ fontSize: '0.85rem', color: 'var(--gold)', letterSpacing: '0.1em' }}>
                  {formatDate(date)}
                  {photoUrl && <span style={{ marginLeft: '8px', fontSize: '0.8rem' }}>📷</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Pot {formatEuro(potTotal)}
                </div>
                {/* Player chips */}
                <div style={{ display: 'flex', marginTop: '6px', gap: '0' }}>
                  {night.slice(0,6).map((s, i) => (
                    <div key={s.id} style={{ marginLeft: i === 0 ? 0 : '-8px', zIndex: night.length - i }}>
                      <Avatar name={s.player_name} src={avatars[s.player_name]} size={24}
                        style={{ border: '1.5px solid rgba(20,20,22,0.9)' }} />
                    </div>
                  ))}
                  {night.length > 6 && (
                    <div style={{
                      marginLeft: '-8px', width: '24px', height: '24px', borderRadius: '50%',
                      background: 'rgba(201,168,76,0.15)', border: '1.5px solid rgba(20,20,22,0.9)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.5rem', color: 'var(--gold)', fontFamily: 'Cinzel, serif', zIndex: 0,
                    }}>+{night.length - 6}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button onClick={e => { e.stopPropagation(); setSettlementNight(date) }}
                  className="btn-ghost" style={{ fontSize: '0.65rem', padding: '5px 10px' }}>
                  💸 Ausgleich
                </button>
                <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
            </div>

            {isOpen && (
              <div style={{ borderTop: '1px solid rgba(201,168,76,0.1)', padding: '8px 16px 16px' }}>

                {/* Photo section */}
                <div style={{ marginBottom: '16px' }}>
                  {photoUrl ? (
                    <div style={{ position: 'relative' }}>
                      <img src={photoUrl} alt="Spielabend" onClick={() => setLightbox(photoUrl)}
                        style={{ width: '100%', borderRadius: '8px', cursor: 'pointer', maxHeight: '200px', objectFit: 'cover' }} />
                      <button onClick={() => setConfirm({
                        title: '🗑️ Foto löschen?', text: 'Foto dieses Abends wirklich löschen?',
                        onOk: () => { setConfirm(null); removePhoto(date) }
                      })} style={{
                        position: 'absolute', top: '8px', right: '8px',
                        background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%',
                        width: '28px', height: '28px', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem',
                      }}>✕</button>
                    </div>
                  ) : (
                    <label style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      padding: '12px', borderRadius: '8px', cursor: 'pointer',
                      border: '1px dashed rgba(201,168,76,0.25)', color: 'var(--text-muted)', fontSize: '0.85rem',
                      background: 'rgba(201,168,76,0.04)',
                    }}>
                      📷 Foto hinzufügen
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => handlePhotoUpload(e, date)} />
                    </label>
                  )}
                </div>

                {/* Player entries */}
                {night.slice().sort((a, b) => (b.cash_out - b.buy_in) - (a.cash_out - a.buy_in)).map(s => {
                  const profit = s.cash_out - s.buy_in
                  return (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          {avatars[s.player_name] ? (
                            <img src={avatars[s.player_name]} alt={s.player_name} style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              objectFit: 'cover', border: '1px solid rgba(201,168,76,0.3)', flexShrink: 0,
                            }} />
                          ) : (
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: 'rgba(201,168,76,0.1)', border: '1px dashed rgba(201,168,76,0.25)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.8rem', flexShrink: 0,
                            }}>👤</div>
                          )}
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.player_name}</div>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Buy-In: {formatEuro(s.buy_in)}
                          {s.rebuy_count > 0 && ` · ${s.rebuy_count}× Rebuy`}
                          {' · '}Cash-Out: {formatEuro(s.cash_out)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className={`font-display ${profitClass(profit)}`} style={{ fontSize: '0.9rem' }}>
                          {formatEuroSign(profit)}
                        </span>
                        <button className="btn-ghost" style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                          onClick={() => openEdit(s)}>✏️</button>
                        <button className="btn-danger" onClick={() => deleteSession(s.id)}>✕</button>
                      </div>
                    </div>
                  )
                })}

                <button className="btn-danger" style={{ marginTop: '12px', width: '100%' }}
                  onClick={() => deleteNight(date)}>
                  ✕ Ganzen Abend löschen
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Lightbox */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 600, padding: '20px', cursor: 'pointer',
        }}>
          <img src={lightbox} alt="Foto" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: '10px', objectFit: 'contain' }} />
        </div>
      )}

      {/* Edit modal */}
      {editSession && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 450, padding: '20px',
        }} onClick={() => setEditSession(null)}>
          <div className="card" style={{ maxWidth: '380px', width: '100%', padding: '24px' }}
            onClick={e => e.stopPropagation()}>
            <div className="font-display" style={{ fontSize: '0.9rem', color: 'var(--gold)', marginBottom: '4px', letterSpacing: '0.1em' }}>
              ✏️ EINTRAG BEARBEITEN
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
              {editSession.player_name}
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className="section-label">Datum</label>
              <input className="input-field" type="date" value={editValues.date}
                onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))}
                style={{ colorScheme: 'dark' }} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label className="section-label">Buy-In (€) ohne Rebuys</label>
              <input className="input-field" type="number" step="0.01" value={editValues.buyin}
                onChange={e => setEditValues(v => ({ ...v, buyin: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label className="section-label">Rebuys Gesamt (€)</label>
              <input className="input-field" type="number" step="0.01" value={editValues.rebuys}
                onChange={e => setEditValues(v => ({ ...v, rebuys: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label className="section-label">Anzahl Rebuys</label>
              <input className="input-field" type="number" step="1" min="0" value={editValues.rebuy_count}
                onChange={e => setEditValues(v => ({ ...v, rebuy_count: e.target.value }))} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label className="section-label">Cash-Out (€)</label>
              <input className="input-field" type="number" step="0.01" value={editValues.cashout}
                onChange={e => setEditValues(v => ({ ...v, cashout: e.target.value }))} />
            </div>

            {/* Profit preview */}
            <div style={{
              background: 'rgba(0,0,0,0.2)', borderRadius: '8px',
              padding: '10px 14px', marginBottom: '16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Profit</span>
              <span className={`font-display ${profitClass(editProfit)}`} style={{ fontSize: '0.95rem' }}>
                {editProfit >= 0 ? '+' : ''}{editProfit.toFixed(2)} €
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setEditSession(null)}>Abbrechen</button>
              <button className="btn-gold" style={{ flex: 1 }} onClick={saveEdit}>✓ Speichern</button>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0' }}>Alles ausgeglichen ✓</div>
            ) : (
              settlement.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', background: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px', marginBottom: '8px', border: '1px solid rgba(201,168,76,0.1)',
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
        <ConfirmDialog title={confirm.title} text={confirm.text} okLabel="Löschen"
          onOk={confirm.onOk} onCancel={() => setConfirm(null)} />
      )}
    </div>
  )
}
