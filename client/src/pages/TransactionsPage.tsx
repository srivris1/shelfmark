import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { FileCsv, FileXls } from '@phosphor-icons/react'
import { api, exportUrl } from '../lib/api'
import { dueLabel, formatDateTime, rupees } from '../lib/format'
import { useReturnLoan } from '../lib/mutations'
import type { Page, Transaction } from '../lib/types'
import { Button, EmptyState, ErrorNote, Input, PageHeader, Pagination, Segmented, Spinner, StatusTag, buttonClass, cx, loanStatusKind, tableClass, tdClass, thClass } from '../components/ui'

type Status = 'all' | 'active' | 'overdue' | 'returned'
const PAGE_SIZE = 25

export function TransactionsPage() {
  const [params, setParams] = useSearchParams()
  const returnLoan = useReturnLoan()
  const filters = {
    q: params.get('q') ?? '',
    status: (params.get('status') as Status) || 'all',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    page: Number(params.get('page') ?? 1),
  }
  const [text, setText] = useState(filters.q)

  const update = (changes: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '' || value === 'all') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const id = setTimeout(() => text !== filters.q && update({ q: text }), 250)
    return () => clearTimeout(id)
    
  }, [text])

  const list = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api<Page<Transaction>>('/transactions', { query: { ...filters, pageSize: PAGE_SIZE } }),
    placeholderData: (previous) => previous,
  })

  
  const exportFilters = { q: filters.q, status: filters.status, from: filters.from, to: filters.to }
  const rangeInvalid = Boolean(filters.from && filters.to && filters.from > filters.to)

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Every issue and return, newest first."
        actions={
          <>
            <a href={exportUrl('csv', exportFilters)} className={buttonClass('secondary')} download>
              <FileCsv aria-hidden /> CSV
            </a>
            <a href={exportUrl('xlsx', exportFilters)} className={buttonClass('secondary')} download>
              <FileXls aria-hidden /> Excel
            </a>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Segmented
          label="Status"
          value={filters.status}
          onChange={(status) => update({ status })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Out now' },
            { value: 'overdue', label: 'Overdue' },
            { value: 'returned', label: 'Returned' },
          ]}
        />
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Book, borrower name or ID" aria-label="Search transactions" className="h-9 w-full sm:w-64" />
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Issued from
          <Input type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} className="h-9 w-auto" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          to
          <Input type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} className="h-9 w-auto" aria-invalid={rangeInvalid} />
        </label>
        {(filters.from || filters.to) && (
          <button onClick={() => update({ from: undefined, to: undefined })} className="h-9 text-[13px] text-ink-2 hover:text-ink hover:underline">
            Clear dates
          </button>
        )}
      </div>
      {rangeInvalid && <p className="-mt-3 mb-5 text-[13px] text-stamp">The start date is after the end date.</p>}

      {list.isError ? (
        <ErrorNote error={list.error} onRetry={() => list.refetch()} />
      ) : !list.data ? (
        <Spinner />
      ) : list.data.items.length === 0 ? (
        <EmptyState title="Nothing here">
          {filters.q || filters.status !== 'all' || filters.from || filters.to ? 'No transactions match these filters.' : 'Issue a book from the scan desk and it will be recorded here.'}
        </EmptyState>
      ) : (
        <>
          <div className={cx('overflow-x-auto transition-opacity', list.isFetching && 'opacity-70')}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={cx(thClass, 'hidden xl:table-cell')}>#</th>
                  <th className={thClass}>Book</th>
                  <th className={thClass}>Issued to</th>
                  <th className={cx(thClass, 'hidden md:table-cell')}>Issued</th>
                  <th className={cx(thClass, 'hidden lg:table-cell')}>Returned</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((t) => (
                  <tr key={t.id}>
                    <td className={cx(tdClass, 'figures hidden font-mono text-xs text-ink-3 xl:table-cell')}>{t.id}</td>
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
                    <td className={cx(tdClass, 'hidden text-ink-2 md:table-cell')}>
                      {formatDateTime(t.issuedAt)}
                      {t.issuedBy && <p className="text-xs text-ink-3">by {t.issuedBy}</p>}
                    </td>
                    <td className={cx(tdClass, 'hidden text-ink-2 lg:table-cell')}>{t.returnedAt ? formatDateTime(t.returnedAt) : '—'}</td>
                    <td className={tdClass}>
                      <StatusTag status={loanStatusKind(t)} />
                      <p className={cx('mt-1 text-xs', t.status === 'overdue' ? 'text-stamp' : 'text-ink-3')}>
                        {dueLabel(t)}
                        {t.fine > 0 && ` · ${rupees(t.fine)}`}
                      </p>
                    </td>
                    <td className={cx(tdClass, 'text-right')}>
                      {!t.returnedAt && (
                        <Button size="sm" variant="ghost" onClick={() => returnLoan.mutate(t.id)} disabled={returnLoan.isPending}>
                          Return
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={filters.page} pageSize={PAGE_SIZE} total={list.data.total} onPage={(page) => update({ page })} />
        </>
      )}
    </>
  )
}
