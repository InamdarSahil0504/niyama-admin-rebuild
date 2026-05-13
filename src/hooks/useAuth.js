import { useState, useCallback } from 'react'

const AUTH_KEY = 'niyama_admin_auth'

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem(AUTH_KEY) === 'true'
  })

  const login = useCallback((password) => {
    const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD
    if (password === adminPassword) {
      sessionStorage.setItem(AUTH_KEY, 'true')
      sessionStorage.setItem('niyama_login_time', new Date().toISOString())
      setIsAuthenticated(true)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem('niyama_login_time')
    setIsAuthenticated(false)
  }, [])

  return { isAuthenticated, login, logout }
}
