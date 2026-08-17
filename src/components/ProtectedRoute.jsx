import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Gate for anything that needs a session.
 *
 * It waits for `ready` before deciding. The server is the only thing that
 * knows whether the session cookie is valid, and asking takes a round trip —
 * redirecting on the null user we hold before that answer arrives would throw
 * a signed-in user back to the login page on every page refresh.
 *
 * Worth being clear about what this is and is not: it decides what to *render*.
 * It is not a security boundary — every protected page is still in the
 * JavaScript bundle. The boundary is the server, which checks the session
 * cookie on each request and answers 401 without one.
 */
export default function ProtectedRoute() {
  const { signedIn, ready } = useAuth()
  const location = useLocation()

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-brand-400" />
      </div>
    )
  }

  if (!signedIn) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
