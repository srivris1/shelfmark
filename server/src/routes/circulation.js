import { Router } from 'express'
import { z } from 'zod'
import { parse, optionalText } from '../lib/validate.js'
import { issueBook, resolveScan, returnBook, searchBorrowers } from '../services/circulation.js'

const target = {
  qr: z.string().trim().min(1).max(300).optional(),
  bookCode: z.string().trim().min(1).max(40).optional(),
}
const exactlyOneTarget = (v) => Boolean(v.qr) !== Boolean(v.bookCode)
const TARGET_MESSAGE = { message: 'Scan a QR label or type a Book ID (one, not both).', path: ['qr'] }

const borrowerId = z
  .string()
  .trim()
  .min(2, 'Borrower ID is required')
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/, 'Borrower ID can only contain letters, numbers, dashes, dots or slashes')

const resolveSchema = z.object(target).refine(exactlyOneTarget, TARGET_MESSAGE)

const issueSchema = z
  .object({
    ...target,
    borrowerId,
    borrowerName: z.string().trim().min(2, 'Borrower name is required').max(80),
    borrowerContact: optionalText(120),
    loanDays: z.coerce.number().int().min(1, 'Loan must be at least a day').max(90, 'Loans can be at most 90 days').optional(),
  })
  .refine(exactlyOneTarget, TARGET_MESSAGE)

const returnSchema = z
  .object({
    ...target,
    transactionId: z.coerce.number().int().positive().optional(),
    borrowerId: borrowerId.optional(),
  })
  .refine((v) => (v.transactionId ? !v.qr && !v.bookCode : exactlyOneTarget(v)), TARGET_MESSAGE)

const borrowerQuery = z.object({ q: optionalText(60) })

export function circulationRouter({ db, config, events }) {
  const router = Router()
  
  const broadcast = (req, action, result) =>
    events.publish('circulation', { action, ...result, by: req.user.name, clientId: req.get('x-client-id')?.slice(0, 64) ?? null })

  router.post('/resolve', async (req, res) => {
    res.json(await resolveScan(db, parse(resolveSchema, req.body), config))
  })

  router.post('/issue', async (req, res) => {
    const result = await issueBook(db, parse(issueSchema, req.body), req.user, config)
    broadcast(req, 'issue', result)
    res.status(201).json(result)
  })

  router.post('/return', async (req, res) => {
    const result = await returnBook(db, parse(returnSchema, req.body), req.user, config)
    broadcast(req, 'return', result)
    res.json(result)
  })

  router.get('/borrowers', async (req, res) => {
    const { q } = parse(borrowerQuery, req.query)
    res.json({ borrowers: await searchBorrowers(db, q) })
  })

  return router
}
