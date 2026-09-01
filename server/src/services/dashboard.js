import { TRANSACTION_SELECT, toTransaction } from './transactions.js'

export async function getDashboard(db, config) {
  const tz = config.reportTimeZone
  const now = new Date()
  const loans = (sql, params = []) => db.query(`${TRANSACTION_SELECT} ${sql}`, params).then(({ rows }) => rows.map((r) => toTransaction(r, config, now)))

  const [stock, circulation, overdue, dueSoon, popular, trend, recent] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS titles,
              coalesce(sum(total_copies), 0)::int AS copies,
              coalesce(sum(available_copies), 0)::int AS available
       FROM books WHERE archived_at IS NULL`,
    ),
    db.query(
      `SELECT count(*) FILTER (WHERE returned_at IS NULL)::int AS issued,
              count(*) FILTER (WHERE returned_at IS NULL AND due_at < now())::int AS overdue,
              count(DISTINCT borrower_id) FILTER (WHERE returned_at IS NULL)::int AS active_borrowers,
              count(*) FILTER (WHERE (issued_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::int AS issued_today,
              count(*) FILTER (WHERE (returned_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date)::int AS returned_today
       FROM transactions`,
      [tz],
    ),
    loans('WHERE t.returned_at IS NULL AND t.due_at < now() ORDER BY t.due_at LIMIT 50'),
    loans(`WHERE t.returned_at IS NULL AND t.due_at BETWEEN now() AND now() + interval '2 days' ORDER BY t.due_at LIMIT 20`),
    db.query(
      `SELECT b.id, b.title, b.author, count(*)::int AS loans
       FROM transactions t JOIN books b ON b.id = t.book_id
       GROUP BY b.id, b.title, b.author ORDER BY loans DESC, b.title LIMIT 5`,
    ),
    
    db.query(
      `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              (SELECT count(*) FROM transactions t WHERE (t.issued_at AT TIME ZONE $1)::date = d.day)::int AS issued,
              (SELECT count(*) FROM transactions t WHERE (t.returned_at AT TIME ZONE $1)::date = d.day)::int AS returned
       FROM (
         SELECT generate_series(
           ((now() AT TIME ZONE $1)::date - 13)::timestamp,
           (now() AT TIME ZONE $1)::date::timestamp,
           interval '1 day'
         )::date AS day
       ) d
       ORDER BY d.day`,
      [tz],
    ),
    db.query(
      `SELECT * FROM (
         SELECT 'issue' AS action, t.id, t.issued_at AS at, t.borrower_id, t.borrower_name, b.id AS book_id, b.title
         FROM transactions t JOIN books b ON b.id = t.book_id
         UNION ALL
         SELECT 'return', t.id, t.returned_at, t.borrower_id, t.borrower_name, b.id, b.title
         FROM transactions t JOIN books b ON b.id = t.book_id WHERE t.returned_at IS NOT NULL
       ) events ORDER BY at DESC LIMIT 12`,
    ),
  ])

  const s = stock.rows[0]
  const c = circulation.rows[0]
  return {
    totals: {
      titles: s.titles,
      copies: s.copies,
      available: s.available,
      issued: c.issued,
      overdue: c.overdue,
      activeBorrowers: c.active_borrowers,
      issuedToday: c.issued_today,
      returnedToday: c.returned_today,
    },
    overdue,
    dueSoon,
    popular: popular.rows,
    trend: trend.rows,
    recent: recent.rows.map((r) => ({
      action: r.action,
      transactionId: r.id,
      at: r.at,
      borrower: { id: r.borrower_id, name: r.borrower_name },
      book: { id: r.book_id, title: r.title },
    })),
  }
}
