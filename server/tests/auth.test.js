import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { setupApp, LIBRARIAN } from './helpers.js'

describe('authentication', () => {
  let t
  beforeAll(async () => {
    t = await setupApp()
  })
  afterAll(() => t.close())

  it('signs in and sets an httpOnly session cookie', async () => {
    const res = await t.anon
      .post('/api/auth/login')
      .send({ email: '  LIBRARIAN@test.dev ', password: LIBRARIAN.password })
      .expect(200)

    expect(res.body.user).toMatchObject({ email: 'librarian@test.dev', role: 'librarian', name: 'Leo Librarian' })
    expect(res.body.user.passwordHash).toBeUndefined()
    expect(res.body.user.password_hash).toBeUndefined()

    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toMatch(/^shelfmark_session=/)
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it('gives the same answer for an unknown email and a wrong password', async () => {
    const unknown = await t.anon.post('/api/auth/login').send({ email: 'nobody@test.dev', password: 'whatever-123' }).expect(401)
    const wrong = await t.anon.post('/api/auth/login').send({ email: 'admin@test.dev', password: 'wrong-pass-1' }).expect(401)
    expect(unknown.body.error.message).toBe(wrong.body.error.message)
  })

  it('validates the login form', async () => {
    const res = await t.anon.post('/api/auth/login').send({ email: 'not-an-email' }).expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'password']))
  })

  it('rejects malformed JSON bodies cleanly', async () => {
    const res = await t.anon.post('/api/auth/login').set('Content-Type', 'application/json').send('{"email":').expect(400)
    expect(res.body.error.code).toBe('BAD_JSON')
  })

  it('returns the signed-in user', async () => {
    const res = await t.librarian.get('/api/auth/me').expect(200)
    expect(res.body.user.email).toBe('librarian@test.dev')
  })

  it('blocks the API without a session', async () => {
    await t.anon.get('/api/books').expect(401)
    await t.anon.get('/api/auth/me').expect(401)
  })

  it('rejects a forged session token', async () => {
    await t.anon.get('/api/books').set('Cookie', 'shelfmark_session=abc.def.ghi').expect(401)
  })

  it('signs out', async () => {
    const agent = request.agent(t.app)
    await agent.post('/api/auth/login').send({ email: LIBRARIAN.email, password: LIBRARIAN.password }).expect(200)
    await agent.post('/api/auth/logout').expect(204)
    await agent.get('/api/auth/me').expect(401)
  })

  it('exposes a public health check that says whether demo logins exist', async () => {
    const res = await t.anon.get('/api/health').expect(200)
    expect(res.body).toEqual({ ok: true, demo: false })
  })

  it('shares the library rules with signed-in staff', async () => {
    await t.anon.get('/api/settings').expect(401)
    const res = await t.librarian.get('/api/settings').expect(200)
    expect(res.body).toEqual({ loanDays: 14, maxActiveLoans: 3, finePerDay: 5, reportTimeZone: 'UTC' })
  })

  it('returns JSON 404s for unknown API routes', async () => {
    const res = await t.librarian.get('/api/nope').expect(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

describe('login rate limit', () => {
  it('slows down password guessing', async () => {
    const t = await setupApp({ config: { loginRateLimit: 3 } })
    try {
      
      await t.anon.post('/api/auth/login').send({ email: 'admin@test.dev', password: 'guess-1234' }).expect(401)
      const res = await t.anon.post('/api/auth/login').send({ email: 'admin@test.dev', password: 'guess-5678' }).expect(429)
      expect(res.body.error.code).toBe('TOO_MANY_ATTEMPTS')
    } finally {
      await t.close()
    }
  })
})

describe('staff management', () => {
  let t
  beforeAll(async () => {
    t = await setupApp()
  })
  afterAll(() => t.close())

  it('is admin-only', async () => {
    await t.librarian.get('/api/staff').expect(403)
    const res = await t.admin.get('/api/staff').expect(200)
    expect(res.body.staff).toHaveLength(2)
  })

  it('lets an admin add a librarian who can then sign in', async () => {
    const res = await t.admin
      .post('/api/staff')
      .send({ name: 'Meera Nair', email: 'meera@test.dev', password: 'meera-pass-1', role: 'librarian' })
      .expect(201)
    expect(res.body.staff).toMatchObject({ name: 'Meera Nair', role: 'librarian' })

    await t.anon.post('/api/auth/login').send({ email: 'meera@test.dev', password: 'meera-pass-1' }).expect(200)
  })

  it('rejects duplicate emails and weak passwords', async () => {
    const dup = await t.admin
      .post('/api/staff')
      .send({ name: 'Again', email: 'MEERA@test.dev', password: 'another-pass-1', role: 'librarian' })
      .expect(409)
    expect(dup.body.error.code).toBe('EMAIL_TAKEN')

    const weak = await t.admin.post('/api/staff').send({ name: 'Weak', email: 'weak@test.dev', password: '123', role: 'librarian' }).expect(400)
    expect(weak.body.error.details[0].field).toBe('password')
  })

  it('does not let an admin delete their own account', async () => {
    const me = await t.admin.get('/api/auth/me')
    const res = await t.admin.delete(`/api/staff/${me.body.user.id}`).expect(409)
    expect(res.body.error.code).toBe('CANNOT_DELETE_SELF')
  })

  it('lets an admin remove a librarian', async () => {
    const created = await t.admin
      .post('/api/staff')
      .send({ name: 'Temp', email: 'temp@test.dev', password: 'temp-pass-12', role: 'librarian' })
      .expect(201)
    await t.admin.delete(`/api/staff/${created.body.staff.id}`).expect(204)
    await t.admin.delete(`/api/staff/${created.body.staff.id}`).expect(404)
  })
})
