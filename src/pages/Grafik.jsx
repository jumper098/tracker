import { useState, useEffect, useRef } from 'react'

// 10 visually distinct colors
const COLORS = [
  '#C9A84C', '#4ade80', '#60a5fa', '#f472b6',
  '#a78bfa', '#fb923c', '#34d399', '#f87171',
  '#38bdf8', '#e879f9',
]

export default function Grafik({ sessions }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const [chartType, setChartType] = useState('cumulative')
  const [yearFilter, setYearFilter] = useState(() => {
    const yrs = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
    return yrs.length > 0 ? yrs[0] : 'all'
  })
  const [selectedPlayers, setSelectedPlayers] = useState([])
  const [chartReady, setChartReady] = useState(false)

  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b - a)
  const filtered = yearFilter === 'all' ? sessions : sessions.filter(s => s.date.startsWith(yearFilter))
  const allPlayers = [...new Set(filtered.map(s => s.player_name))].sort()

  // Sort players by profit descending, auto-select top 3
  const playersByProfit = [...allPlayers].sort((a, b) => {
    const profA = filtered.filter(s => s.player_name === a).reduce((sum, s) => sum + (s.cash_out - s.buy_in), 0)
    const profB = filtered.filter(s => s.player_name === b).reduce((sum, s) => sum + (s.cash_out - s.buy_in), 0)
    return profB - profA
  })

  // Auto-select top 3 when year or players change
  useEffect(() => {
    setSelectedPlayers(playersByProfit.slice(0, 3))
  }, [yearFilter, allPlayers.join(',')])

  function togglePlayer(name) {
    setSelectedPlayers(prev => {
      if (prev.includes(name)) return prev.filter(p => p !== name)
      if (prev.length >= 5) return prev // max 5
      return [...prev, name]
    })
  }

  // Load Chart.js
  useEffect(() => {
    if (window.Chart) { setChartReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js'
    script.onload = () => setChartReady(true)
    document.head.appendChild(script)
  }, [])

  // Draw chart
  useEffect(() => {
    if (!chartReady || !canvasRef.current) return
    const Chart = window.Chart
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const ctx = canvasRef.current.getContext('2d')
    const active = selectedPlayers.filter(p => allPlayers.includes(p))
    if (active.length === 0 || filtered.length === 0) return

    const sortedDates = [...new Set(filtered.map(s => s.date))].sort()

    const gridColor = 'rgba(255,255,255,0.06)'
    const tickColor = '#7A7060'
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#F0E6CC',
            font: { family: 'Cinzel', size: 11 },
            padding: 16,
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          backgroundColor: 'rgba(20,20,22,0.95)',
          borderColor: 'rgba(201,168,76,0.3)',
          borderWidth: 1,
          titleColor: '#C9A84C',
          bodyColor: '#F0E6CC',
          titleFont: { family: 'Cinzel', size: 11 },
          bodyFont: { family: 'Crimson Text', size: 13 },
          padding: 10,
        }
      },
      scales: {
        x: {
          ticks: { color: tickColor, maxTicksLimit: 8, font: { size: 10 } },
          grid: { color: gridColor },
        },
        y: {
          ticks: { color: tickColor, font: { size: 10 } },
          grid: { color: gridColor },
        }
      }
    }

    if (chartType === 'cumulative') {
      const datasets = active.map((name, i) => {
        const color = COLORS[i % COLORS.length]
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
          borderColor: color,
          backgroundColor: color + '18',
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: color,
          borderWidth: 2.5,
          fill: false,
        }
      })
      chartRef.current = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
          ...baseOptions,
          scales: {
            ...baseOptions.scales,
            x: { ...baseOptions.scales.x, type: 'category' },
            y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, callback: v => v + ' €' } }
          }
        }
      })
    }

    else if (chartType === 'winrate') {
      const data = active.map(name => {
        const ps = filtered.filter(s => s.player_name === name)
        const wins = ps.filter(s => s.cash_out > s.buy_in).length
        return ps.length > 0 ? Math.round(wins / ps.length * 100) : 0
      })
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: active,
          datasets: [{
            label: 'Winrate %',
            data,
            backgroundColor: active.map((_, i) => COLORS[i % COLORS.length] + 'BB'),
            borderColor: active.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
          }]
        },
        options: {
          ...baseOptions,
          plugins: { ...baseOptions.plugins, legend: { display: false } },
          scales: {
            ...baseOptions.scales,
            y: { ...baseOptions.scales.y, min: 0, max: 100, ticks: { ...baseOptions.scales.y.ticks, callback: v => v + '%' } }
          }
        }
      })
    }

    else if (chartType === 'rebuy') {
      const data = active.map(name =>
        filtered.filter(s => s.player_name === name).reduce((sum, s) => sum + (s.rebuy_count || 0), 0)
      )
      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: active,
          datasets: [{
            label: 'Rebuys gesamt',
            data,
            backgroundColor: active.map((_, i) => COLORS[i % COLORS.length] + 'BB'),
            borderColor: active.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
          }]
        },
        options: {
          ...baseOptions,
          plugins: { ...baseOptions.plugins, legend: { display: false } },
          scales: {
            ...baseOptions.scales,
            y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, stepSize: 1 } }
          }
        }
      })
    }

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [chartReady, chartType, yearFilter, selectedPlayers.join(','), filtered.length])

  return (
    <div style={{ padding: '20px 16px 100px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px', paddingTop: '12px' }}>
        <div className="font-display" style={{ fontSize: '1.3rem', color: 'var(--gold)', letterSpacing: '0.15em' }}>
          ♠ GRAFIK
        </div>
      </div>

      {/* Chart type */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        {[
          { id: 'cumulative', label: '📈 Profit' },
          { id: 'winrate',    label: '🏆 Winrate' },
          { id: 'rebuy',      label: '🔄 Rebuys' },
        ].map(m => (
          <button key={m.id} onClick={() => setChartType(m.id)} className="btn-ghost"
            style={{
              flex: 1, textAlign: 'center',
              background: chartType === m.id ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: chartType === m.id ? 'rgba(201,168,76,0.5)' : undefined,
              color: chartType === m.id ? 'var(--gold-light)' : undefined,
              fontSize: '0.7rem',
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
              flex: 1, textAlign: 'center',
              background: yearFilter === y ? 'rgba(201,168,76,0.2)' : undefined,
              borderColor: yearFilter === y ? 'rgba(201,168,76,0.5)' : undefined,
              color: yearFilter === y ? 'var(--gold-light)' : undefined,
            }}>
            {y === 'all' ? 'Alle' : y}
          </button>
        ))}
      </div>

      {/* Player selector */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>
            SPIELER ({selectedPlayers.length}/5)
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="btn-ghost" style={{ fontSize: '0.6rem', padding: '3px 8px' }}
              onClick={() => setSelectedPlayers(playersByProfit.slice(0, 5))}>
              Top 5
            </button>
            <button className="btn-ghost" style={{ fontSize: '0.6rem', padding: '3px 8px' }}
              onClick={() => setSelectedPlayers([])}>
              Keine
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
          {playersByProfit.map((name, i) => {
            const colorIdx = selectedPlayers.indexOf(name)
            const isSelected = colorIdx !== -1
            const color = isSelected ? COLORS[colorIdx % COLORS.length] : null
            const disabled = !isSelected && selectedPlayers.length >= 5
            return (
              <button key={name} onClick={() => !disabled && togglePlayer(name)}
                style={{
                  padding: '5px 14px', borderRadius: '20px', cursor: disabled ? 'not-allowed' : 'pointer',
                  border: `1.5px solid ${isSelected ? color : 'rgba(255,255,255,0.1)'}`,
                  background: isSelected ? color + '22' : 'transparent',
                  color: isSelected ? color : disabled ? 'rgba(255,255,255,0.2)' : 'var(--text-muted)',
                  fontSize: '0.85rem', transition: 'all 0.15s',
                  fontWeight: isSelected ? 600 : 400,
                }}>
                {isSelected && <span style={{ marginRight: '4px', fontSize: '0.7rem' }}>●</span>}
                {name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: '16px' }}>
        <div style={{ height: '300px', position: 'relative' }}>
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Noch keine Daten ♠
            </div>
          ) : selectedPlayers.length === 0 ? (
            <div className="empty-state" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              Wähle mindestens einen Spieler aus
            </div>
          ) : (
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      </div>

      {/* Max 5 hint */}
      {selectedPlayers.length >= 5 && (
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
          Maximum 5 Spieler gleichzeitig
        </div>
      )}
    </div>
  )
}
