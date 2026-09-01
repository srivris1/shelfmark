export type Role = 'admin' | 'librarian'

export interface Staff {
  id: number
  name: string
  email: string
  role: Role
  createdAt: string
}

export interface Book {
  id: string
  code: string
  title: string
  author: string
  category: string
  totalCopies: number
  availableCopies: number
  issuedCopies: number
  status: 'available' | 'issued'
  createdAt: string
  updatedAt: string
}

export type LoanStatus = 'issued' | 'overdue' | 'returned'

export interface Transaction {
  id: number
  book: { id: string; code: string; title: string; author: string; category: string }
  borrower: { id: string; name: string; contact: string | null }
  issuedAt: string
  dueAt: string
  returnedAt: string | null
  status: LoanStatus
  daysOverdue: number
  fine: number
  issuedBy: string | null
  returnedBy: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface Category {
  name: string
  count: number
}

export interface Borrower {
  id: string
  name: string
  contact: string | null
  activeLoans: number
  lastSeen: string
}

export interface ActivityEvent {
  action: 'issue' | 'return'
  transactionId: number
  at: string
  borrower: { id: string; name: string }
  book: { id: string; title: string }
}

export interface Dashboard {
  totals: {
    titles: number
    copies: number
    available: number
    issued: number
    overdue: number
    activeBorrowers: number
    issuedToday: number
    returnedToday: number
  }
  overdue: Transaction[]
  dueSoon: Transaction[]
  popular: { id: string; title: string; author: string; loans: number }[]
  trend: { day: string; issued: number; returned: number }[]
  recent: ActivityEvent[]
}

export type Availability = 'all' | 'available' | 'issued'

export interface SearchFilters {
  title: string | null
  author: string | null
  category: string | null
  availability: Availability
  keywords: string[]
}

export interface SmartSearchResult {
  query: string
  filters: SearchFilters
  explanation: string
  source: string
  results: Page<Book>
}

export interface CategorySuggestion {
  category: string
  isNew: boolean
  reason: string
  source: string
}

export interface Settings {
  loanDays: number
  maxActiveLoans: number
  finePerDay: number
  reportTimeZone: string
}

export interface CirculationResult {
  transaction: Transaction
  book: Book
}
