const DAY_MS = 24 * 60 * 60 * 1000


export function daysOverdue(dueAt, at = new Date()) {
  const lateBy = new Date(at) - new Date(dueAt)
  return lateBy > 0 ? Math.ceil(lateBy / DAY_MS) : 0
}

export function loanStatus({ returnedAt, dueAt }, now = new Date()) {
  if (returnedAt) return 'returned'
  return new Date(dueAt) < now ? 'overdue' : 'issued'
}

export const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS)
