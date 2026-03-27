const COLORS = [
  '#C9A84C', '#4ade80', '#60a5fa', '#f472b6',
  '#a78bfa', '#fb923c', '#34d399', '#f87171',
  '#38bdf8', '#e879f9',
]

function nameToColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function Avatar({ name, src, size = 36, style = {} }) {
  const color = nameToColor(name)
  const initials = getInitials(name)

  if (src) {
    return (
      <img src={src} alt={name} style={{
        width: size, height: size, borderRadius: '50%',
        objectFit: 'cover',
        border: `2px solid ${color}66`,
        flexShrink: 0,
        ...style,
      }} />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22',
      border: `2px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.33 + 'px',
      fontFamily: 'Cinzel, serif',
      color: color,
      fontWeight: 700,
      flexShrink: 0,
      ...style,
    }}>
      {initials}
    </div>
  )
}
