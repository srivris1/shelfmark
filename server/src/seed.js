import { pathToFileURL } from 'node:url'
import { countStaff, createStaff } from './services/staff.js'
import { createBook } from './services/books.js'
import { issueBook, returnBook } from './services/circulation.js'

export const DEMO_ACCOUNTS = [
  { name: 'Priya Raman', email: 'admin@shelfmark.dev', password: 'Admin@123', role: 'admin' },
  { name: 'Arjun Menon', email: 'librarian@shelfmark.dev', password: 'Librarian@123', role: 'librarian' },
]



const BOOKS = [
  ['9780132350884', 'Clean Code', 'Robert C. Martin', 'Technology', 3],
  ['9780135957059', 'The Pragmatic Programmer', 'David Thomas & Andrew Hunt', 'Technology', 2],
  ['9780262046305', 'Introduction to Algorithms', 'Cormen, Leiserson, Rivest & Stein', 'Technology', 4],
  ['9781449373320', 'Designing Data-Intensive Applications', 'Martin Kleppmann', 'Technology', 2],
  ['9781593279509', 'Eloquent JavaScript', 'Marijn Haverbeke', 'Technology', 2],
  ['SRM-CS-0142', 'Let Us C', 'Yashavant Kanetkar', 'Technology', 4],
  ['SRM-MA-0031', 'Higher Engineering Mathematics', 'B.S. Grewal', 'Science', 3],
  ['9780547928227', 'The Hobbit', 'J.R.R. Tolkien', 'Fantasy', 2],
  ['9780590353427', "Harry Potter and the Sorcerer's Stone", 'J.K. Rowling', 'Fantasy', 3],
  ['9780441172719', 'Dune', 'Frank Herbert', 'Science Fiction', 2],
  ['9780451524935', '1984', 'George Orwell', 'Fiction', 2],
  ['9780061120084', 'To Kill a Mockingbird', 'Harper Lee', 'Fiction', 1],
  ['9780743273565', 'The Great Gatsby', 'F. Scott Fitzgerald', 'Fiction', 1],
  ['9780525559474', 'The Midnight Library', 'Matt Haig', 'Fiction', 2],
  ['9780062315007', 'The Alchemist', 'Paulo Coelho', 'Fiction', 3],
  ['9780307474278', 'The Da Vinci Code', 'Dan Brown', 'Mystery', 2],
  ['9780062316097', 'Sapiens', 'Yuval Noah Harari', 'History', 2],
  ['9780553380163', 'A Brief History of Time', 'Stephen Hawking', 'Science', 2],
  ['9780345539434', 'Cosmos', 'Carl Sagan', 'Science', 1],
  ['9780735211292', 'Atomic Habits', 'James Clear', 'Self-Help', 3],
  ['9781455586691', 'Deep Work', 'Cal Newport', 'Self-Help', 1],
  ['9780374533557', 'Thinking, Fast and Slow', 'Daniel Kahneman', 'Science', 1],
  ['9780857197689', 'The Psychology of Money', 'Morgan Housel', 'Business', 2],
  ['9781612680194', 'Rich Dad Poor Dad', 'Robert T. Kiyosaki', 'Business', 2],
  ['9788173711466', 'Wings of Fire', 'A.P.J. Abdul Kalam', 'Biography', 3],
  ['9780399590504', 'Educated', 'Tara Westover', 'Biography', 1],
  ['9780812968255', 'Meditations', 'Marcus Aurelius', 'Philosophy', 1],
]

const BORROWERS = [
  ['RA2311003010045', 'Aarav Sharma', 'as4512@srmist.edu.in'],
  ['RA2311003010112', 'Diya Patel', 'dp7781@srmist.edu.in'],
  ['RA2311026010023', 'Rohan Iyer', 'ri2203@srmist.edu.in'],
  ['RA2311003010207', 'Ananya Reddy', 'ar9021@srmist.edu.in'],
  ['RA2311004010088', 'Kabir Singh', '98401 23456'],
  ['RA2311003010150', 'Meera Nair', 'mn3310@srmist.edu.in'],
  ['RA2311028010064', 'Ishaan Gupta', 'ig5528@srmist.edu.in'],
  ['FAC-CSE-017', 'Dr. Sneha Pillai', 'sneha.p@srmist.edu.in'],
]


const HISTORY = [
  [0, 0, 38, 12], [7, 1, 34, 16], [16, 2, 30, 9], [19, 3, 27, 20], [9, 4, 25, 13],
  [2, 5, 24, null], [11, 6, 21, null], [15, 1, 19, null],
  [3, 7, 13, null], [19, 2, 9, null], [8, 0, 6, null], [24, 3, 4, null],
  [22, 4, 2, 1], [0, 5, 1, null], [13, 6, 0, null],
]

export async function seedDemo(db, config) {
  const staff = []
  for (const account of DEMO_ACCOUNTS) staff.push(await createStaff(db, account, config.bcryptRounds))
  const librarian = staff[1]

  const books = []
  for (const [code, title, author, category, totalCopies] of BOOKS) {
    books.push(await createBook(db, { code, title, author, category, totalCopies }))
  }

  for (const [bookIndex, borrowerIndex, daysAgo, returnedAfter] of HISTORY) {
    const [borrowerId, borrowerName, borrowerContact] = BORROWERS[borrowerIndex]
    const { transaction } = await issueBook(db, { bookCode: books[bookIndex].code, borrowerId, borrowerName, borrowerContact }, librarian, config)
    if (returnedAfter !== null) await returnBook(db, { transactionId: transaction.id }, librarian, config)

    
    await db.query(
      `UPDATE transactions SET
         issued_at = now() - make_interval(days => $2::int, hours => $3::int),
         due_at = now() - make_interval(days => $2::int, hours => $3::int) + make_interval(days => $4::int),
         returned_at = CASE WHEN returned_at IS NULL THEN NULL
                            ELSE now() - make_interval(days => $2::int, hours => $3::int) + make_interval(days => $5::int) END
       WHERE id = $1`,
      [transaction.id, daysAgo, (transaction.id * 5) % 9, config.loanDays, returnedAfter ?? 0],
    )
  }

  return { staff: staff.length, books: books.length, transactions: HISTORY.length }
}


export async function ensureStarterData(db, config, log = console.log) {
  if ((await countStaff(db)) > 0) return

  if (config.seedDemo) {
    const counts = await seedDemo(db, config)
    log(`Seeded demo data: ${counts.books} books, ${counts.transactions} transactions.`)
    log(`Demo logins -> ${DEMO_ACCOUNTS.map((a) => `${a.email} / ${a.password}`).join('   ')}`)
  }
  if (config.admin.email && config.admin.password) {
    await createStaff(db, { ...config.admin, role: 'admin' }, config.bcryptRounds)
    log(`Created admin account ${config.admin.email}.`)
  }
  if (!config.seedDemo && !config.admin.email) {
    log('No staff accounts yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (or SEED_DEMO=true) and restart.')
  }
}


if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { loadConfig } = await import('./config.js')
  const { createDb, migrate } = await import('./db/index.js')
  const config = loadConfig()
  const db = await createDb(config)
  await migrate(db)
  await db.exec('TRUNCATE transactions, books, staff RESTART IDENTITY CASCADE')
  await ensureStarterData(db, { ...config, seedDemo: true })
  await db.close()
}
