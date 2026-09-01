import { describe, it, expect, afterAll } from 'vitest'
import { rmSync } from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import { loadConfig } from '../src/config.js'
import { createDb, migrate } from '../src/db/index.js'
import { ensureStarterData, DEMO_ACCOUNTS } from '../src/seed.js'
import { setupApp, LIBRARIAN } from './helpers.js'

const TMP = path.resolve(import.meta.dirname, '../data/test-tmp')
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('config', () => {
  it('refuses to start in production without secrets', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET and QR_SECRET/)
  })

  it('generates dev secrets once and reuses them', () => {
    const a = loadConfig({ DATA_DIR: TMP })
    const b = loadConfig({ DATA_DIR: TMP })
    expect(a.jwtSecret).toHaveLength(64)
    expect(b.jwtSecret).toBe(a.jwtSecret)
    expect(b.qrSecret).toBe(a.qrSecret)
  })

  it('reads settings from the environment', () => {
    const config = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'j', QR_SECRET: 'q', PORT: '8080', LOAN_DAYS: '7', SEED_DEMO: 'true' })
    expect(config).toMatchObject({ isProd: true, port: 8080, loanDays: 7, cookieSecure: true, seedDemo: true, reportTimeZone: 'Asia/Kolkata' })
  })

  it('rejects an invalid time zone', () => {
    expect(() => loadConfig({ DATA_DIR: TMP, REPORT_TIMEZONE: 'Mars/Olympus' })).toThrow(/time zone/)
  })
})

describe('starter data', () => {
  const quiet = () => {}
  const base = { bcryptRounds: 4, loanDays: 14, maxActiveLoans: 5, finePerDay: 5, qrSecret: 'q', reportTimeZone: 'UTC', admin: {} }

  it('seeds a realistic demo library once', async () => {
    const db = await createDb()
    await migrate(db)
    try {
      await ensureStarterData(db, { ...base, seedDemo: true }, quiet)
      const count = async (sql) => (await db.query(sql)).rows[0].n
      expect(await count('SELECT count(*)::int AS n FROM books')).toBeGreaterThan(20)
      expect(await count('SELECT count(*)::int AS n FROM transactions WHERE returned_at IS NULL AND due_at < now()')).toBeGreaterThanOrEqual(2)
      expect(await count('SELECT count(*)::int AS n FROM transactions WHERE returned_at IS NOT NULL')).toBeGreaterThanOrEqual(4)

      await ensureStarterData(db, { ...base, seedDemo: true }, quiet)
      expect(await count('SELECT count(*)::int AS n FROM staff')).toBe(DEMO_ACCOUNTS.length)
    } finally {
      await db.close()
    }
  })

  it('creates just the admin from env in production', async () => {
    const db = await createDb()
    await migrate(db)
    try {
      await ensureStarterData(db, { ...base, seedDemo: false, admin: { name: 'Head', email: 'head@lib.dev', password: 'strong-pass-1' } }, quiet)
      const { rows } = await db.query('SELECT email, role FROM staff')
      expect(rows).toEqual([{ email: 'head@lib.dev', role: 'admin' }])
    } finally {
      await db.close()
    }
  })
})

describe('live updates stream', () => {
  it('streams events to signed-in clients over SSE', async () => {
    const t = await setupApp()
    const server = t.app.listen(0)
    const controller = new AbortController()
    try {
      const login = await request(t.app).post('/api/auth/login').send({ email: LIBRARIAN.email, password: LIBRARIAN.password })
      const cookie = login.headers['set-cookie'][0].split(';')[0]
      const url = `http://127.0.0.1:${server.address().port}/api/events`

      expect((await fetch(url, { signal: controller.signal })).status).toBe(401)

      const res = await fetch(url, { headers: { cookie }, signal: controller.signal })
      expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      expect(decoder.decode((await reader.read()).value)).toContain('retry: 5000')

      t.events.publish('circulation', { action: 'issue' })
      expect(decoder.decode((await reader.read()).value)).toContain('event: circulation')
    } finally {
      controller.abort()
      server.closeAllConnections()
      server.close()
      await t.close()
    }
  })
})
