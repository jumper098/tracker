export const formatEuro = (n) => (+(n||0)).toFixed(2) + ' €'
export const formatEuroSign = (n) => (n >= 0 ? '+' : '') + (+(n||0)).toFixed(2) + ' €'
export const profitClass = (n) => n > 0 ? 'profit-pos' : n < 0 ? 'profit-neg' : 'profit-neu'
export const formatDate = (d) => {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}
export const esc = (str) => String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
