import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Lightbulb } from '@phosphor-icons/react'
import { api, ApiError } from '../lib/api'
import type { Book, Category, CategorySuggestion } from '../lib/types'
import { Button, Field, Input } from './ui'

type Values = { code: string; title: string; author: string; category: string; totalCopies: string }

function validate(v: Values) {
  const errors: Partial<Record<keyof Values, string>> = {}
  if (!v.code.trim()) errors.code = 'ISBN or Book ID is required'
  if (!v.title.trim()) errors.title = 'Title is required'
  if (!v.author.trim()) errors.author = 'Author is required'
  if (!v.category.trim()) errors.category = 'Pick or type a category'
  const copies = Number(v.totalCopies)
  if (!Number.isInteger(copies) || copies < 1 || copies > 1000) errors.totalCopies = 'Between 1 and 1000 copies'
  return errors
}

const ENGINE_LABEL: Record<string, string> = { gemini: 'Gemini', claude: 'Claude', offline: 'offline rules' }

export function BookForm({ book, onDone }: { book?: Book; onDone: (book: Book) => void }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Values>({
    code: book?.code ?? '',
    title: book?.title ?? '',
    author: book?.author ?? '',
    category: book?.category ?? '',
    totalCopies: String(book?.totalCopies ?? 1),
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/books/categories') })

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    setErrors((errs) => ({ ...errs, [key]: '' }))
  }

  const suggest = useMutation({
    mutationFn: () => api<CategorySuggestion>('/ai/categorize', { method: 'POST', body: { title: values.title, author: values.author } }),
  })

  const save = useMutation({
    mutationFn: (body: Partial<Record<keyof Values, string | number>>) =>
      book ? api<{ book: Book }>(`/books/${book.id}`, { method: 'PATCH', body }) : api<{ book: Book }>('/books', { method: 'POST', body }),
    onSuccess: ({ book: saved }) => {
      ;['books', 'book', 'categories', 'dashboard'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      onDone(saved)
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) return setFormError('Could not save the book.')
      const fieldErrors = err.fieldErrors()
      if (Object.keys(fieldErrors).length) return setErrors(fieldErrors)
      if (['DUPLICATE_BOOK_CODE', 'INVALID_ISBN', 'INVALID_BOOK_CODE'].includes(err.code)) return setErrors({ code: err.message })
      if (err.code === 'COPIES_BELOW_ISSUED') return setErrors({ totalCopies: err.message })
      setFormError(err.message)
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const found = validate(values)
    if (Object.keys(found).length) return setErrors(found)

    const body = { ...values, totalCopies: Number(values.totalCopies) }
    
    const changed = book
      ? Object.fromEntries(Object.entries(body).filter(([key, value]) => String(value) !== String(book[key as keyof Book])))
      : body
    if (book && Object.keys(changed).length === 0) return onDone(book)
    save.mutate(changed)
  }

  const suggestion = suggest.data

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Field label="ISBN or Book ID" htmlFor="code" error={errors.code} hint="ISBNs are checked and stored without hyphens. Your own accession numbers work too.">
        <Input id="code" value={values.code} onChange={set('code')} aria-invalid={Boolean(errors.code)} className="font-mono" placeholder="978-0-13-235088-4" autoFocus={!book} />
      </Field>
      <Field label="Title" htmlFor="title" error={errors.title}>
        <Input id="title" value={values.title} onChange={set('title')} aria-invalid={Boolean(errors.title)} />
      </Field>
      <Field label="Author" htmlFor="author" error={errors.author}>
        <Input id="author" value={values.author} onChange={set('author')} aria-invalid={Boolean(errors.author)} />
      </Field>

      <Field label="Category" htmlFor="category" error={errors.category}>
        <div className="flex gap-2">
          <Input id="category" list="category-options" value={values.category} onChange={set('category')} aria-invalid={Boolean(errors.category)} />
          <Button
            variant="secondary"
            icon={<Lightbulb aria-hidden />}
            busy={suggest.isPending}
            disabled={!values.title.trim()}
            onClick={() => suggest.mutate()}
            title="Suggest a category from the title and author"
          >
            Suggest
          </Button>
        </div>
        <datalist id="category-options">
          {categories.data?.categories.map((c) => (
            <option key={c.name} value={c.name} />
          ))}
        </datalist>
      </Field>

      {suggest.isError && <p className="text-[13px] text-stamp">{suggest.error.message}</p>}
      {suggestion && (
        <div className="animate-rise rounded-md border border-line bg-surface-2 px-4 py-3 text-sm">
          <p>
            <span className="text-ink-2">Suggested:</span> <strong className="font-medium">{suggestion.category}</strong>
            {suggestion.isNew && <span className="text-ink-3"> (new category)</span>}
          </p>
          {suggestion.reason && <p className="mt-1 text-[13px] text-ink-2">{suggestion.reason}</p>}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-ink-3">via {ENGINE_LABEL[suggestion.source] ?? suggestion.source}</span>
            <Button size="sm" variant="ghost" onClick={() => setValues((v) => ({ ...v, category: suggestion.category }))}>
              Use this
            </Button>
          </div>
        </div>
      )}

      <Field label="Total copies" htmlFor="totalCopies" error={errors.totalCopies} hint={book ? `${book.issuedCopies} currently out on loan` : undefined}>
        <Input id="totalCopies" type="number" min={1} max={1000} inputMode="numeric" value={values.totalCopies} onChange={set('totalCopies')} aria-invalid={Boolean(errors.totalCopies)} className="w-32" />
      </Field>

      {formError && (
        <p className="rounded-md bg-tag-red-bg px-3 py-2 text-sm text-tag-red-ink" role="alert">
          {formError}
        </p>
      )}

      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" busy={save.isPending}>
          {book ? 'Save changes' : 'Add to catalogue'}
        </Button>
      </div>
    </form>
  )
}
