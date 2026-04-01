import { useEffect, useRef, useState } from 'react'

const TABS = [
  { id: 'eintrag',   icon: '✚', label: 'Eintrag'   },
  { id: 'sessions',  icon: '♠', label: 'Sessions'  },
  { id: 'rangliste', icon: '🏆', label: 'Rangliste' },
  { id: 'grafik',    icon: '📈', label: 'Statistik' },
  { id: 'awards',    icon: '🎖', label: 'Awards'    },
  { id: 'turnier',   icon: '🎰', label: 'Turnier'   },
]

export default function TabBar({ active, onChange }) {
  const navRef = useRef(null)

  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    function updateBottom() {
      if (!navRef.current) return
      if (window.visualViewport) {
        const vv = window.visualViewport
        const bottom = window.innerHeight - vv.height - vv.offsetTop
        // If keyboard is open (viewport significantly smaller), hide tab bar
        const keyboardOpen = vv.height < window.innerHeight * 0.75
        setHidden(keyboardOpen)
        if (!keyboardOpen) {
          navRef.current.style.bottom = Math.max(0, bottom) + 'px'
        }
      }
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateBottom)
      window.visualViewport.addEventListener('scroll', updateBottom)
    }
    window.addEventListener('resize', updateBottom)
    updateBottom()

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateBottom)
        window.visualViewport.removeEventListener('scroll', updateBottom)
      }
      window.removeEventListener('resize', updateBottom)
    }
  }, [])

  return (
    <nav ref={navRef} className="tab-bar" style={{ display: hidden ? 'none' : 'flex' }}>
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
