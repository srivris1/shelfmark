import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, SpeakerHigh, SpeakerSlash, UserSwitch } from '@phosphor-icons/react'
import { api, ApiError } from '../lib/api'
import { dueLabel, formatDate, plural, rupees, stampDate } from '../lib/format'
import { useRefreshCirculation } from '../lib/mutations'
import { useSettings } from '../lib/useSettings'
import { beep } from '../lib/sound'
import type { Borrower, CirculationResult, Page, Transaction } from '../lib/types'
import { QrScannerPanel, type ScanSource } from '../components/QrScannerPanel'
import { DueSlip, type Slip } from '../components/DueSlip'
import { Button, Field, Input, PageHeader, Segmented, Select, cx } from '../components/ui'

type Mode = 'issue' | 'return'
type Target = { qr: string } | { bookCode: string }

const EMPTY_BORROWER = { id: '', name: '', contact: '', loanDays: 0 }

function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key)
      return saved === null ? initial : saved === '1'
    } catch {
      return initial
    }
  })
  const update = (next: boolean) => {
    setValue(next)
    try {
      localStorage.setItem(key, next ? '1' : '0')
    } catch {
      
    }
  }
  return [value, update] as const
}

export function DeskPage() {
  const [params, setParams] = useSearchParams()
  const mode: Mode = params.get('mode') === 'return' ? 'return' : 'issue'
  const settings = useSettings()
  const refresh = useRefreshCirculation()
  const [borrower, setBorrower] = useState(EMPTY_BORROWER)
  const [slips, setSlips] = useState<Slip[]>([])
  const [choice, setChoice] = useState<Transaction[] | null>(null)
  const [sound, setSound] = useStoredFlag('shelfmark-sound', true)

  const borrowerReady = borrower.id.trim().length >= 2 && borrower.name.trim().length >= 2
  const addSlip = (slip: Slip) => setSlips((current) => [slip, ...current].slice(0, 12))
  const feedback = (ok: boolean) => sound && beep(ok)
  const failed = (title: string) => (err: Error) => {
    feedback(false)
    addSlip({ key: `err-${Date.now()}`, kind: 'error', title, lines: [err.message] })
  }

  const issue = useMutation({
    mutationFn: (target: Target) =>
      api<CirculationResult>('/circulation/issue', {
        method: 'POST',
        body: {
          ...target,
          borrowerId: borrower.id.trim(),
          borrowerName: borrower.name.trim(),
          borrowerContact: borrower.contact.trim() || undefined,
          loanDays: borrower.loanDays || undefined,
        },
      }),
    onSuccess: ({ transaction, book }) => {
      feedback(true)
      addSlip({
        key: `issue-${transaction.id}`,
        kind: 'issued',
        title: transaction.book.title,
        lines: [`${transaction.borrower.name} · ${transaction.borrower.id}`, `${plural(book.availableCopies, 'copy', 'copies')} left on the shelf`],
        stamp: stampDate(transaction.dueAt),
      })
      refresh()
    },
    onError: failed("Couldn't issue that book"),
  })

  const giveBack = useMutation({
    mutationFn: (body: Target | { transactionId: number }) => api<CirculationResult>('/circulation/return', { method: 'POST', body }),
    onSuccess: ({ transaction }) => {
      feedback(true)
      setChoice(null)
      const late = transaction.daysOverdue > 0
      addSlip({
        key: `return-${transaction.id}`,
        kind: 'returned',
        title: transaction.book.title,
        lines: [`from ${transaction.borrower.name} · ${transaction.borrower.id}`, `Borrowed ${formatDate(transaction.issuedAt)}`],
        stamp: stampDate(transaction.returnedAt ?? new Date().toISOString()),
        note: late ? `${plural(transaction.daysOverdue, 'day', 'days')} late · collect ${rupees(transaction.fine)}` : 'Back on time',
        late,
      })
      refresh()
    },
    onError: (err) => {
      
      if (err instanceof ApiError && err.code === 'MULTIPLE_ACTIVE_LOANS') {
        setChoice((err.details as { loans: Transaction[] }).loans)
        return
      }
      failed("Couldn't return that book")(err)
    },
  })

  const busy = issue.isPending || giveBack.isPending

  function handleCode(code: string, source: ScanSource) {
    const target: Target = source === 'manual' && !code.startsWith('SHELFMARK:') ? { bookCode: code } : { qr: code }
    setChoice(null)
    if (mode === 'issue') issue.mutate(target)
    else giveBack.mutate(target)
  }

  const switchMode = (next: Mode) => {
    setChoice(null)
    setParams(next === 'return' ? { mode: 'return' } : {}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Scan desk"
        subtitle={mode === 'issue' ? 'Enter who is borrowing, then scan each book they hand you.' : 'Scan each book as it comes back. One copy out means one scan.'}
        actions={
          <>
            <Segmented
              label="Desk mode"
              size="lg"
              value={mode}
              onChange={switchMode}
              options={[
                { value: 'issue', label: <><ArrowUpRight size={16} aria-hidden /> Issue</> },
                { value: 'return', label: <><ArrowDownLeft size={16} aria-hidden /> Return</> },
              ]}
            />
            <Button variant="ghost" size="lg" onClick={() => setSound(!sound)} aria-label={sound ? 'Mute scan sounds' : 'Turn scan sounds on'} title={sound ? 'Scan sounds on' : 'Scan sounds off'}>
              {sound ? <SpeakerHigh aria-hidden /> : <SpeakerSlash aria-hidden />}
            </Button>
          </>
        }
      />

      <div className={cx('grid gap-10', mode === 'issue' ? 'lg:grid-cols-[minmax(300px,380px)_1fr]' : 'lg:grid-cols-[1.1fr_1fr]')}>
        {mode === 'issue' && (
          <BorrowerPanel borrower={borrower} onChange={setBorrower} defaultLoanDays={settings.data?.loanDays ?? 14} maxLoans={settings.data?.maxActiveLoans} />
        )}

        <section aria-label="Scanner">
          <QrScannerPanel onCode={handleCode} busy={busy} disabled={mode === 'issue' && !borrowerReady} disabledReason="Enter the borrower's ID and name first, then scan their books." />

          {choice && (
            <div className="animate-rise mt-6 rounded-md border border-line-strong bg-surface p-5" role="alertdialog" aria-label="Whose copy is this?">
              <p className="font-display text-lg">Whose copy is this?</p>
              <p className="mt-1 text-[13px] text-ink-2">{plural(choice.length, 'copy', 'copies')} of {choice[0].book.title} are out. Pick the borrower returning it.</p>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {choice.map((loan) => (
                  <li key={loan.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{loan.borrower.name}</p>
                      <p className="text-xs text-ink-3">
                        <span className="font-mono">{loan.borrower.id}</span> · {dueLabel(loan)}
                      </p>
                    </div>
                    <Button size="sm" variant="primary" busy={giveBack.isPending && giveBack.variables && 'transactionId' in giveBack.variables && giveBack.variables.transactionId === loan.id} onClick={() => giveBack.mutate({ transactionId: loan.id })}>
                      Return
                    </Button>
                  </li>
                ))}
              </ul>
              <Button size="sm" variant="ghost" className="mt-3" onClick={() => setChoice(null)}>
                Cancel
              </Button>
            </div>
          )}
        </section>

        {mode === 'return' && <SlipList slips={slips} mode={mode} />}
      </div>

      {mode === 'issue' && (
        <div className="mt-12">
          <SlipList slips={slips} mode={mode} />
        </div>
      )}
    </>
  )
}

function SlipList({ slips, mode }: { slips: Slip[]; mode: Mode }) {
  return (
    <section aria-label="This session">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">This session</h2>
        {slips.length > 0 && <span className="figures text-[13px] text-ink-3">{plural(slips.filter((s) => s.kind !== 'error').length, 'book', 'books')} processed</span>}
      </div>
      {slips.length === 0 ? (
        <p className="border-t border-line pt-5 text-sm text-ink-3">
          {mode === 'issue' ? 'Each book you issue gets a date-due slip here.' : 'Returned books show up here with any late fine to collect.'}
        </p>
      ) : (
        <div className={cx('grid gap-4', mode === 'issue' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-1')}>
          {slips.map((slip) => (
            <DueSlip key={slip.key} slip={slip} />
          ))}
        </div>
      )}
    </section>
  )
}

function useDebouncedValue(value: string, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

interface BorrowerPanelProps {
  borrower: typeof EMPTY_BORROWER
  onChange: (b: typeof EMPTY_BORROWER) => void
  defaultLoanDays: number
  maxLoans?: number
}

function BorrowerPanel({ borrower, onChange, defaultLoanDays, maxLoans }: BorrowerPanelProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const idQuery = useDebouncedValue(borrower.id.trim())
  const set = (patch: Partial<typeof EMPTY_BORROWER>) => onChange({ ...borrower, ...patch })

  const suggestions = useQuery({
    queryKey: ['borrowers', idQuery],
    queryFn: () => api<{ borrowers: Borrower[] }>('/circulation/borrowers', { query: { q: idQuery } }),
    enabled: showSuggestions && idQuery.length >= 2,
  })
  const current = useQuery({
    queryKey: ['transactions', { borrowerId: idQuery, status: 'active' }],
    queryFn: () => api<Page<Transaction>>('/transactions', { query: { borrowerId: idQuery, status: 'active', pageSize: 20 } }),
    enabled: idQuery.length >= 4,
  })

  const matches = (suggestions.data?.borrowers ?? []).filter((b) => b.id !== borrower.id.trim().toUpperCase())
  const loans = current.data?.items ?? []
  const overdue = loans.filter((l) => l.status === 'overdue')

  return (
    <section aria-label="Borrower" className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-xl font-medium">Borrower</h2>
        {(borrower.id || borrower.name) && (
          <button onClick={() => onChange(EMPTY_BORROWER)} className="inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <UserSwitch size={15} aria-hidden /> Next borrower
          </button>
        )}
      </div>

      <Field label="Registration or staff ID" htmlFor="borrower-id">
        <div className="relative">
          <Input
            id="borrower-id"
            value={borrower.id}
            onChange={(e) => {
              set({ id: e.target.value })
              setShowSuggestions(true)
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="RA2311003010045"
            className="font-mono uppercase"
            autoComplete="off"
            autoFocus
          />
          {showSuggestions && matches.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-md border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              {matches.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange({ ...borrower, id: b.id, name: b.name, contact: b.contact ?? '' })
                      setShowSuggestions(false)
                    }}
                  >
                    <span>
                      <span className="block text-sm">{b.name}</span>
                      <span className="font-mono text-xs text-ink-3">{b.id}</span>
                    </span>
                    {b.activeLoans > 0 && <span className="text-xs text-ink-2">{plural(b.activeLoans, 'book', 'books')} out</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      <Field label="Name" htmlFor="borrower-name">
        <Input id="borrower-name" value={borrower.name} onChange={(e) => set({ name: e.target.value })} placeholder="Full name" autoComplete="off" />
      </Field>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Email or phone" htmlFor="borrower-contact" hint="Optional, for reminders">
          <Input id="borrower-contact" value={borrower.contact} onChange={(e) => set({ contact: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Loan period" htmlFor="loan-days">
          <Select id="loan-days" value={borrower.loanDays || defaultLoanDays} onChange={(e) => set({ loanDays: Number(e.target.value) })} className="w-28">
            {[...new Set([7, defaultLoanDays, 21, 30])].sort((a, b) => a - b).map((days) => (
              <option key={days} value={days}>
                {days} days
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {loans.length > 0 && (
        <div className={cx('rounded-md px-4 py-3 text-[13px]', overdue.length ? 'bg-tag-red-bg text-tag-red-ink' : 'bg-surface-2 text-ink-2')}>
          <p className="font-medium">
            Already has {plural(loans.length, 'book', 'books')}
            {maxLoans ? ` (limit ${maxLoans})` : ''}
            {overdue.length > 0 && `, ${overdue.length} overdue`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {loans.map((l) => (
              <li key={l.id}>
                {l.book.title} · {dueLabel(l)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
