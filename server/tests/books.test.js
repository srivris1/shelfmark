import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp, bookInput, addBook } from './helpers.js'

describe('books API', () => {
  let t
  beforeAll(async () => {
    t = await setupApp()
  })
  afterAll(() => t.close())

  it('creates a book with every copy on the shelf', async () => {
    const res = await t.librarian
      .post('/api/books')
      .send(bookInput({ title: 'Clean Code', author: 'Robert C. Martin', category: 'Technology', totalCopies: 3 }))
      .expect(201)

    expect(res.body.book).toMatchObject({
      title: 'Clean Code',
      totalCopies: 3,
      availableCopies: 3,
      issuedCopies: 0,
      status: 'available',
    })
    expect(res.body.book.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('normalises ISBNs and refuses duplicates', async () => {
    const first = await t.librarian.post('/api/books').send(bookInput({ code: '978-0-13-235088-4' })).expect(201)
    expect(first.body.book.code).toBe('9780132350884')

    const dup = await t.librarian.post('/api/books').send(bookInput({ code: '9780132350884' })).expect(409)
    expect(dup.body.error.code).toBe('DUPLICATE_BOOK_CODE')
  })

  it('treats custom book ids case-insensitively', async () => {
    await t.librarian.post('/api/books').send(bookInput({ code: 'REF-777' })).expect(201)
    await t.librarian.post('/api/books').send(bookInput({ code: 'ref-777' })).expect(409)
  })

  it('explains what is wrong with a bad form', async () => {
    const res = await t.librarian
      .post('/api/books')
      .send({ code: 'OK-1', title: '  ', author: 'Someone', category: 'Misc', totalCopies: 0 })
      .expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['title', 'totalCopies']))
  })

  it('rejects an ISBN with a bad check digit', async () => {
    const res = await t.librarian.post('/api/books').send(bookInput({ code: '9780132350885' })).expect(400)
    expect(res.body.error.code).toBe('INVALID_ISBN')
  })

  it('searches and filters the catalogue', async () => {
    await addBook(t.librarian, { title: 'The Hobbit', author: 'J.R.R. Tolkien', category: 'Fantasy', totalCopies: 1 })
    await addBook(t.librarian, { title: 'The Silmarillion', author: 'J.R.R. Tolkien', category: 'Fantasy', totalCopies: 1 })
    await addBook(t.librarian, { title: 'Sapiens', author: 'Yuval Noah Harari', category: 'History', totalCopies: 1 })

    const byText = await t.librarian.get('/api/books').query({ q: 'hobb' }).expect(200)
    expect(byText.body.items.map((b) => b.title)).toEqual(['The Hobbit'])

    const byAuthor = await t.librarian.get('/api/books').query({ author: 'tolkien' }).expect(200)
    expect(byAuthor.body.total).toBe(2)

    const byCategory = await t.librarian.get('/api/books').query({ category: 'history' }).expect(200)
    expect(byCategory.body.items.map((b) => b.title)).toEqual(['Sapiens'])

    const byTitle = await t.librarian.get('/api/books').query({ title: 'silm' }).expect(200)
    expect(byTitle.body.items).toHaveLength(1)
  })

  it('accepts comma-separated keywords that must all match (used by smart search)', async () => {
    const res = await t.librarian.get('/api/books').query({ keywords: 'the, tolkien' }).expect(200)
    expect(res.body.items.map((b) => b.title).sort()).toEqual(['The Hobbit', 'The Silmarillion'])
    const none = await t.librarian.get('/api/books').query({ keywords: 'hobbit,sapiens' }).expect(200)
    expect(none.body.total).toBe(0)
  })

  it('matches keywords loosely, so "hobbits" still finds The Hobbit', async () => {
    const res = await t.librarian.get('/api/books').query({ keywords: 'hobbits' }).expect(200)
    expect(res.body.items.map((b) => b.title)).toEqual(['The Hobbit'])
  })

  it('does not treat % and _ in a search as wildcards', async () => {
    const res = await t.librarian.get('/api/books').query({ q: '%' }).expect(200)
    expect(res.body.total).toBe(0)
  })

  it('filters by availability', async () => {
    const book = await addBook(t.librarian, { title: 'Checked Out Everywhere', totalCopies: 1 })
    await t.db.query('UPDATE books SET available_copies = 0 WHERE id = $1', [book.id])

    const issued = await t.librarian.get('/api/books').query({ availability: 'issued' }).expect(200)
    expect(issued.body.items.map((b) => b.id)).toContain(book.id)
    expect(issued.body.items.every((b) => b.status === 'issued')).toBe(true)

    const available = await t.librarian.get('/api/books').query({ availability: 'available' }).expect(200)
    expect(available.body.items.map((b) => b.id)).not.toContain(book.id)
  })

  it('paginates', async () => {
    const res = await t.librarian.get('/api/books').query({ pageSize: 2, page: 1 }).expect(200)
    expect(res.body.items).toHaveLength(2)
    expect(res.body.total).toBeGreaterThan(2)
    expect(res.body.pageSize).toBe(2)
  })

  it('lists categories with counts', async () => {
    const res = await t.librarian.get('/api/books/categories').expect(200)
    expect(res.body.categories).toEqual(expect.arrayContaining([{ name: 'Fantasy', count: 2 }]))
  })

  it('returns 404 for an unknown book and 400 for a malformed id', async () => {
    await t.librarian.get('/api/books/00000000-0000-4000-8000-000000000000').expect(404)
    const bad = await t.librarian.get('/api/books/not-a-uuid').expect(400)
    expect(bad.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('shows a book with its (empty) loan history', async () => {
    const book = await addBook(t.librarian)
    const res = await t.librarian.get(`/api/books/${book.id}`).expect(200)
    expect(res.body.book.id).toBe(book.id)
    expect(res.body.activeLoans).toEqual([])
    expect(res.body.history).toEqual([])
  })

  it('updates details and copy counts', async () => {
    const book = await addBook(t.librarian, { totalCopies: 2 })
    const res = await t.librarian.patch(`/api/books/${book.id}`).send({ title: 'Renamed', totalCopies: 5 }).expect(200)
    expect(res.body.book).toMatchObject({ title: 'Renamed', totalCopies: 5, availableCopies: 5 })

    await t.librarian.patch(`/api/books/${book.id}`).send({}).expect(400)
  })

  it('serves a signed QR label as PNG or SVG', async () => {
    const book = await addBook(t.librarian)
    const png = await t.librarian.get(`/api/books/${book.id}/qr`).expect(200)
    expect(png.headers['content-type']).toBe('image/png')
    expect(png.body.subarray(0, 4).toString('hex')).toBe('89504e47')

    const svg = await t.librarian.get(`/api/books/${book.id}/qr`).query({ format: 'svg', download: '1' }).expect(200)
    expect(svg.headers['content-type']).toMatch(/image\/svg\+xml/)
    expect(svg.headers['content-disposition']).toMatch(/attachment; filename=".+-qr\.svg"/)
    expect(svg.text ?? svg.body.toString()).toContain('<svg')
  })

  it('hard-deletes a book that was never borrowed', async () => {
    const book = await addBook(t.librarian)
    const res = await t.librarian.delete(`/api/books/${book.id}`).expect(200)
    expect(res.body).toEqual({ deleted: true, archived: false })
    await t.librarian.get(`/api/books/${book.id}`).expect(404)
  })
})
