import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Gate for the app routes. This hides pages, it does not secure them — the
 * code behind it is already in the bundle either way. See AuthContext for why
 * that is acceptable here and what would have to change before it isn't.
 *
 * The attempted path rides along in location state so a deep link survives the
 * detour through /login instead of dumping the user on the dashboard.
 */
export default function ProtectedRoute() {
  const { signedIn } = useAuth()
  const location = useLocation()

  if (!signedIn) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
