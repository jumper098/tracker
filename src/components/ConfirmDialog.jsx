export default function ConfirmDialog({ title, text, okLabel = 'Bestätigen', onOk, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 500, padding: '20px',
    }}>
      <div className="card" style={{ maxWidth: '360px', width: '100%', padding: '28px 24px', textAlign: 'center' }}>
        <div className="font-display" style={{ fontSize: '0.9rem', color: 'var(--gold)', marginBottom: '12px', letterSpacing: '0.1em' }}>
          {title}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>{text}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Abbrechen</button>
          <button className="btn-gold" style={{ flex: 1 }} onClick={onOk}>{okLabel}</button>
        </div>
      </div>
    </div>
  )
}
