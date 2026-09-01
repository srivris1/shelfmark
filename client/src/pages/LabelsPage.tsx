import { Link, useSearchParams } from 'react-router'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer } from '@phosphor-icons/react'
import { api, qrUrl } from '../lib/api'
import type { Book, Category, Page } from '../lib/types'
import { Button, EmptyState, ErrorNote, Input, PageHeader, Select, Spinner } from '../components/ui'


export function LabelsPage() {
  const [params, setParams] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const category = params.get('category') ?? ''
  const q = params.get('q') ?? ''

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/books/categories'), enabled: ids.length === 0 })
  const list = useQuery({
    queryKey: ['books', { labels: true, category, q }],
    queryFn: () => api<Page<Book>>('/books', { query: { category, q, pageSize: 100 } }),
    enabled: ids.length === 0,
  })
  const picked = useQueries({
    queries: ids.map((id) => ({ queryKey: ['book', id], queryFn: () => api<{ book: Book }>(`/books/${id}`) })),
  })

  const books: Book[] = ids.length ? picked.flatMap((r) => (r.data ? [r.data.book] : [])) : (list.data?.items ?? [])
  const loading = ids.length ? picked.some((r) => r.isPending) : list.isPending
  const error = ids.length ? picked.find((r) => r.error)?.error : list.error

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="QR labels"
          subtitle="Print on plain A4, cut along the dashed lines and stick one inside each book's cover."
          actions={
            <Button variant="primary" icon={<Printer aria-hidden />} onClick={() => window.print()} disabled={!books.length}>
              Print {books.length ? `${books.length} ${books.length === 1 ? 'label' : 'labels'}` : ''}
            </Button>
          }
        />
        {ids.length > 0 ? (
          <Link to="/labels" className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-2 hover:text-ink">
            <ArrowLeft size={14} aria-hidden /> Show labels for the whole catalogue
          </Link>
        ) : (
          <div className="mb-6 flex flex-wrap gap-3">
            <Select value={category} onChange={(e) => set('category', e.target.value)} aria-label="Category" className="h-9 w-auto min-w-44">
              <option value="">Every category</option>
              {categories.data?.categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({c.count})
                </option>
              ))}
            </Select>
            <Input type="search" defaultValue={q} onChange={(e) => set('q', e.target.value)} placeholder="Only books matching…" aria-label="Filter labels" className="h-9 w-full sm:w-64" />
            {list.data && list.data.total > 100 && <p className="self-center text-[13px] text-ink-3">Showing the first 100. Narrow it down by category to print the rest.</p>}
          </div>
        )}
      </div>

      {error ? (
        <ErrorNote error={error} />
      ) : loading ? (
        <Spinner />
      ) : books.length === 0 ? (
        <EmptyState title="No books to label" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-0">
          {books.map((book) => (
            <div key={book.id} className="break-inside-avoid border border-dashed border-line-strong bg-[#fdfcf9] p-4 text-center text-[#1f1d19] print:border-[#bbb]">
              <img src={qrUrl(book.id, 'svg')} alt="" className="mx-auto aspect-square w-full max-w-[150px]" loading="lazy" />
              <p className="mt-2 line-clamp-2 font-display text-[13px] leading-tight">{book.title}</p>
              <p className="mt-0.5 font-mono text-[10px] text-[#57534b]">{book.code}</p>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
