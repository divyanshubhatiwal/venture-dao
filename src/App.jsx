import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { WalletProvider } from './context/WalletContext'
import { ToastProvider } from './context/ToastContext'
import { DemoProvider } from './context/DemoContext'
import { MarketProvider } from './context/MarketContext'
import { TradingProvider } from './context/TradingContext'
import { EpisodeProvider } from './context/EpisodeContext'
import Dashboard from './pages/Dashboard'
import Markets from './pages/Markets'
import Trading from './pages/Trading'
import Macro from './pages/Macro'
import Agent from './pages/Agent'
import Landing from './pages/Landing'
import Login from './pages/Login'

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <WalletProvider>
          <AuthProvider>
            <MarketProvider>
              <TradingProvider>
                <EpisodeProvider>
                  <DemoProvider>
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
                          <Route path="macro" element={<Macro />} />
                          <Route path="agent" element={<Agent />} />
                        </Route>
                      </Route>

                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </DemoProvider>
                </EpisodeProvider>
              </TradingProvider>
            </MarketProvider>
          </AuthProvider>
        </WalletProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
