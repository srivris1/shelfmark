import { describe, it, expect, vi, afterEach } from 'vitest'
import { dueLabel, plural, relativeTime, rupees, stampDate } from './format'
import { api, ApiError, toQuery } from './api'
import { createScanGate } from './scanGate'

const NOW = new Date('2026-09-11T10:00:00Z')

describe('formatting', () => {
  it('pluralises', () => {
    expect(plural(1, 'copy', 'copies')).toBe('1 copy')
    expect(plural(3, 'copy', 'copies')).toBe('3 copies')
  })

  it('describes how long ago something happened', () => {
    expect(relativeTime('2026-09-11T09:59:40Z', NOW)).toBe('just now')
    expect(relativeTime('2026-09-11T09:55:00Z', NOW)).toBe('5 minutes ago')
    expect(relativeTime('2026-09-09T10:00:00Z', NOW)).toBe('2 days ago')
  })

  it('labels due dates the way a librarian says them', () => {
    expect(dueLabel({ dueAt: '2026-09-11T18:00:00Z', returnedAt: null, daysOverdue: 0 }, NOW)).toBe('Due today')
    expect(dueLabel({ dueAt: '2026-09-12T12:00:00Z', returnedAt: null, daysOverdue: 0 }, NOW)).toBe('Due tomorrow')
    expect(dueLabel({ dueAt: '2026-09-15T10:00:00Z', returnedAt: null, daysOverdue: 0 }, NOW)).toBe('Due in 4 days')
    expect(dueLabel({ dueAt: '2026-09-01T10:00:00Z', returnedAt: null, daysOverdue: 10 }, NOW)).toBe('10 days late')
    expect(dueLabel({ dueAt: '2026-09-01T10:00:00Z', returnedAt: '2026-09-02T10:00:00Z', daysOverdue: 1 }, NOW)).toBe('Returned 1 day late')
    expect(dueLabel({ dueAt: '2026-09-01T10:00:00Z', returnedAt: '2026-08-30T10:00:00Z', daysOverdue: 0 }, NOW)).toBe('Returned on time')
  })

  it('formats rupees and stamp dates', () => {
    expect(rupees(55)).toBe('₹55')
    expect(stampDate('2026-09-25T10:00:00Z')).toMatch(/^2[56] SEP 2026$/)
  })
})

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('builds query strings without empty values', () => {
    expect(toQuery({ q: 'dune', page: 2, category: '', status: undefined, x: null })).toBe('q=dune&page=2')
  })

  it('sends JSON and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(api('/books', { method: 'POST', body: { title: 'Dune' } })).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/books')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['X-Client-Id']).toMatch(/.{8,}/)
  })

  it("surfaces the server's own error message and code", async () => {
    const body = { error: { code: 'BOOK_UNAVAILABLE', message: 'All 2 copies of "Dune" are out on loan right now.' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 409 })))
    const err = await api('/circulation/issue', { method: 'POST', body: {} }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 409, code: 'BOOK_UNAVAILABLE', message: body.error.message })
  })

  it('turns a network failure into a readable error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(api('/books')).rejects.toMatchObject({ status: 0, code: 'NETWORK' })
  })
})

describe('scan gate', () => {
  it('ignores the same label while it is still in front of the camera', () => {
    let clock = 0
    const gate = createScanGate(2500, () => clock)
    expect(gate.accept('A')).toBe(true)
    clock = 1000
    expect(gate.accept('A')).toBe(false)
    expect(gate.accept('B')).toBe(true)
    clock = 4000
    expect(gate.accept('A')).toBe(true)
  })
})
