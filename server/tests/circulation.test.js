import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupApp, addBook } from './helpers.js'
import { createQrPayload } from '../src/lib/qr.js'

let n = 0
const borrower = () => {
  n += 1
  return { borrowerId: `RA2311003010${String(n).padStart(3, '0')}`, borrowerName: `Student ${n}`, borrowerContact: `student${n}@srmist.edu.in` }
}

describe('circulation desk', () => {
  let t
  const qrFor = (book) => createQrPayload(book.id, t.config.qrSecret)
  const issue = (book, who = borrower(), extra = {}) => t.librarian.post('/api/circulation/issue').send({ qr: qrFor(book), ...who, ...extra })

  beforeAll(async () => {
    t = await setupApp()
  })
  afterAll(() => t.close())

  describe('resolving a scan', () => {
    it('turns a label into the book and its open loans', async () => {
      const book = await addBook(t.librarian, { title: 'Dune' })
      const res = await t.librarian.post('/api/circulation/resolve').send({ qr: qrFor(book) }).expect(200)
      expect(res.body.book).toMatchObject({ id: book.id, title: 'Dune' })
      expect(res.body.activeLoans).toEqual([])
    })

    it('accepts a typed book id as a fallback', async () => {
      const book = await addBook(t.librarian)
      const res = await t.librarian.post('/api/circulation/resolve').send({ bookCode: book.code.toLowerCase() }).expect(200)
      expect(res.body.book.id).toBe(book.id)
    })

    it('rejects QR codes that are not our labels', async () => {
      const book = await addBook(t.librarian)
      const foreign = await t.librarian.post('/api/circulation/resolve').send({ qr: 'https://example.com/promo' }).expect(400)
      expect(foreign.body.error.code).toBe('INVALID_QR')

      const forged = createQrPayload(book.id, 'not-our-secret')
      const res = await t.librarian.post('/api/circulation/resolve').send({ qr: forged }).expect(400)
      expect(res.body.error.message).toMatch(/signature/i)
    })

    it('404s when the labelled book is gone', async () => {
      const book = await addBook(t.librarian)
      await t.librarian.delete(`/api/books/${book.id}`).expect(200)
      const res = await t.librarian.post('/api/circulation/resolve').send({ qr: qrFor(book) }).expect(404)
      expect(res.body.error.code).toBe('BOOK_NOT_FOUND')
    })

    it('needs exactly one of qr or bookCode', async () => {
      const book = await addBook(t.librarian)
      await t.librarian.post('/api/circulation/resolve').send({}).expect(400)
      await t.librarian.post('/api/circulation/resolve').send({ qr: qrFor(book), bookCode: book.code }).expect(400)
    })
  })

  describe('issuing', () => {
    it('takes a copy off the shelf, records the borrower and sets a due date', async () => {
      const book = await addBook(t.librarian, { totalCopies: 2 })
      const who = borrower()
      const res = await issue(book, who).expect(201)

      expect(res.body.book).toMatchObject({ availableCopies: 1, issuedCopies: 1, status: 'available' })
      const tx = res.body.transaction
      expect(tx).toMatchObject({
        status: 'issued',
        borrower: { id: who.borrowerId, name: who.borrowerName, contact: who.borrowerContact },
        book: { id: book.id, code: book.code },
        issuedBy: 'Leo Librarian',
        returnedAt: null,
        daysOverdue: 0,
      })
      const loanMs = new Date(tx.dueAt) - new Date(tx.issuedAt)
      expect(Math.round(loanMs / 86400000)).toBe(14)
    })

    it('uses a custom loan period when given', async () => {
      const book = await addBook(t.librarian)
      const res = await issue(book, borrower(), { loanDays: 7 }).expect(201)
      const tx = res.body.transaction
      expect(Math.round((new Date(tx.dueAt) - new Date(tx.issuedAt)) / 86400000)).toBe(7)
    })

    it('marks the book Issued once the last copy goes out', async () => {
      const book = await addBook(t.librarian, { totalCopies: 1 })
      const res = await issue(book).expect(201)
      expect(res.body.book).toMatchObject({ availableCopies: 0, status: 'issued' })
    })

    it('treats borrower ids case-insensitively and refuses a second copy to the same person', async () => {
      const book = await addBook(t.librarian, { totalCopies: 3 })
      await issue(book, { borrowerId: 'ra23x0001', borrowerName: 'Riya' }).expect(201)
      const res = await issue(book, { borrowerId: ' RA23X0001 ', borrowerName: 'Riya' }).expect(409)
      expect(res.body.error.code).toBe('ALREADY_BORROWED')
    })

    it('refuses when every copy is already out', async () => {
      const book = await addBook(t.librarian, { totalCopies: 1 })
      await issue(book).expect(201)
      const res = await issue(book).expect(409)
      expect(res.body.error.code).toBe('BOOK_UNAVAILABLE')

      const after = await t.librarian.get(`/api/books/${book.id}`).expect(200)
      expect(after.body.book.availableCopies).toBe(0)
    })

    it('enforces the per-borrower limit', async () => {
      const who = borrower()
      for (let i = 0; i < t.config.maxActiveLoans; i++) {
        await issue(await addBook(t.librarian), who).expect(201)
      }
      const res = await issue(await addBook(t.librarian), who).expect(409)
      expect(res.body.error.code).toBe('BORROWER_LIMIT_REACHED')
    })

    it('never hands out more copies than exist, even under a burst of requests', async () => {
      const book = await addBook(t.librarian, { totalCopies: 1 })
      const results = await Promise.all(Array.from({ length: 5 }, () => issue(book)))
      const statuses = results.map((r) => r.status).sort()
      expect(statuses).toEqual([201, 409, 409, 409, 409])

      const after = await t.librarian.get(`/api/books/${book.id}`).expect(200)
      expect(after.body.book.availableCopies).toBe(0)
      expect(after.body.activeLoans).toHaveLength(1)
    })

    it('validates borrower details', async () => {
      const book = await addBook(t.librarian)
      const res = await t.librarian.post('/api/circulation/issue').send({ qr: qrFor(book), borrowerId: 'X1' }).expect(400)
      expect(res.body.error.details.map((d) => d.field)).toContain('borrowerName')
      await issue(book, borrower(), { loanDays: 0 }).expect(400)
    })

    it('rejects a forged label without changing stock', async () => {
      const book = await addBook(t.librarian, { totalCopies: 1 })
      await t.librarian
        .post('/api/circulation/issue')
        .send({ qr: createQrPayload(book.id, 'forged'), ...borrower() })
        .expect(400)
      const after = await t.librarian.get(`/api/books/${book.id}`).expect(200)
      expect(after.body.book.availableCopies).toBe(1)
    })
  })

  describe('returning', () => {
    it('returns by scanning when only one copy is out', async () => {
      const book = await addBook(t.librarian, { totalCopies: 1 })
      await issue(book).expect(201)
      const res = await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book) }).expect(200)
      expect(res.body.transaction).toMatchObject({ status: 'returned', returnedBy: 'Leo Librarian', daysOverdue: 0, fine: 0 })
      expect(res.body.book).toMatchObject({ availableCopies: 1, status: 'available' })
    })

    it('refuses to return a book nobody has', async () => {
      const book = await addBook(t.librarian)
      const res = await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book) }).expect(409)
      expect(res.body.error.code).toBe('NOT_ISSUED')
    })

    it('asks whose copy it is when several are out, then accepts a borrower id', async () => {
      const book = await addBook(t.librarian, { totalCopies: 2 })
      const a = borrower()
      const b = borrower()
      await issue(book, a).expect(201)
      await issue(book, b).expect(201)

      const ambiguous = await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book) }).expect(409)
      expect(ambiguous.body.error.code).toBe('MULTIPLE_ACTIVE_LOANS')
      expect(ambiguous.body.error.details.loans.map((l) => l.borrower.id).sort()).toEqual([a.borrowerId, b.borrowerId].sort())

      const res = await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book), borrowerId: b.borrowerId }).expect(200)
      expect(res.body.transaction.borrower.id).toBe(b.borrowerId)

      const wrong = await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book), borrowerId: 'NOBODY1' }).expect(409)
      expect(wrong.body.error.code).toBe('NOT_ISSUED')
    })

    it('rejects returning the same transaction twice', async () => {
      const book = await addBook(t.librarian)
      const issued = await issue(book).expect(201)
      const id = issued.body.transaction.id
      await t.librarian.post('/api/circulation/return').send({ transactionId: id }).expect(200)
      const again = await t.librarian.post('/api/circulation/return').send({ transactionId: id }).expect(409)
      expect(again.body.error.code).toBe('ALREADY_RETURNED')
      await t.librarian.post('/api/circulation/return').send({ transactionId: 999999 }).expect(404)
    })

    it('reports how late a return was and the fine', async () => {
      const book = await addBook(t.librarian)
      const issued = await issue(book).expect(201)
      await t.db.query(
        `UPDATE transactions SET issued_at = now() - interval '17 days', due_at = now() - interval '3 days' + interval '1 hour' WHERE id = $1`,
        [issued.body.transaction.id],
      )
      const res = await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book) }).expect(200)
      expect(res.body.transaction).toMatchObject({ daysOverdue: 3, fine: 3 * t.config.finePerDay })
    })
  })

  describe('knock-on rules', () => {
    it('blocks deleting a book with copies out and archives one with history', async () => {
      const book = await addBook(t.librarian, { code: 'ARCH-001' })
      await issue(book).expect(201)
      const blocked = await t.librarian.delete(`/api/books/${book.id}`).expect(409)
      expect(blocked.body.error.code).toBe('BOOK_HAS_ACTIVE_LOANS')

      await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book) }).expect(200)
      const res = await t.librarian.delete(`/api/books/${book.id}`).expect(200)
      expect(res.body).toEqual({ deleted: true, archived: true })

      const history = await t.librarian.get('/api/transactions').query({ bookId: book.id }).expect(200)
      expect(history.body.items).toHaveLength(1)
      
      await addBook(t.librarian, { code: 'ARCH-001' })
    })

    it('will not drop total copies below the number out on loan', async () => {
      const book = await addBook(t.librarian, { totalCopies: 2 })
      await issue(book).expect(201)
      await issue(book).expect(201)
      const res = await t.librarian.patch(`/api/books/${book.id}`).send({ totalCopies: 1 }).expect(409)
      expect(res.body.error.code).toBe('COPIES_BELOW_ISSUED')

      const ok = await t.librarian.patch(`/api/books/${book.id}`).send({ totalCopies: 4 }).expect(200)
      expect(ok.body.book).toMatchObject({ totalCopies: 4, availableCopies: 2 })
    })

    it('suggests known borrowers for autocomplete', async () => {
      const book = await addBook(t.librarian)
      await issue(book, { borrowerId: 'EMP-4411', borrowerName: 'Kavya Iyer', borrowerContact: '98400 11111' }).expect(201)
      const res = await t.librarian.get('/api/circulation/borrowers').query({ q: 'kavya' }).expect(200)
      expect(res.body.borrowers[0]).toMatchObject({ id: 'EMP-4411', name: 'Kavya Iyer', activeLoans: 1 })
    })

    it('pushes live events to connected dashboards', async () => {
      const messages = []
      const unsubscribe = t.events.subscribe({ write: (m) => messages.push(m) })
      const book = await addBook(t.librarian)
      await issue(book).set('X-Client-Id', 'tab-42').expect(201)
      await t.librarian.post('/api/circulation/return').send({ qr: qrFor(book) }).expect(200)
      unsubscribe()

      const circulation = messages.filter((m) => m.startsWith('event: circulation')).map((m) => JSON.parse(m.split('data: ')[1]))
      expect(circulation).toHaveLength(2)
      
      expect(circulation[0]).toMatchObject({ action: 'issue', clientId: 'tab-42', by: 'Leo Librarian' })
      expect(circulation[1]).toMatchObject({ action: 'return', clientId: null })
    })
  })
})
