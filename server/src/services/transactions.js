import { daysOverdue, loanStatus } from '../lib/loans.js'
import { whereBuilder, containsPattern } from '../lib/sql.js'

export const TRANSACTION_SELECT = `
  SELECT t.id, t.book_id, t.borrower_id, t.borrower_name, t.borrower_contact,
         t.issued_at, t.due_at, t.returned_at,
         b.book_code, b.title, b.author, b.category,
         si.name AS issued_by_name, sr.name AS returned_by_name
  FROM transactions t
  JOIN books b ON b.id = t.book_id
  LEFT JOIN staff si ON si.id = t.issued_by
  LEFT JOIN staff sr ON sr.id = t.returned_by`

export function toTransaction(row, { finePerDay = 0 } = {}, now = new Date()) {
  const lateDays = daysOverdue(row.due_at, row.returned_at ?? now)
  return {
    id: row.id,
    book: { id: row.book_id, code: row.book_code, title: row.title, author: row.author, category: row.category },
    borrower: { id: row.borrower_id, name: row.borrower_name, contact: row.borrower_contact },
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
    status: loanStatus({ returnedAt: row.returned_at, dueAt: row.due_at }, now),
    daysOverdue: lateDays,
    fine: lateDays * finePerDay,
    issuedBy: row.issued_by_name ?? null,
    returnedBy: row.returned_by_name ?? null,
  }
}


function buildFilters({ q, status, bookId, borrowerId, from, to }, timeZone) {
  const where = whereBuilder()
  if (q) {
    where.add(
      '(b.title ILIKE $? OR b.author ILIKE $? OR b.book_code ILIKE $? OR t.borrower_id ILIKE $? OR t.borrower_name ILIKE $?)',
      containsPattern(q),
    )
  }
  if (bookId) where.add('t.book_id = $?', bookId)
  if (borrowerId) where.add('upper(t.borrower_id) = upper($?::text)', borrowerId)
  if (status === 'active') where.raw('t.returned_at IS NULL')
  if (status === 'issued') where.raw('t.returned_at IS NULL AND t.due_at >= now()')
  if (status === 'overdue') where.raw('t.returned_at IS NULL AND t.due_at < now()')
  if (status === 'returned') where.raw('t.returned_at IS NOT NULL')
  
  if (from || to) {
    const tz = where.param(timeZone)
    if (from) where.add(`t.issued_at >= ($?::date)::timestamp AT TIME ZONE ${tz}`, from)
    if (to) where.add(`t.issued_at < (($?::date) + 1)::timestamp AT TIME ZONE ${tz}`, to)
  }
  return where
}

export async function listTransactions(db, filters, config) {
  const { page = 1, pageSize = 25 } = filters
  const where = buildFilters(filters, config.reportTimeZone)
  const limit = where.param(pageSize)
  const offset = where.param((page - 1) * pageSize)
  const { rows } = await db.query(
    `SELECT *, count(*) OVER()::int AS total_count FROM (${TRANSACTION_SELECT} ${where.toSql()}) x
     ORDER BY issued_at DESC, id DESC LIMIT ${limit} OFFSET ${offset}`,
    where.params,
  )
  const now = new Date()
  return { items: rows.map((row) => toTransaction(row, config, now)), total: rows[0]?.total_count ?? 0, page, pageSize }
}


export async function allTransactions(db, filters, config, cap = 50000) {
  const where = buildFilters(filters, config.reportTimeZone)
  const limit = where.param(cap)
  const { rows } = await db.query(`${TRANSACTION_SELECT} ${where.toSql()} ORDER BY t.issued_at DESC, t.id DESC LIMIT ${limit}`, where.params)
  const now = new Date()
  return rows.map((row) => toTransaction(row, config, now))
}
