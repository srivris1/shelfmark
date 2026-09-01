import { conflict, notFound } from '../lib/errors.js'
import { normalizeBookCode } from '../lib/isbn.js'
import { whereBuilder, containsPattern, stem } from '../lib/sql.js'

const COLUMNS = 'id, book_code, title, author, category, total_copies, available_copies, created_at, updated_at'

const SORTS = {
  title: 'lower(title), id',
  author: 'lower(author), lower(title)',
  newest: 'created_at DESC, id',
  availability: 'available_copies DESC, lower(title)',
}

export const toBook = (row) => ({
  id: row.id,
  code: row.book_code,
  title: row.title,
  author: row.author,
  category: row.category,
  totalCopies: row.total_copies,
  availableCopies: row.available_copies,
  issuedCopies: row.total_copies - row.available_copies,
  
  status: row.available_copies > 0 ? 'available' : 'issued',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export async function listBooks(db, { q, title, author, category, keywords = [], availability = 'all', sort = 'title', page = 1, pageSize = 20 }) {
  const where = whereBuilder()
  where.raw('archived_at IS NULL')
  if (q) where.add('(title ILIKE $? OR author ILIKE $? OR book_code ILIKE $? OR category ILIKE $?)', containsPattern(q))
  if (title) where.add('title ILIKE $?', containsPattern(title))
  if (author) where.add('author ILIKE $?', containsPattern(author))
  if (category) where.add('lower(category) = lower($?::text)', category)
  for (const word of keywords) where.add('(title ILIKE $? OR author ILIKE $? OR category ILIKE $?)', containsPattern(stem(word)))
  if (availability === 'available') where.raw('available_copies > 0')
  if (availability === 'issued') where.raw('available_copies = 0')

  const limit = where.param(pageSize)
  const offset = where.param((page - 1) * pageSize)
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, count(*) OVER()::int AS total_count FROM books ${where.toSql()}
     ORDER BY ${SORTS[sort] ?? SORTS.title} LIMIT ${limit} OFFSET ${offset}`,
    where.params,
  )
  return { items: rows.map(toBook), total: rows[0]?.total_count ?? 0, page, pageSize }
}

export async function listCategories(db) {
  const { rows } = await db.query(
    `SELECT min(category) AS name, count(*)::int AS count FROM books
     WHERE archived_at IS NULL GROUP BY lower(category) ORDER BY lower(min(category))`,
  )
  return rows
}

export async function findBookById(q, id) {
  const { rows } = await q.query(`SELECT ${COLUMNS} FROM books WHERE id = $1 AND archived_at IS NULL`, [id])
  return rows[0] ? toBook(rows[0]) : null
}

export async function findBookByCode(q, rawCode) {
  const code = normalizeBookCode(rawCode)
  const { rows } = await q.query(`SELECT ${COLUMNS} FROM books WHERE lower(book_code) = lower($1) AND archived_at IS NULL`, [code])
  return rows[0] ? toBook(rows[0]) : null
}

export async function getBook(q, id) {
  const book = await findBookById(q, id)
  if (!book) throw notFound('BOOK_NOT_FOUND', "We couldn't find that book. It may have been removed from the catalogue.")
  return book
}




export async function takeCopy(q, id) {
  const { rows } = await q.query(
    `UPDATE books SET available_copies = available_copies - 1, updated_at = now()
     WHERE id = $1 AND available_copies > 0 RETURNING ${COLUMNS}`,
    [id],
  )
  return rows[0] ? toBook(rows[0]) : null
}

export async function putBackCopy(q, id) {
  const { rows } = await q.query(
    `UPDATE books SET available_copies = available_copies + 1, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  )
  return toBook(rows[0])
}

const duplicateCode = (code) => conflict('DUPLICATE_BOOK_CODE', `Another book in the catalogue already uses the ID ${code}.`)

export async function createBook(db, input) {
  const code = normalizeBookCode(input.code)
  try {
    const { rows } = await db.query(
      `INSERT INTO books (book_code, title, author, category, total_copies, available_copies)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING ${COLUMNS}`,
      [code, input.title, input.author, input.category, input.totalCopies],
    )
    return toBook(rows[0])
  } catch (err) {
    if (err.code === '23505') throw duplicateCode(code)
    throw err
  }
}

export async function updateBook(db, id, patch) {
  const code = patch.code === undefined ? null : normalizeBookCode(patch.code)
  try {
    
    
    const { rows } = await db.query(
      `UPDATE books SET
         book_code = COALESCE($2, book_code),
         title = COALESCE($3, title),
         author = COALESCE($4, author),
         category = COALESCE($5, category),
         available_copies = available_copies + (COALESCE($6, total_copies) - total_copies),
         total_copies = COALESCE($6, total_copies),
         updated_at = now()
       WHERE id = $1 AND archived_at IS NULL
       RETURNING ${COLUMNS}`,
      [id, code, patch.title ?? null, patch.author ?? null, patch.category ?? null, patch.totalCopies ?? null],
    )
    if (!rows[0]) throw notFound('BOOK_NOT_FOUND', "We couldn't find that book.")
    return toBook(rows[0])
  } catch (err) {
    if (err.code === '23505') throw duplicateCode(code)
    if (err.code === '23514') {
      const book = await getBook(db, id)
      throw conflict(
        'COPIES_BELOW_ISSUED',
        `${book.issuedCopies} ${book.issuedCopies === 1 ? 'copy is' : 'copies are'} out on loan, so total copies can't go below ${book.issuedCopies}.`,
      )
    }
    throw err
  }
}



export async function deleteBook(db, id) {
  return db.tx(async (q) => {
    const book = await getBook(q, id)
    const { rows } = await q.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE returned_at IS NULL)::int AS open
       FROM transactions WHERE book_id = $1`,
      [id],
    )
    const { total, open } = rows[0]
    if (open > 0) {
      throw conflict('BOOK_HAS_ACTIVE_LOANS', `"${book.title}" still has ${open} ${open === 1 ? 'copy' : 'copies'} out on loan. Return them first.`)
    }
    if (total > 0) {
      await q.query('UPDATE books SET archived_at = now(), updated_at = now() WHERE id = $1', [id])
      return { deleted: true, archived: true }
    }
    await q.query('DELETE FROM books WHERE id = $1', [id])
    return { deleted: true, archived: false }
  })
}
