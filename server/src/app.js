import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { requireAuth, requireRole } from './middleware/auth.js'
import { errorHandler, apiNotFound } from './middleware/errors.js'
import { createEventBus } from './services/events.js'
import { authRouter } from './routes/auth.js'
import { staffRouter } from './routes/staff.js'
import { booksRouter } from './routes/books.js'
import { circulationRouter } from './routes/circulation.js'
import { transactionsRouter } from './routes/transactions.js'
import { dashboardRouter, eventsHandler } from './routes/dashboard.js'
import { aiRouter } from './routes/ai.js'

export function createApp({ db, config, ai = null, events = createEventBus(), clientDist = null }) {
  const app = express()
  app.disable('x-powered-by')
  
  if (config.isProd) app.set('trust proxy', 1)

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          
          'worker-src': ["'self'", 'blob:'],
          'img-src': ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  )
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  const auth = requireAuth(db, config)
  const deps = { db, config, ai, events }

  
  app.get('/api/health', (req, res) => res.json({ ok: true, demo: Boolean(config.seedDemo) }))
  app.use('/api/auth', authRouter(deps))
  app.get('/api/settings', auth, (req, res) => {
    const { loanDays, maxActiveLoans, finePerDay, reportTimeZone } = config
    res.json({ loanDays, maxActiveLoans, finePerDay, reportTimeZone })
  })
  app.use('/api/staff', auth, requireRole('admin'), staffRouter(deps))
  app.use('/api/books', auth, booksRouter(deps))
  app.use('/api/circulation', auth, circulationRouter(deps))
  app.use('/api/transactions', auth, transactionsRouter(deps))
  app.use('/api/dashboard', auth, dashboardRouter(deps))
  app.use('/api/ai', auth, aiRouter(deps))
  app.get('/api/events', auth, eventsHandler(events))
  app.use('/api', apiNotFound)

  
  
  if (clientDist && existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(clientDist, 'index.html')) : next()))
  }

  app.use(errorHandler(config))
  return app
}
