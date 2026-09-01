import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import ExcelJS from 'exceljs'
import { setupApp, addBook } from './helpers.js'
import { createQrPayload } from '../src/lib/qr.js'

const binary = (res, callback) => {
  const chunks = []
  res.on('data', (chunk) => chunks.push(chunk))
  res.on('end', () => callback(null, Buffer.concat(chunks)))
}

const CSV_HEADER =
  'Book Title,Author,Book ID,Issued To (User ID),Issued To (Name),Issue Timestamp,Due Date,Return Timestamp,Current Status,Days Overdue'

describe('transactions, exports and the dashboard', () => {
  let t
  let ids

  beforeAll(async () => {
    t = await setupApp()
    const qr = (book) => createQrPayload(book.id, t.config.qrSecret)
    const issue = async (book, borrowerId, borrowerName) =>
      (await t.librarian.post('/api/circulation/issue').send({ qr: qr(book), borrowerId, borrowerName }).expect(201)).body.transaction

    const dune = await addBook(t.librarian, { title: 'Dune', author: 'Frank Herbert', category: 'Science Fiction', code: 'SF-001', totalCopies: 2 })
    const hobbit = await addBook(t.librarian, { title: 'The Hobbit', author: 'J.R.R. Tolkien', category: 'Fantasy', code: 'FAN-001', totalCopies: 1 })
    const gatsby = await addBook(t.librarian, { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', category: 'Fiction', code: 'FIC-001', totalCopies: 1 })

    const onTime = await issue(dune, 'RA001', 'Aarav Mehta')
    const late = await issue(hobbit, 'RA002', 'Diya Rao')
    const returned = await issue(gatsby, 'RA003', '=HYPERLINK("http://evil.example")')
    await t.librarian.post('/api/circulation/return').send({ transactionId: returned.id }).expect(200)

    await t.db.query(
      `UPDATE transactions SET issued_at = '2026-01-10T09:00:00Z', due_at = '2026-01-24T09:00:00Z' WHERE id = $1`,
      [late.id],
    )
    ids = { onTime: onTime.id, late: late.id, returned: returned.id }
  })
  afterAll(() => t.close())

  describe('history', () => {
    it('lists every transaction, newest first', async () => {
      const res = await t.librarian.get('/api/transactions').expect(200)
      expect(res.body.total).toBe(3)
      expect(res.body.items[res.body.items.length - 1].id).toBe(ids.late)
    })

    it('filters by status', async () => {
      const get = async (status) => (await t.librarian.get('/api/transactions').query({ status }).expect(200)).body.items
      expect((await get('issued')).map((x) => x.id)).toEqual([ids.onTime])
      expect((await get('returned')).map((x) => x.id)).toEqual([ids.returned])
      expect((await get('active')).map((x) => x.id).sort()).toEqual([ids.onTime, ids.late].sort())

      const overdue = await get('overdue')
      expect(overdue.map((x) => x.id)).toEqual([ids.late])
      expect(overdue[0].daysOverdue).toBeGreaterThan(200)
      expect(overdue[0].fine).toBe(overdue[0].daysOverdue * t.config.finePerDay)
    })

    it('searches by borrower and title', async () => {
      const byName = await t.librarian.get('/api/transactions').query({ q: 'diya' }).expect(200)
      expect(byName.body.items.map((x) => x.id)).toEqual([ids.late])
      const byTitle = await t.librarian.get('/api/transactions').query({ q: 'dune' }).expect(200)
      expect(byTitle.body.items.map((x) => x.id)).toEqual([ids.onTime])
    })

    it('filters by issue date range (inclusive)', async () => {
      const res = await t.librarian.get('/api/transactions').query({ from: '2026-01-10', to: '2026-01-10' }).expect(200)
      expect(res.body.items.map((x) => x.id)).toEqual([ids.late])
      await t.librarian.get('/api/transactions').query({ from: '10/01/2026' }).expect(400)
    })
  })

  describe('exports', () => {
    it('downloads the full history as CSV with the required columns', async () => {
      const res = await t.librarian.get('/api/transactions/export').query({ format: 'csv' }).expect(200)
      expect(res.headers['content-type']).toMatch(/text\/csv/)
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="shelfmark-transactions-\d{4}-\d{2}-\d{2}\.csv"/)

      const text = res.text
      expect(text.charCodeAt(0)).toBe(0xfeff) 
      const lines = text.slice(1).trim().split('\r\n')
      expect(lines[0]).toBe(CSV_HEADER)
      expect(lines).toHaveLength(4)
      expect(text).toContain('The Hobbit,J.R.R. Tolkien,FAN-001,RA002,Diya Rao,2026-01-10 09:00,2026-01-24 09:00,,Overdue,')
      expect(text).toContain(',Returned,0')
      expect(text).toContain('Issued,0')
    })

    it('defuses spreadsheet formulas typed into borrower names', async () => {
      const res = await t.librarian.get('/api/transactions/export').query({ format: 'csv', status: 'returned' }).expect(200)
      expect(res.text).toContain(`"'=HYPERLINK(""http://evil.example"")"`)
      expect(res.text.trim().split('\r\n')).toHaveLength(2)
    })

    it('downloads an Excel workbook with the same columns plus a summary sheet', async () => {
      const res = await t.librarian.get('/api/transactions/export').query({ format: 'xlsx' }).buffer(true).parse(binary).expect(200)
      expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(res.body)
      const sheet = workbook.getWorksheet('Transactions')
      expect(sheet.getRow(1).values.slice(1).join(',')).toBe(CSV_HEADER)
      expect(sheet.rowCount).toBe(4)
      expect(workbook.getWorksheet('Summary')).toBeTruthy()
    })

    it('rejects unknown formats', async () => {
      await t.librarian.get('/api/transactions/export').query({ format: 'pdf' }).expect(400)
    })
  })

  describe('admin dashboard', () => {
    it('summarises stock, loans and overdue books', async () => {
      const res = await t.admin.get('/api/dashboard').expect(200)
      const { totals, overdue, dueSoon, popular, trend, recent } = res.body

      expect(totals).toMatchObject({ titles: 3, copies: 4, available: 2, issued: 2, overdue: 1, activeBorrowers: 2 })
      expect(overdue).toHaveLength(1)
      expect(overdue[0]).toMatchObject({ borrower: { name: 'Diya Rao' }, book: { title: 'The Hobbit' } })
      expect(overdue[0].daysOverdue).toBeGreaterThan(0)
      expect(dueSoon).toEqual([])
      expect(popular[0]).toHaveProperty('loans')
      expect(trend).toHaveLength(14)
      expect(trend.at(-1)).toMatchObject({ issued: 2, returned: 1 })
      expect(recent[0]).toMatchObject({ action: 'return' })
    })

    it('needs a session', async () => {
      await t.anon.get('/api/dashboard').expect(401)
    })
  })
})
