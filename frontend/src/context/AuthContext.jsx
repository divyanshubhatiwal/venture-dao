import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Real authentication, against the server.
 *
 * This replaces a version that kept a profile in localStorage and treated its
 * presence as proof of identity — forgeable from the devtools console in a few
 * seconds. Nothing here decides whether you are signed in: the browser holds an
 * httpOnly session cookie it cannot read, and the server answers the question
 * on every load.
 *
 * `credentials: 'include'` on every call is what makes that cookie travel;
 * without it the requests succeed, no cookie is sent, and the app looks
 * permanently signed out for no visible reason.
 */

const API = import.meta.env?.VITE_API_URL || ''
const AuthContext = createContext(null)

import { getAuthHeaders, setAuthToken } from '../lib/api/authHeader'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

async function call(path, { method = 'GET', body } = {}) {
  const headers = getAuthHeaders(body ? { 'Content-Type': 'application/json' } : {})
  const res = await fetch(`${API}/api/auth${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  if (!json.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status })
  return json.data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [pending, setPending] = useState(false)
  /**
   * Distinct from `pending`, and the distinction matters.
   *
   * `pending` is "a sign-in is in flight". `ready` is "we have asked the server
   * who this is at least once". Without the second, ProtectedRoute sees a null
   * user on first render and redirects to the login page — so every refresh of
   * a signed-in page would bounce the user out before the answer arrived.
   */
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    call('/me')
      .then((data) => alive && setUser(data.user))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    setPending(true)
    try {
      const data = await call('/login', { method: 'POST', body: { email, password } })
      if (data?.token) setAuthToken(data.token)
      setUser(data.user)
      return data.user
    } finally {
      setPending(false)
    }
  }, [])

  const register = useCallback(async ({ email, password, name }) => {
    setPending(true)
    try {
      const data = await call('/register', { method: 'POST', body: { email, password, name } })
      if (data?.token) setAuthToken(data.token)
      setUser(data.user)
      return data.user
    } finally {
      setPending(false)
    }
  }, [])

  /**
   * Ends the session on the server, which is the part that counts — clearing
   * local state alone would leave a working cookie behind.
   */
  const signOut = useCallback(async () => {
    try {
      await call('/logout', { method: 'POST' })
    } finally {
      setAuthToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      pending,
      ready,
      signedIn: Boolean(user),
      // Derived here so components do not each reinvent it.
      initials: user ? (user.name || user.email).slice(0, 2).toUpperCase() : '',
      signIn,
      register,
      signOut,
    }),
    [user, pending, ready, signIn, register, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
