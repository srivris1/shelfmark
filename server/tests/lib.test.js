import { describe, it, expect } from 'vitest'
import { createQrPayload, readQrPayload } from '../src/lib/qr.js'
import { toCsv } from '../src/lib/csv.js'
import { normalizeBookCode } from '../src/lib/isbn.js'
import { daysOverdue, loanStatus } from '../src/lib/loans.js'

const SECRET = 'test-secret'
const BOOK_ID = '3f1c2a9e-8b7d-4c6e-9f10-1a2b3c4d5e6f'

describe('QR payloads', () => {
  it('round-trips a book id', () => {
    const payload = createQrPayload(BOOK_ID, SECRET)
    expect(payload.startsWith('SHELFMARK:')).toBe(true)
    expect(readQrPayload(payload, SECRET)).toBe(BOOK_ID)
  })

  it('ignores surrounding whitespace from scanners', () => {
    expect(readQrPayload(`  ${createQrPayload(BOOK_ID, SECRET)}\n`, SECRET)).toBe(BOOK_ID)
  })

  it('rejects a payload whose book id was edited', () => {
    const tampered = createQrPayload(BOOK_ID, SECRET).replace('3f1c', '3f1d')
    expect(() => readQrPayload(tampered, SECRET)).toThrow(/wasn't issued by this library/i)
  })

  it('rejects a payload signed with a different secret', () => {
    const foreign = createQrPayload(BOOK_ID, 'someone-else')
    expect(() => readQrPayload(foreign, SECRET)).toThrow(/wasn't issued by this library/i)
  })

  it('rejects QR codes that are not ours', () => {
    for (const junk of ['https://example.com', '', 'SHELFMARK:1:nope', 'SHELFMARK:1:not-a-uuid:abcdef']) {
      try {
        readQrPayload(junk, SECRET)
        throw new Error(`accepted ${junk}`)
      } catch (err) {
        expect(err.status).toBe(400)
        expect(err.code).toBe('INVALID_QR')
      }
    }
  })
})

describe('CSV export', () => {
  const columns = [
    { header: 'Title', value: (r) => r.title },
    { header: 'Copies', value: (r) => r.copies },
  ]

  it('writes a header row and CRLF line endings', () => {
    expect(toCsv(columns, [{ title: 'Dune', copies: 2 }])).toBe('Title,Copies\r\nDune,2\r\n')
  })

  it('quotes commas, quotes and newlines', () => {
    const csv = toCsv(columns, [{ title: 'Me, "Myself"\nand I', copies: 1 }])
    expect(csv).toContain('"Me, ""Myself""\nand I",1')
  })

  it('neutralises spreadsheet formulas', () => {
    const csv = toCsv(columns, [{ title: '=HYPERLINK("http://evil")', copies: 1 }, { title: '@SUM(A1)', copies: 1 }])
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(csv).toContain("'@SUM(A1)")
  })

  it('renders null and undefined as empty cells', () => {
    expect(toCsv(columns, [{ title: null }])).toBe('Title,Copies\r\n,\r\n')
  })
})

describe('book codes', () => {
  it('keeps custom accession numbers as typed (trimmed)', () => {
    expect(normalizeBookCode('  LIB-0001 ')).toBe('LIB-0001')
  })

  it('strips hyphens and spaces from valid ISBN-13s', () => {
    expect(normalizeBookCode('978-0-13-235088-4')).toBe('9780132350884')
  })

  it('accepts ISBN-10s including an X check digit', () => {
    expect(normalizeBookCode('0-306-40615-2')).toBe('0306406152')
    expect(normalizeBookCode('080442957x')).toBe('080442957X')
  })

  it('rejects ISBNs with a wrong check digit', () => {
    expect(() => normalizeBookCode('9780132350885')).toThrow(/check digit/i)
  })

  it('rejects codes with odd characters', () => {
    expect(() => normalizeBookCode('bad code!')).toThrow()
    expect(() => normalizeBookCode('x')).toThrow()
  })
})

describe('loan maths', () => {
  const due = new Date('2026-09-01T10:00:00Z')

  it('is not overdue before the due time', () => {
    expect(daysOverdue(due, new Date('2026-09-01T09:59:00Z'))).toBe(0)
  })

  it('counts any part of a late day as a full day', () => {
    expect(daysOverdue(due, new Date('2026-09-01T10:01:00Z'))).toBe(1)
    expect(daysOverdue(due, new Date('2026-09-03T11:00:00Z'))).toBe(3)
  })

  it('derives a loan status', () => {
    const now = new Date('2026-09-05T00:00:00Z')
    expect(loanStatus({ returnedAt: null, dueAt: due }, now)).toBe('overdue')
    expect(loanStatus({ returnedAt: null, dueAt: new Date('2026-09-10T00:00:00Z') }, now)).toBe('issued')
    expect(loanStatus({ returnedAt: new Date('2026-09-04T00:00:00Z'), dueAt: due }, now)).toBe('returned')
  })
})
