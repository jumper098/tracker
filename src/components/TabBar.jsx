const TABS = [
  { id: 'eintrag',   icon: '✚', label: 'Eintrag'   },
  { id: 'sessions',  icon: '♠', label: 'Sessions'  },
  { id: 'rangliste', icon: '🏆', label: 'Rangliste' },
  { id: 'grafik',    icon: '📈', label: 'Grafik'    },
  { id: 'awards',    icon: '🎖', label: 'Awards'    },
  { id: 'turnier',   icon: '🎰', label: 'Turnier'   },
]

export default function TabBar({ active, onChange }) {
  return (
    <nav className="tab-bar">
      {TABS.map(t => (
        <button
          key={t.id}
          className={`tab-btn ${active === t.id ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span className="tab-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
