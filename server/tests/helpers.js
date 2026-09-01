import request from 'supertest'
import { createDb, migrate } from '../src/db/index.js'
import { createApp } from '../src/app.js'
import { createStaff } from '../src/services/staff.js'
import { createEventBus } from '../src/services/events.js'

export const testConfig = Object.freeze({
  env: 'test',
  isProd: false,
  jwtSecret: 'test-jwt-secret',
  qrSecret: 'test-qr-secret',
  loanDays: 14,
  maxActiveLoans: 3,
  finePerDay: 5,
  bcryptRounds: 4,
  loginRateLimit: 50,
  reportTimeZone: 'UTC',
  cookieSecure: false,
})

export const ADMIN = { name: 'Asha Admin', email: 'admin@test.dev', password: 'admin-pass-1', role: 'admin' }
export const LIBRARIAN = { name: 'Leo Librarian', email: 'librarian@test.dev', password: 'librarian-pass-1', role: 'librarian' }



export async function setupApp({ ai, config } = {}) {
  const db = await createDb()
  await migrate(db)
  const cfg = { ...testConfig, ...config }
  const events = createEventBus()
  const app = createApp({ db, config: cfg, ai, events })

  await createStaff(db, ADMIN, cfg.bcryptRounds)
  await createStaff(db, LIBRARIAN, cfg.bcryptRounds)

  const login = async ({ email, password }) => {
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email, password }).expect(200)
    return agent
  }

  return {
    db,
    app,
    events,
    config: cfg,
    anon: request(app),
    admin: await login(ADMIN),
    librarian: await login(LIBRARIAN),
    close: () => db.close(),
  }
}

let counter = 0
export const bookInput = (overrides = {}) => ({
  code: `T-${++counter}-${Math.random().toString(36).slice(2, 7)}`,
  title: 'Test Book',
  author: 'Test Author',
  category: 'Testing',
  totalCopies: 2,
  ...overrides,
})

export async function addBook(agent, overrides) {
  const res = await agent.post('/api/books').send(bookInput(overrides)).expect(201)
  return res.body.book
}
