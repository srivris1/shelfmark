import jwt from 'jsonwebtoken'
import { forbidden, unauthorized } from '../lib/errors.js'
import { findStaffById } from '../services/staff.js'

export const SESSION_COOKIE = 'shelfmark_session'
const SESSION_HOURS = 8

export const cookieOptions = (config) => ({
  httpOnly: true, 
  sameSite: 'lax',
  secure: config.cookieSecure,
  path: '/',
})

export function startSession(res, user, config) {
  const token = jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: `${SESSION_HOURS}h`,
  })
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(config), maxAge: SESSION_HOURS * 60 * 60 * 1000 })
}

export const endSession = (res, config) => res.clearCookie(SESSION_COOKIE, cookieOptions(config))



export function requireAuth(db, config) {
  return async (req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE]
    if (!token) throw unauthorized()

    let payload
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] })
    } catch {
      throw unauthorized('Your session has expired. Please sign in again.')
    }

    const user = await findStaffById(db, Number(payload.sub))
    if (!user) throw unauthorized()
    req.user = user
    next()
  }
}

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) throw forbidden()
    next()
  }
