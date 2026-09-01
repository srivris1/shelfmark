import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, DownloadSimple, PencilSimple, Printer, Trash } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { api, qrUrl } from '../lib/api'
import { dueLabel, formatDate, plural, rupees } from '../lib/format'
import { useReturnLoan } from '../lib/mutations'
import type { Book, Transaction } from '../lib/types'
import { BookForm } from '../components/BookForm'
import { Button, CopiesMeter, Drawer, EmptyState, ErrorNote, Spinner, StatusTag, buttonClass, cx, loanStatusKind, tableClass, tdClass, thClass } from '../components/ui'

interface BookDetail {
  book: Book
  activeLoans: Transaction[]
  history: Transaction[]
}

export function BookDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const returnLoan = useReturnLoan()

  const detail = useQuery({ queryKey: ['book', id], queryFn: () => api<BookDetail>(`/books/${id}`) })

  const remove = useMutation({
    mutationFn: () => api<{ deleted: boolean; archived: boolean }>(`/books/${id}`, { method: 'DELETE' }),
    onSuccess: (result) => {
      toast.success(result.archived ? 'Book archived' : 'Book deleted', {
        description: result.archived ? 'Its loan history is kept for reports.' : undefined,
      })
      ;['books', 'categories', 'dashboard'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      navigate('/books')
    },
    onError: (err) => {
      toast.error(err.message)
      setConfirming(false)
    },
  })

  if (detail.isPending) return <Spinner />
  if (detail.isError) {
    return detail.error.message.includes("couldn't find") ? (
      <EmptyState title="Book not found" action={<Link to="/books" className={buttonClass()}>Back to the catalogue</Link>}>
        It may have been removed from the catalogue.
      </EmptyState>
    ) : (
      <ErrorNote error={detail.error} onRetry={() => detail.refetch()} />
    )
  }

  const { book, activeLoans, history } = detail.data

  return (
    <>
      <Link to="/books" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Catalogue
      </Link>

      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        {}
        <article className="relative rounded-sm border border-line-strong bg-surface px-6 pt-5 pb-10 sm:px-9">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b-2 border-stamp/70 pb-2">
            <span className="font-mono text-[13px] text-ink-2">{book.code}</span>
            <StatusTag status={book.status} />
          </div>
          <div className="ruled pt-1">
            <h1 className="font-display text-[clamp(1.8rem,1.3rem+1.8vw,2.7rem)] leading-8 font-medium tracking-[-0.015em] text-ink">
              <span className="block pt-3 pb-[5px] leading-[1.05]">{book.title}</span>
            </h1>
            <p className="font-display text-lg leading-8 text-ink-2 italic">by {book.author}</p>
            <p className="leading-8 text-ink-2">
              <span className="text-ink-3">Category</span> {book.category}
            </p>
            <div className="flex items-center gap-3 leading-8">
              <span className="text-ink-3">Copies</span>
              <CopiesMeter available={book.availableCopies} total={book.totalCopies} />
              <span className="text-sm text-ink-2">{book.availableCopies > 0 ? `${book.availableCopies} on the shelf` : 'none on the shelf'}</span>
            </div>
            <p className="leading-8 text-ink-3">Added {formatDate(book.createdAt)}</p>
          </div>
          <span className="absolute bottom-3 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-line-strong bg-canvas" aria-hidden />

          <div className="mt-8 flex flex-wrap gap-2">
            <Button icon={<PencilSimple aria-hidden />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {confirming ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-tag-red-bg px-3 py-1.5 text-sm text-tag-red-ink">
                {history.length > 0 ? 'It has loan history, so it will be archived.' : 'Delete for good?'}
                <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
                  {history.length > 0 ? 'Archive' : 'Delete'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="ghost" icon={<Trash aria-hidden />} onClick={() => setConfirming(true)} disabled={activeLoans.length > 0} title={activeLoans.length ? 'Return all copies first' : undefined}>
                Delete
              </Button>
            )}
          </div>
        </article>

        {}
        <aside>
          <div className="mx-auto w-full max-w-[300px] rounded-md border border-line bg-[#fdfcf9] p-4 text-center text-[#1f1d19]">
            <img src={qrUrl(book.id, 'svg')} alt={`QR label for ${book.title}`} className="mx-auto aspect-square w-full" />
            <p className="mt-2 line-clamp-2 font-display text-[15px] leading-tight">{book.title}</p>
            <p className="mt-1 font-mono text-xs text-[#57534b]">{book.code}</p>
          </div>
          <p className="mt-3 text-center text-xs text-ink-3">Signed label. A copied or edited QR code won't scan.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <a href={qrUrl(book.id, 'png', true)} className={buttonClass('secondary', 'sm')} download>
              <DownloadSimple aria-hidden /> PNG
            </a>
            <a href={qrUrl(book.id, 'svg', true)} className={buttonClass('secondary', 'sm')} download>
              <DownloadSimple aria-hidden /> SVG
            </a>
            <Link to={`/labels?ids=${book.id}`} className={cx(buttonClass('secondary', 'sm'), 'col-span-2')}>
              <Printer aria-hidden /> Print label
            </Link>
          </div>
        </aside>
      </div>

      <section className="mt-14">
        <h2 className="mb-3 font-display text-xl font-medium">
          Out on loan <span className="figures text-ink-3">({activeLoans.length})</span>
        </h2>
        {activeLoans.length === 0 ? (
          <p className="border-t border-line py-5 text-sm text-ink-2">All {plural(book.totalCopies, 'copy is', 'copies are')} on the shelf.</p>
        ) : (
          <ul className="border-t border-line">
            {activeLoans.map((loan) => (
              <li key={loan.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">{loan.borrower.name}</p>
                  <p className="text-xs text-ink-3">
                    <span className="font-mono">{loan.borrower.id}</span>
                    {loan.borrower.contact && ` · ${loan.borrower.contact}`} · issued {formatDate(loan.issuedAt)}
                    {loan.issuedBy && ` by ${loan.issuedBy}`}
                  </p>
                </div>
                <p className={cx('text-[13px] font-medium', loan.status === 'overdue' ? 'text-stamp' : 'text-ink-2')}>
                  {dueLabel(loan)}
                  {loan.fine > 0 && ` · ${rupees(loan.fine)}`}
                </p>
                <Button size="sm" onClick={() => returnLoan.mutate(loan.id)} disabled={returnLoan.isPending}>
                  Mark returned
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-14">
        <h2 className="mb-3 font-display text-xl font-medium">History</h2>
        {history.length === 0 ? (
          <p className="border-t border-line py-5 text-sm text-ink-2">Nobody has borrowed this book yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Borrower</th>
                  <th className={thClass}>Issued</th>
                  <th className={cx(thClass, 'hidden sm:table-cell')}>Returned</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.id}>
                    <td className={tdClass}>
                      {t.borrower.name}
                      <p className="font-mono text-xs text-ink-3">{t.borrower.id}</p>
                    </td>
                    <td className={cx(tdClass, 'text-ink-2')}>{formatDate(t.issuedAt)}</td>
                    <td className={cx(tdClass, 'hidden text-ink-2 sm:table-cell')}>{t.returnedAt ? formatDate(t.returnedAt) : '—'}</td>
                    <td className={tdClass}>
                      <StatusTag status={loanStatusKind(t)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit book">
        <BookForm
          book={book}
          onDone={() => {
            setEditing(false)
            toast.success('Saved')
          }}
        />
      </Drawer>
    </>
  )
}
