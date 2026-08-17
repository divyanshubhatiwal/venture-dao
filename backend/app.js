import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { sessionMiddleware } from './middleware/authMiddleware.js'
import authRoutes from './routes/authRoutes.js'
import botRoutes from './routes/botRoutes.js'
import venueRoutes from './routes/venueRoutes.js'
import newsRoutes from './routes/newsRoutes.js'
import proxyRoutes from './routes/proxyRoutes.js'

/**
 * VentureDAO Express Application.
 *
 * Configures CORS, JSON body parser, session authentication middleware,
 * and mounts domain routers.
 */
export function createApp() {
  const app = express()

  app.use(express.json({ limit: '256kb' }))
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))
  app.use(sessionMiddleware)

  // Health endpoint
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, service: 'venturedao-backend', at: new Date().toISOString() }),
  )

  // Domain Routers
  app.use('/api/auth', authRoutes)
  app.use('/api/bot', botRoutes)
  app.use('/api/venues', venueRoutes)
  app.use('/api/news', newsRoutes)
  app.use('/yf', proxyRoutes)

  return app
}

export default createApp
