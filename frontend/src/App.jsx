import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
/**
 * Routes are split so a page only downloads what it needs.
 *
 * Everything used to arrive in one bundle, which meant a visitor reading the
 * landing page also downloaded the charting library, the trading terminal and
 * the agent — several hundred kilobytes to render marketing copy. Splitting
 * here costs one small request per navigation and takes the first paint well
 * below where it was.
 */
const Landing = lazy(() => import('./pages/Landing'))
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Markets = lazy(() => import('./pages/Markets'))
const Trading = lazy(() => import('./pages/Trading'))
const Macro = lazy(() => import('./pages/Macro'))
const Agent = lazy(() => import('./pages/Agent'))
const Backtest = lazy(() => import('./pages/Backtest'))
const Governance = lazy(() => import('./pages/Governance'))

import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { WalletProvider } from './context/WalletContext'
import { ToastProvider } from './context/ToastContext'
import { DemoProvider } from './context/DemoContext'
import { MarketProvider } from './context/MarketContext'
import { TradingProvider } from './context/TradingContext'
import { EpisodeProvider } from './context/EpisodeContext'

/** Shown while a route chunk downloads. Deliberately plain — a spinner that
 *  flashes for 80ms is worse than a calm placeholder. */
function RouteFallback() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-brand-400" />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <WalletProvider>
            <AuthProvider>
              <MarketProvider>
                <TradingProvider>
                  <EpisodeProvider>
                    <DemoProvider>
                      <Suspense fallback={<RouteFallback />}>
                      <Routes>
                      {/* Public. The landing page is the front door; login sits
                          outside Layout because it has its own chrome. */}
                      <Route index element={<Landing />} />
                      <Route path="login" element={<Login />} />

                      {/* Everything below needs a session. The dashboard moved
                          off "/" to make room for the landing page. */}
                      <Route element={<ProtectedRoute />}>
                        <Route element={<Layout />}>
                          <Route path="dashboard" element={<Dashboard />} />
                          <Route path="markets" element={<Markets />} />
                          <Route path="trading" element={<Trading />} />
                          <Route path="agent" element={<Agent />} />
                          <Route path="backtest" element={<Backtest />} />
                          <Route path="governance" element={<Governance />} />
                          <Route path="macro" element={<Macro />} />
                        </Route>
                      </Route>

                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    </Suspense>
                  </DemoProvider>
                </EpisodeProvider>
              </TradingProvider>
            </MarketProvider>
          </AuthProvider>
        </WalletProvider>
      </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
