import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { unauthorized } from '../lib/errors.js'
import { parse, emailField } from '../lib/validate.js'
import { verifyLogin } from '../services/staff.js'
import { requireAuth, startSession, endSession } from '../middleware/auth.js'

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required').max(200),
})

export function authRouter({ db, config }) {
  const router = Router()

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many sign-in attempts. Wait a few minutes and try again.' } }),
  })

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = parse(loginSchema, req.body)
    const user = await verifyLogin(db, email, password)
    if (!user) throw unauthorized('Email or password is incorrect.')
    startSession(res, user, config)
    res.json({ user })
  })

  router.post('/logout', (req, res) => {
    endSession(res, config)
    res.status(204).end()
  })

  router.get('/me', requireAuth(db, config), (req, res) => res.json({ user: req.user }))

  return router
}
