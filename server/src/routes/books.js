import { Router } from 'express'
import QRCode from 'qrcode'
import { z } from 'zod'
import { parse, optionalText, uuidParams } from '../lib/validate.js'
import { createQrPayload } from '../lib/qr.js'
import { createBook, deleteBook, getBook, listBooks, listCategories, updateBook } from '../services/books.js'
import { listTransactions } from '../services/transactions.js'

const bookSchema = z.object({
  code: z.string().trim().min(1, 'ISBN or Book ID is required').max(40),
  title: z.string().trim().min(1, 'Title is required').max(200),
  author: z.string().trim().min(1, 'Author is required').max(120),
  category: z.string().trim().min(1, 'Category is required').max(60),
  totalCopies: z.coerce.number().int('Copies must be a whole number').min(1, 'There must be at least one copy').max(1000),
})

const patchSchema = bookSchema.partial().refine((patch) => Object.keys(patch).length > 0, 'Nothing to update')

const listSchema = z.object({
  q: optionalText(),
  title: optionalText(),
  author: optionalText(),
  category: optionalText(),
  
  keywords: optionalText(200).transform((v) => (v ? v.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 5) : [])),
  availability: z.enum(['all', 'available', 'issued']).default('all'),
  sort: z.enum(['title', 'author', 'newest', 'availability']).default('title'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

const qrQuery = z.object({
  format: z.enum(['png', 'svg']).default('png'),
  download: z.enum(['0', '1']).default('0'),
})

export function booksRouter({ db, config, events }) {
  const router = Router()
  const announce = (req, action, book) =>
    events.publish('catalog', { action, bookId: book.id, title: book.title, clientId: req.get('x-client-id')?.slice(0, 64) ?? null })

  router.get('/', async (req, res) => {
    res.json(await listBooks(db, parse(listSchema, req.query)))
  })

  router.get('/categories', async (req, res) => {
    res.json({ categories: await listCategories(db) })
  })

  router.post('/', async (req, res) => {
    const book = await createBook(db, parse(bookSchema, req.body))
    announce(req, 'created', book)
    res.status(201).json({ book })
  })

  router.get('/:id', async (req, res) => {
    const { id } = parse(uuidParams, req.params)
    const book = await getBook(db, id)
    const [open, history] = await Promise.all([
      listTransactions(db, { bookId: id, status: 'active', pageSize: 100 }, config),
      listTransactions(db, { bookId: id, pageSize: 25 }, config),
    ])
    res.json({ book, activeLoans: open.items, history: history.items })
  })

  router.patch('/:id', async (req, res) => {
    const { id } = parse(uuidParams, req.params)
    const book = await updateBook(db, id, parse(patchSchema, req.body))
    announce(req, 'updated', book)
    res.json({ book })
  })

  router.delete('/:id', async (req, res) => {
    const { id } = parse(uuidParams, req.params)
    const book = await getBook(db, id)
    const result = await deleteBook(db, id)
    announce(req, 'deleted', book)
    res.json(result)
  })

  router.get('/:id/qr', async (req, res) => {
    const { id } = parse(uuidParams, req.params)
    const { format, download } = parse(qrQuery, req.query)
    const book = await getBook(db, id)
    const payload = createQrPayload(book.id, config.qrSecret)
    const options = { errorCorrectionLevel: 'M', margin: 2 }

    
    res.set('Cache-Control', 'private, max-age=86400')
    if (download === '1') res.attachment(`${book.code}-qr.${format}`)

    if (format === 'svg') {
      res.type('image/svg+xml').send(await QRCode.toString(payload, { ...options, type: 'svg' }))
    } else {
      res.type('image/png').send(await QRCode.toBuffer(payload, { ...options, width: 480 }))
    }
  })

  return router
}
