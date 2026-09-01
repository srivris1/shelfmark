import { conflict, notFound } from '../lib/errors.js'
import { readQrPayload } from '../lib/qr.js'
import { findBookByCode, findBookById, putBackCopy, takeCopy } from './books.js'
import { TRANSACTION_SELECT, toTransaction } from './transactions.js'

const copies = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`

export const normalizeBorrowerId = (id) => id.replace(/\s+/g, '').toUpperCase()

// Works out which book a request is about. A QR label is verified (HMAC)
// before we look anything up; a typed code is the manual fallback.
async function resolveBook(q, { qr, bookCode }, config) {
  if (qr) {
    const book = await findBookById(q, readQrPayload(qr, config.qrSecret))
    if (!book) throw notFound('BOOK_NOT_FOUND', "This label belongs to a book that's no longer in the catalogue.")
    return book
  }
  const book = await findBookByCode(q, bookCode)
  if (!book) throw notFound('BOOK_NOT_FOUND', `There's no book with the ID ${bookCode} in the catalogue.`)
  return book
}

async function openLoans(q, bookId, config, { borrowerId, lock = false } = {}) {
  const params = [bookId]
  let sql = `${TRANSACTION_SELECT} WHERE t.book_id = $1 AND t.returned_at IS NULL`
  if (borrowerId) {
    params.push(borrowerId)
    sql += ' AND upper(t.borrower_id) = $2'
  }
  sql += ' ORDER BY t.issued_at'
  if (lock) sql += ' FOR UPDATE OF t'
  const { rows } = await q.query(sql, params)
  return rows.map((row) => toTransaction(row, config))
}

async function getTransaction(q, id, config) {
  const { rows } = await q.query(`${TRANSACTION_SELECT} WHERE t.id = $1`, [id])
  return toTransaction(rows[0], config)
}

export async function resolveScan(db, target, config) {
  const book = await resolveBook(db, target, config)
  return { book, activeLoans: await openLoans(db, book.id, config) }
}

export async function issueBook(db, input, staff, config) {
  const borrowerId = normalizeBorrowerId(input.borrowerId)
  const loanDays = input.loanDays ?? config.loanDays

  return db.tx(async (q) => {
    const book = await resolveBook(q, input, config)

    
    
    await q.query('SELECT pg_advisory_xact_lock(hashtext($1))', [borrowerId])

    const { rows } = await q.query(
      `SELECT count(*)::int AS open, count(*) FILTER (WHERE book_id = $2)::int AS same_book
       FROM transactions WHERE upper(borrower_id) = $1 AND returned_at IS NULL`,
      [borrowerId, book.id],
    )
    const { open, same_book: sameBook } = rows[0]
    if (sameBook > 0) throw conflict('ALREADY_BORROWED', `${input.borrowerName} already has a copy of "${book.title}".`)
    if (open >= config.maxActiveLoans) {
      throw conflict('BORROWER_LIMIT_REACHED', `${input.borrowerName} already has ${open} books out. The limit is ${config.maxActiveLoans}.`)
    }

    const updatedBook = await takeCopy(q, book.id)
    if (!updatedBook) throw conflict('BOOK_UNAVAILABLE', `All ${copies(book.totalCopies)} of "${book.title}" are out on loan right now.`)

    let inserted
    try {
      ;({ rows: [inserted] } = await q.query(
        `INSERT INTO transactions (book_id, borrower_id, borrower_name, borrower_contact, due_at, issued_by)
         VALUES ($1, $2, $3, $4, now() + make_interval(days => $5::int), $6) RETURNING id`,
        [book.id, borrowerId, input.borrowerName, input.borrowerContact ?? null, loanDays, staff.id],
      ))
    } catch (err) {
      
      if (err.code === '23505') throw conflict('ALREADY_BORROWED', `${input.borrowerName} already has a copy of "${book.title}".`)
      throw err
    }

    return { transaction: await getTransaction(q, inserted.id, config), book: updatedBook }
  })
}



export async function returnBook(db, input, staff, config) {
  return db.tx(async (q) => {
    let loan

    if (input.transactionId) {
      const { rows } = await q.query('SELECT id, book_id, returned_at FROM transactions WHERE id = $1 FOR UPDATE', [input.transactionId])
      if (!rows[0]) throw notFound('TRANSACTION_NOT_FOUND', "We couldn't find that transaction.")
      if (rows[0].returned_at) throw conflict('ALREADY_RETURNED', 'That copy has already been returned.')
      loan = { id: rows[0].id, bookId: rows[0].book_id }
    } else {
      const book = await resolveBook(q, input, config)
      const borrowerId = input.borrowerId ? normalizeBorrowerId(input.borrowerId) : undefined
      const open = await openLoans(q, book.id, config, { borrowerId, lock: true })

      if (open.length === 0) {
        throw conflict(
          'NOT_ISSUED',
          borrowerId
            ? `${borrowerId} doesn't have "${book.title}" checked out.`
            : `"${book.title}" isn't checked out to anyone, so there's nothing to return.`,
        )
      }
      if (open.length > 1) {
        throw conflict('MULTIPLE_ACTIVE_LOANS', `${copies(open.length)} of "${book.title}" are out. Pick whose copy this is.`, { loans: open })
      }
      loan = { id: open[0].id, bookId: book.id }
    }

    const { rows } = await q.query(
      'UPDATE transactions SET returned_at = now(), returned_by = $2 WHERE id = $1 AND returned_at IS NULL RETURNING id',
      [loan.id, staff.id],
    )
    if (!rows[0]) throw conflict('ALREADY_RETURNED', 'That copy has already been returned.')

    const book = await putBackCopy(q, loan.bookId)
    return { transaction: await getTransaction(q, loan.id, config), book }
  })
}

export async function searchBorrowers(db, q) {
  const { rows } = await db.query(
    `SELECT borrower_id AS id,
            (array_agg(borrower_name ORDER BY issued_at DESC))[1] AS name,
            (array_agg(borrower_contact ORDER BY issued_at DESC))[1] AS contact,
            count(*) FILTER (WHERE returned_at IS NULL)::int AS "activeLoans",
            max(issued_at) AS "lastSeen"
     FROM transactions
     WHERE $1::text IS NULL OR borrower_id ILIKE $1 OR borrower_name ILIKE $1
     GROUP BY borrower_id
     ORDER BY max(issued_at) DESC
     LIMIT 8`,
    [q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null],
  )
  return rows
}
