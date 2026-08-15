import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Client-side session.
 *
 * READ THIS BEFORE TRUSTING IT WITH ANYTHING: this is not authentication. It
 * stores a profile in localStorage and treats its presence as "signed in".
 * Anyone can forge it from the devtools console in about five seconds, and
 * every route it "protects" is still fully present in the JavaScript bundle.
 *
 * That is acceptable here because nothing behind the login is a secret — the
 * pages read public market data and drive a paper account. The one genuinely
 * sensitive thing in this project, the Delta API secret, is deliberately not
 * behind this gate: it lives in the backend process and never reaches the
 * browser at all. See server/delta.js.
 *
 * Real auth means a backend that issues a signed, httpOnly, short-lived
 * session cookie and re-checks it on every privileged request — the server
 * deciding, not the client asserting. If live trading is ever enabled, that
 * work is a prerequisite, not a nice-to-have: at that point the login is what
 * stands between a stranger and someone else's money.
 */

const AuthContext = createContext(null)
const STORAGE_KEY = 'venturedao.session'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Deterministic initials so the avatar is stable across reloads. */
function initialsOf(name = '', email = '') {
  const source = name.trim() || email.split('@')[0] || '?'
  const parts = source.split(/[\s._-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : source.slice(0, 2)).toUpperCase()
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Ignore anything that does not look like a session we wrote, rather than
    // rendering a half-built user object into the header.
    return parsed && typeof parsed.email === 'string' ? parsed : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredSession)
  const [pending, setPending] = useState(false)

  // Signing out in one tab should sign out the others. This is a courtesy for
  // shared machines, not a security boundary.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setUser(readStoredSession())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const persist = useCallback((next) => {
    setUser(next)
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private browsing modes reject writes. The session still works for this
      // tab; it just will not survive a reload.
    }
  }, [])

  /**
   * There is no credential check because there is no server to check against.
   * The form validates shape only — enough to catch typos, not enough to
   * establish identity, and the UI says so plainly rather than implying a
   * security guarantee it cannot provide.
   */
  const signIn = useCallback(
    async ({ email, name = '' }) => {
      setPending(true)
      try {
        const profile = {
          email: email.trim().toLowerCase(),
          name: name.trim() || email.trim().split('@')[0],
          method: 'local',
          initials: initialsOf(name, email),
          since: new Date().toISOString(),
        }
        persist(profile)
        return profile
      } finally {
        setPending(false)
      }
    },
    [persist],
  )

  /**
   * Wallet sign-in. Note this proves possession of an address only in the
   * loosest sense — it does not request a signature, so it does not prove
   * control of the private key. A real implementation is Sign-In With Ethereum
   * (EIP-4361): the server issues a nonce, the wallet signs it, the server
   * recovers the address and verifies it matches.
   */
  const signInWithWallet = useCallback(
    async (address, { demo = false } = {}) => {
      setPending(true)
      try {
        const profile = {
          email: `${address.slice(0, 6).toLowerCase()}@wallet.local`,
          name: `${address.slice(0, 6)}…${address.slice(-4)}`,
          method: demo ? 'wallet-demo' : 'wallet',
          address,
          initials: address.slice(2, 4).toUpperCase(),
          since: new Date().toISOString(),
        }
        persist(profile)
        return profile
      } finally {
        setPending(false)
      }
    },
    [persist],
  )

  const signOut = useCallback(() => persist(null), [persist])

  const value = useMemo(
    () => ({ user, pending, signedIn: Boolean(user), signIn, signInWithWallet, signOut }),
    [user, pending, signIn, signInWithWallet, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
