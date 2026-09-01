import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, DownloadSimple, Scan, Warning } from '@phosphor-icons/react'
import { api, exportUrl } from '../lib/api'
import { dueLabel, formatLongDate, plural, relativeTime, rupees } from '../lib/format'
import { useReturnLoan } from '../lib/mutations'
import { useSettings } from '../lib/useSettings'
import type { ActivityEvent, Dashboard, Page, Transaction } from '../lib/types'
import { ActivityChart } from '../components/ActivityChart'
import { Button, EmptyState, ErrorNote, Input, Pagination, Spinner, buttonClass, cx, tableClass, tdClass, thClass } from '../components/ui'

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') })
  const settings = useSettings()

  if (dashboard.isPending) return <Spinner label="Counting the shelves" />
  if (dashboard.isError) return <ErrorNote error={dashboard.error} onRetry={() => dashboard.refetch()} />

  const { totals, overdue, dueSoon, popular, trend, recent } = dashboard.data

  return (
    <>
      <header className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[13px] text-ink-3">{formatLongDate()}</p>
          <h1 className="mt-1 font-display text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-[1.05] font-medium tracking-[-0.02em]">
            {totals.overdue > 0 ? (
              <>
                {plural(totals.overdue, 'book is', 'books are')} <span className="text-stamp italic">overdue</span>
              </>
            ) : (
              'Every book is on time'
            )}
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {plural(totals.issuedToday, 'issue', 'issues')} and {plural(totals.returnedToday, 'return', 'returns')} at the desk today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={exportUrl('xlsx')} className={buttonClass('secondary')} download>
            <DownloadSimple aria-hidden /> Full report (.xlsx)
          </a>
          <Link to="/desk" className={buttonClass('primary')}>
            <Scan aria-hidden /> Open scan desk
          </Link>
        </div>
      </header>

      {}
      <dl className="mb-12 grid grid-cols-2 border-y border-line sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Titles', totals.titles],
          ['Copies', totals.copies],
          ['On the shelf', totals.available],
          ['Out on loan', totals.issued],
          ['Overdue', totals.overdue],
          ['Borrowers with books', totals.activeBorrowers],
        ].map(([label, value], i) => (
          <div key={label} className={cx('py-4 pr-4 lg:px-4 lg:first:pl-0', i > 0 && 'lg:border-l lg:border-line')}>
            <dt className="text-[12px] text-ink-3">{label}</dt>
            <dd className={cx('figures mt-1 font-display text-3xl font-medium', label === 'Overdue' && Number(value) > 0 && 'text-stamp')}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-labelledby="overdue-heading">
          <h2 id="overdue-heading" className="mb-1 font-display text-xl font-medium">
            Overdue
          </h2>
          <p className="mb-4 text-[13px] text-ink-3">Most overdue first{settings.data ? `. Fines are ${rupees(settings.data.finePerDay)} a day.` : '.'}</p>
          {overdue.length === 0 ? (
            <p className="border-t border-line py-6 text-sm text-ink-2">Nothing overdue. Nice.</p>
          ) : (
            <ul className="border-t border-line">
              {overdue.map((t) => (
                <LoanRow key={t.id} loan={t} />
              ))}
            </ul>
          )}

          {dueSoon.length > 0 && (
            <>
              <h3 className="mt-10 mb-3 font-display text-lg font-medium">Due in the next two days</h3>
              <ul className="border-t border-line">
                {dueSoon.map((t) => (
                  <LoanRow key={t.id} loan={t} />
                ))}
              </ul>
            </>
          )}
        </section>

        <div className="space-y-12">
          <ActivityChart trend={trend} />
          <RecentFeed events={recent} />
          {popular.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg font-medium">Most borrowed</h2>
              <ol className="space-y-2.5">
                {popular.map((book, i) => (
                  <li key={book.id} className="flex items-baseline gap-3 text-sm">
                    <span className="figures w-4 text-ink-3">{i + 1}</span>
                    <Link to={`/books/${book.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      {book.title} <span className="text-ink-3">· {book.author}</span>
                    </Link>
                    <span className="figures text-ink-2">{plural(book.loans, 'loan', 'loans')}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      <OutOnLoan />
    </>
  )
}

function LoanRow({ loan }: { loan: Transaction }) {
  const returnLoan = useReturnLoan()
  const late = loan.status === 'overdue'
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-line py-3.5">
      <div className="min-w-0 flex-1">
        <Link to={`/books/${loan.book.id}`} className="font-display text-[17px] leading-snug hover:underline">
          {loan.book.title}
        </Link>
        <p className="mt-0.5 text-[13px] text-ink-2">
          {loan.borrower.name} <span className="font-mono text-xs text-ink-3">{loan.borrower.id}</span>
          {loan.borrower.contact && <span className="text-ink-3"> · {loan.borrower.contact}</span>}
        </p>
      </div>
      <div className="text-right">
        <p className={cx('text-[13px] font-medium', late ? 'text-stamp' : 'text-ink-2')}>
          {late && <Warning size={13} className="mr-1 inline -translate-y-px" aria-hidden />}
          {dueLabel(loan)}
        </p>
        {late && <p className="figures text-xs text-ink-3">{rupees(loan.fine)} fine so far</p>}
      </div>
      <Button size="sm" variant="ghost" busy={returnLoan.isPending} onClick={() => returnLoan.mutate(loan.id)}>
        Mark returned
      </Button>
    </li>
  )
}

function RecentFeed({ events }: { events: ActivityEvent[] }) {
  
  const seen = useRef<Set<string> | null>(null)
  const keyOf = (e: ActivityEvent) => `${e.action}-${e.transactionId}`
  const firstRender = seen.current === null
  const known = seen.current ?? new Set<string>()
  seen.current = new Set(events.map(keyOf))

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-medium">At the desk</h2>
      {events.length === 0 ? (
        <p className="text-sm text-ink-3">No activity yet. Issue a book from the scan desk and it shows up here instantly.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => {
            const Icon = e.action === 'issue' ? ArrowUpRight : ArrowDownLeft
            return (
              <li key={keyOf(e)} className={cx('flex items-start gap-3 text-sm', !firstRender && !known.has(keyOf(e)) && 'animate-rise')}>
                <Icon size={15} className={cx('mt-0.5 shrink-0', e.action === 'issue' ? 'text-series-issued' : 'text-series-returned')} aria-hidden />
                <p className="min-w-0 flex-1 text-ink-2">
                  <span className="text-ink">{e.book.title}</span> {e.action === 'issue' ? 'issued to' : 'returned by'} {e.borrower.name}
                </p>
                <time className="shrink-0 text-xs text-ink-3" dateTime={e.at}>
                  {relativeTime(e.at)}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function OutOnLoan() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const returnLoan = useReturnLoan()
  const loans = useQuery({
    queryKey: ['transactions', { status: 'active', q, page }],
    queryFn: () => api<Page<Transaction>>('/transactions', { query: { status: 'active', q, page, pageSize: 10 } }),
    placeholderData: (previous) => previous,
  })

  return (
    <section className="mt-16" aria-labelledby="loans-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="loans-heading" className="font-display text-xl font-medium">
            Out on loan
          </h2>
          <p className="text-[13px] text-ink-3">Every copy that hasn't come back yet, with who has it.</p>
        </div>
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Filter by title or borrower"
          aria-label="Filter loans"
          className="w-full sm:w-64"
        />
      </div>

      {loans.isError ? (
        <ErrorNote error={loans.error} onRetry={() => loans.refetch()} />
      ) : !loans.data ? (
        <Spinner />
      ) : loans.data.items.length === 0 ? (
        <EmptyState title={q ? 'No loans match that' : 'Every book is on the shelf'} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Book</th>
                  <th className={thClass}>Borrower</th>
                  <th className={cx(thClass, 'hidden md:table-cell')}>Issued</th>
                  <th className={thClass}>Due</th>
                  <th className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loans.data.items.map((t) => (
                  <tr key={t.id}>
                    <td className={tdClass}>
                      <Link to={`/books/${t.book.id}`} className="hover:underline">
                        {t.book.title}
                      </Link>
                      <p className="font-mono text-xs text-ink-3">{t.book.code}</p>
                    </td>
                    <td className={tdClass}>
                      {t.borrower.name}
                      <p className="font-mono text-xs text-ink-3">{t.borrower.id}</p>
                    </td>
                    <td className={cx(tdClass, 'hidden text-ink-2 md:table-cell')}>{relativeTime(t.issuedAt)}</td>
                    <td className={cx(tdClass, t.status === 'overdue' ? 'font-medium text-stamp' : 'text-ink-2')}>{dueLabel(t)}</td>
                    <td className={cx(tdClass, 'text-right')}>
                      <Button size="sm" variant="ghost" onClick={() => returnLoan.mutate(t.id)} disabled={returnLoan.isPending}>
                        Return
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={10} total={loans.data.total} onPage={setPage} />
        </>
      )}
    </section>
  )
}
