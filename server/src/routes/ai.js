import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { parse } from '../lib/validate.js'
import { createAi } from '../services/ai/index.js'
import { listBooks, listCategories } from '../services/books.js'

const searchSchema = z.object({ query: z.string().trim().min(2, 'Type what you are looking for').max(300) })
const categorizeSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  author: z.string().trim().max(120).default(''),
})

export function aiRouter({ db, ai }) {
  const router = Router()
  const engine = ai ?? createAi({})
  const categoryNames = async () => (await listCategories(db)).map((c) => c.name)

  // model calls cost money (or free-tier quota), so cap them per staff member
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    keyGenerator: (req) => `staff-${req.user.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ error: { code: 'AI_RATE_LIMITED', message: 'Smart search is cooling down. Try again in a minute.' } }),
  })

  router.get('/status', (req, res) => res.json(engine.status()))

  router.post('/search', limiter, async (req, res) => {
    const { query } = parse(searchSchema, req.body)
    const { filters, explanation, source } = await engine.interpretSearch(query, await categoryNames())
    const results = await listBooks(db, { ...filters, pageSize: 50 })
    res.json({ query, filters, explanation, source, results })
  })

  router.post('/categorize', limiter, async (req, res) => {
    const book = parse(categorizeSchema, req.body)
    res.json(await engine.suggestCategory(book, await categoryNames()))
  })

  return router
}
