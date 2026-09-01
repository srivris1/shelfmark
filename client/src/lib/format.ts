const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function relativeTime(iso: string, now = new Date()) {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86400), 'day')
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

interface DueInfo {
  dueAt: string
  returnedAt: string | null
  daysOverdue: number
}

export function dueLabel({ dueAt, returnedAt, daysOverdue }: DueInfo, now = new Date()) {
  if (returnedAt) return daysOverdue > 0 ? `Returned ${plural(daysOverdue, 'day', 'days')} late` : 'Returned on time'
  if (daysOverdue > 0) return `${plural(daysOverdue, 'day', 'days')} late`
  const days = Math.round((startOfDay(new Date(dueAt)) - startOfDay(now)) / DAY_MS)
  if (days <= 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

export const rupees = (amount: number) => `₹${amount.toLocaleString('en-IN')}`


export function stampDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const longDateFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

export const formatDate = (iso: string) => dateFmt.format(new Date(iso))
export const formatDateTime = (iso: string) => dateTimeFmt.format(new Date(iso))
export const formatLongDate = (date = new Date()) => longDateFmt.format(date)
