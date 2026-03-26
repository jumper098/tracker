import { useState, useEffect, useRef } from 'react'
import { formatEuroSign } from '../lib/helpers'

const COLORS = ['#C9A84C','#4ade80','#60a5fa','#f472b6','#a78bfa','#fb923c','#34d399','#e879f9','#f87171','#38bdf8']

export default function Grafik({ sessions }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [chartType, setChartType] = useState('cumulative')
  const [yearFilter, setYearFilter] = useState(() => {
    const yrs = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
    return yrs.length > 0 ? yrs[0] : 'all'
  })
  const [selectedPlayers, setSelectedPlayers] = useState([])

  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const filtered = yearFilter === 'all' ? sessions : sessions.filter(s => s.date.startsWith(yearFilter))
  const allPlayers = [...new Set(filtered.map(s => s.player_name))].sort()

  useEffect(() => {
    if (selectedPlayers.length === 0 && allPlayers.length > 0) {
      setSelectedPlayers(allPlayers.slice(0, 5))
    }
  }, [allPlayers.join(',')])

  function togglePlayer(name) {
    setSelectedPlayers(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    )
  }

  useEffect(() => {
    if (!canvasRef.current) return
    const Chart = window.Chart
    if (!Chart) return

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const ctx = canvasRef.current.getContext('2d')
    const activePlayers = selectedPlayers.filter(p => allPlayers.includes(p))
    if (activePlayers.length === 0 || filtered.length === 0) return

    const sortedDates = [...new Set(filtered.map(s => s.date))].sort()

    if (chartType === 'cumulative') {
      const datasets = activePlayers.map((name, i) => {
        const playerSessions = filtered.filter(s => s.player_name === name)
          .sort((a, b) => a.date.localeCompare(b.date))
        let cumulative = 0
        const data = sortedDates.map(date => {
          const s = playerSessions.find(s => s.date === date)
          if (s) cumulative += (s.cash_out - s.buy_in)
          return { x: date, y: Math.round(cumulative * 100) / 100 }
        })
        return {
          label: name, data,
          borderColor: COLORS[i % COLORS.length],
          backgroundColor: COLORS[i % COLORS.length] + '20',
          tension: 0.3, pointRadius: 4, fill: false,
        }
      })
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#F0E6CC', font: { family: 'Cinzel', size: 11 } } } },
          scales: {
            x: { type: 'category', ticks: { color: '#7A7060', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#7A7060', callback: v => v + ' €' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      })
    } else if (chartType === 'winrate') {
      const labels = activePlayers
      const data = activePlayers.map(name => {
        const ps = filtered.filter(s => s.player_name === name)
        const wins = ps.filter(s => s.cash_out > s.buy_in).length
        return ps.length > 0 ? Math.round(wins / ps.length * 100) : 0
      })
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Win Rate %',
            data,
            backgroundColor: activePlayers.map((_, i) => COLORS[i % COLORS.length] + 'CC'),
            borderColor: activePlayers.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 1, borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#7A7060' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { min: 0, max: 100, ticks: { color: '#7A7060', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      })
    } else if (chartType === 'rebuy') {
      const labels = activePlayers
      const data = activePlayers.map(name =>
        filtered.filter(s => s.player_name === name).reduce((sum, s) => sum + (s.rebuy_count || 0), 0)
      )
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Rebuys gesamt',
            data,
            backgroundColor: activePlayers.map((_, i) => COLORS[i % COLORS.length] + 'CC'),
            borderColor: activePlayers.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 1, borderRadius: 6,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#7A7060' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#7A7060' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          },
        },
      })
    }

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [chartType, yearFilter, selectedPlayers.join(','), filtered.length])

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ GRAFIK
        </div>
      </div>

      {/* Chart type */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {[
          { id: 'cumulative', label: 'Profit' },
          { id: 'winrate', label: 'Winrate' },
          { id: 'rebuy', label: 'Rebuys' },
        ].map(m => (
          <button key={m.id} onClick={() => setChartType(m.id)} className="btn-ghost"
            style={{
              background: chartType === m.id ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: chartType === m.id ? 'rgba(201,168,76,0.5)' : undefined,
              color: chartType === m.id ? 'var(--gold-light)' : undefined,
            }}>
            {m.label}
          </button>
        ))}
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

      {/* Player selector */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {allPlayers.map((name, i) => (
          <button key={name} onClick={() => togglePlayer(name)}
            style={{
              padding: '4px 12px', borderRadius: '20px', cursor: 'pointer',
              border: `1px solid ${COLORS[i % COLORS.length]}`,
              background: selectedPlayers.includes(name) ? COLORS[i % COLORS.length] + '33' : 'transparent',
              color: selectedPlayers.includes(name) ? COLORS[i % COLORS.length] : 'var(--text-muted)',
              fontSize: '0.8rem', transition: 'all 0.2s',
            }}>
            {name}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="card" style={{ height: '320px', padding: '16px' }}>
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Noch keine Daten ♠
          </div>
        ) : (
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {/* Chart.js CDN loader */}
      <ChartJsLoader />
    </div>
  )
}

function ChartJsLoader() {
  useEffect(() => {
    if (window.Chart) return
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js'
    document.head.appendChild(script)
  }, [])
  return null
}
