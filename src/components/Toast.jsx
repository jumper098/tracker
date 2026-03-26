import { useState, useEffect, useCallback } from 'react'

let toastFn = null

export function useToast() {
  return toastFn
}

export function Toast() {
  const [msg, setMsg] = useState('')
  const [visible, setVisible] = useState(false)

  const show = useCallback((text) => {
    setMsg(text)
    setVisible(true)
    setTimeout(() => setVisible(false), 2800)
  }, [])

  useEffect(() => { toastFn = show }, [show])

  return (
    <div className={`toast ${visible ? 'show' : ''}`}>{msg}</div>
  )
}

export function showToast(msg) {
  if (toastFn) toastFn(msg)
}
