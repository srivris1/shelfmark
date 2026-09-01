import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChatCenteredText, MagnifyingGlass, Plus, Printer, X } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { api } from '../lib/api'
import type { Availability, Book, Category, Page, SmartSearchResult } from '../lib/types'
import { BookForm } from '../components/BookForm'
import {
  Button,
  CopiesMeter,
  Drawer,
  EmptyState,
  ErrorNote,
  Input,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Spinner,
  StatusTag,
  buttonClass,
  cx,
  tableClass,
  tdClass,
  thClass,
} from '../components/ui'

const PAGE_SIZE = 20
const ENGINE: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', offline: 'offline rules' }

function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function BooksPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [mode, setMode] = useState<'search' | 'ask'>('search')
  const [text, setText] = useState(params.get('q') ?? '')
  const [question, setQuestion] = useState('')
  const [explanation, setExplanation] = useState<{ text: string; source: string } | null>(null)
  const [adding, setAdding] = useState(false)

  const filters = {
    q: params.get('q') ?? '',
    category: params.get('category') ?? '',
    author: params.get('author') ?? '',
    title: params.get('title') ?? '',
    keywords: params.get('keywords') ?? '',
    availability: (params.get('availability') as Availability) || 'all',
    sort: params.get('sort') ?? 'title',
    page: Number(params.get('page') ?? 1),
  }

  const update = (changes: Record<string, string | number | undefined>, keepExplanation = false) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '' || value === 'all') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
    if (!keepExplanation) setExplanation(null)
  }

  
  const debounced = useDebounced(text)
  useEffect(() => {
    if (mode === 'search' && debounced !== filters.q) update({ q: debounced })
    
  }, [debounced, mode])

  const books = useQuery({
    queryKey: ['books', filters],
    queryFn: () => api<Page<Book>>('/books', { query: { ...filters, pageSize: PAGE_SIZE } }),
    placeholderData: (previous) => previous,
  })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/books/categories') })
  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: () => api<{ provider: string; live: boolean }>('/ai/status'), staleTime: Infinity })

  const ask = useMutation({
    mutationFn: (query: string) => api<SmartSearchResult>('/ai/search', { method: 'POST', body: { query } }),
    onSuccess: ({ filters: f, explanation: why, source }) => {
      setText('')
      update({ q: undefined, category: f.category ?? undefined, author: f.author ?? undefined, title: f.title ?? undefined, keywords: f.keywords.join(','), availability: f.availability }, true)
      setExplanation({ text: why, source })
    },
    onError: (err) => toast.error(err.message),
  })

  function submitQuestion(e: FormEvent) {
    e.preventDefault()
    if (question.trim().length >= 2) ask.mutate(question.trim())
  }

  const chips = [
    filters.title && { key: 'title', label: `Title: ${filters.title}` },
    filters.author && { key: 'author', label: `Author: ${filters.author}` },
    ...filters.keywords.split(',').filter(Boolean).map((word) => ({ key: `kw:${word}`, label: `“${word}”` })),
  ].filter(Boolean) as { key: string; label: string }[]

  const removeChip = (key: string) => {
    if (key.startsWith('kw:')) {
      const word = key.slice(3)
      update({ keywords: filters.keywords.split(',').filter((k) => k && k !== word).join(',') })
    } else update({ [key]: undefined })
  }

  const hasFilters = Boolean(filters.q || filters.category || filters.availability !== 'all' || chips.length)
  const labelsLink = `/labels?${new URLSearchParams(Object.entries({ q: filters.q, category: filters.category }).filter(([, v]) => v)).toString()}`

  return (
    <>
      <PageHeader
        title="Catalogue"
        subtitle={books.data ? `${books.data.total} ${books.data.total === 1 ? 'title' : 'titles'}${hasFilters ? ' match' : ' in the library'}` : ' '}
        actions={
          <>
            <Link to={labelsLink} className={buttonClass('secondary')}>
              <Printer aria-hidden /> Print labels
            </Link>
            <Button variant="primary" icon={<Plus aria-hidden />} onClick={() => setAdding(true)}>
              Add book
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Search mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'search', label: <><MagnifyingGlass size={14} aria-hidden /> Search</> },
            { value: 'ask', label: <><ChatCenteredText size={14} aria-hidden /> Ask in plain words</> },
          ]}
        />
        {mode === 'ask' && aiStatus.data && (
          <span className="text-xs text-ink-3">
            Understood by {ENGINE[aiStatus.data.provider] ?? aiStatus.data.provider}
            {!aiStatus.data.live && ' (add an API key for smarter answers)'}
          </span>
        )}
      </div>

      {mode === 'search' ? (
        <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Title, author, ISBN or category" aria-label="Search the catalogue" className="h-11 text-[15px]" />
      ) : (
        <form onSubmit={submitQuestion} className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. fantasy by Tolkien that's on the shelf, or programming books nobody has returned"
            aria-label="Describe the books you want"
            className="h-11 text-[15px]"
            autoFocus
          />
          <Button type="submit" variant="primary" size="lg" busy={ask.isPending} disabled={question.trim().length < 2}>
            Find
          </Button>
        </form>
      )}

      {explanation && (
        <p className="animate-rise mt-3 text-sm text-ink-2">
          {explanation.text} <span className="text-xs text-ink-3">({ENGINE[explanation.source] ?? explanation.source})</span>
        </p>
      )}

      <div className="mt-5 mb-6 flex flex-wrap items-center gap-3">
        <Select value={filters.category} onChange={(e) => update({ category: e.target.value })} aria-label="Category" className="h-9 w-auto min-w-40">
          <option value="">All categories</option>
          {categories.data?.categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </Select>
        <Segmented
          label="Availability"
          value={filters.availability}
          onChange={(availability) => update({ availability })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'available', label: 'Available' },
            { value: 'issued', label: 'Issued' },
          ]}
        />
        <Select value={filters.sort} onChange={(e) => update({ sort: e.target.value })} aria-label="Sort by" className="h-9 w-auto">
          <option value="title">Title A–Z</option>
          <option value="author">Author A–Z</option>
          <option value="newest">Recently added</option>
          <option value="availability">Most copies free</option>
        </Select>
        {chips.map((chip) => (
          <button key={chip.key} onClick={() => removeChip(chip.key)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] text-ink hover:bg-surface-2" aria-label={`Remove filter ${chip.label}`}>
            {chip.label} <X size={12} aria-hidden />
          </button>
        ))}
        {hasFilters && (
          <button
            onClick={() => {
              setText('')
              setParams(new URLSearchParams(), { replace: true })
              setExplanation(null)
            }}
            className="text-[13px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {books.isError ? (
        <ErrorNote error={books.error} onRetry={() => books.refetch()} />
      ) : !books.data ? (
        <Spinner />
      ) : books.data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState title="No books match" action={<Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>Show everything</Button>}>
            Try fewer filters, or ask in plain words instead.
          </EmptyState>
        ) : (
          <EmptyState title="The shelves are empty" action={<Button variant="primary" onClick={() => setAdding(true)}>Add the first book</Button>}>
            Add a book and Shelfmark will make its QR label for you.
          </EmptyState>
        )
      ) : (
        <>
          <div className={cx('overflow-x-auto transition-opacity', books.isFetching && 'opacity-70')}>
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Title</th>
                  <th className={cx(thClass, 'hidden md:table-cell')}>Book ID</th>
                  <th className={cx(thClass, 'hidden lg:table-cell')}>Category</th>
                  <th className={cx(thClass, 'hidden sm:table-cell')}>Copies</th>
                  <th className={thClass}>Status</th>
                </tr>
              </thead>
              <tbody>
                {books.data.items.map((book) => (
                  <tr key={book.id} onClick={() => navigate(`/books/${book.id}`)} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                    <td className={tdClass}>
                      <Link to={`/books/${book.id}`} className="font-display text-[16px] leading-snug text-ink" onClick={(e) => e.stopPropagation()}>
                        {book.title}
                      </Link>
                      <p className="text-[13px] text-ink-2">{book.author}</p>
                    </td>
                    <td className={cx(tdClass, 'hidden font-mono text-xs text-ink-2 md:table-cell')}>{book.code}</td>
                    <td className={cx(tdClass, 'hidden text-ink-2 lg:table-cell')}>{book.category}</td>
                    <td className={cx(tdClass, 'hidden sm:table-cell')}>
                      <CopiesMeter available={book.availableCopies} total={book.totalCopies} />
                    </td>
                    <td className={tdClass}>
                      <StatusTag status={book.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={filters.page} pageSize={PAGE_SIZE} total={books.data.total} onPage={(page) => update({ page }, true)} />
        </>
      )}

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add a book">
        <BookForm
          onDone={(book) => {
            setAdding(false)
            toast.success(`${book.title} added`, { description: 'Its QR label is ready to print.' })
            navigate(`/books/${book.id}`)
          }}
        />
      </Drawer>
    </>
  )
}
