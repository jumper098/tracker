import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const APP_PASSWORD = import.meta.env.VITE_APP_PASSWORD || 'poker2024'
const AUTH_KEY = 'poker_auth'

export function AuthProvider({ children }) {
  const [isAuthed, setIsAuthed] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem(AUTH_KEY)
    if (stored === 'true') setIsAuthed(true)
    setChecking(false)
  }, [])

  function login(password) {
    if (password === APP_PASSWORD) {
      setIsAuthed(true)
      sessionStorage.setItem(AUTH_KEY, 'true')
      return true
    }
    return false
  }

  function logout() {
    setIsAuthed(false)
    sessionStorage.removeItem(AUTH_KEY)
  }

  return (
    <AuthContext.Provider value={{ isAuthed, login, logout, checking }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
