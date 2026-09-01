import { Router } from 'express'
import { z } from 'zod'
import { parse, optionalText } from '../lib/validate.js'
import { allTransactions, listTransactions } from '../services/transactions.js'
import { todayIn, transactionsCsv, transactionsXlsx } from '../services/reports.js'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const isoDay = optionalText(10).refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Use the YYYY-MM-DD format')

const filters = {
  q: optionalText(),
  status: z.enum(['all', 'active', 'issued', 'overdue', 'returned']).default('all'),
  bookId: optionalText(36).refine((v) => v === undefined || z.uuid().safeParse(v).success, 'That is not a valid book id'),
  borrowerId: optionalText(40),
  from: isoDay,
  to: isoDay,
}

const listSchema = z.object({
  ...filters,
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

const exportSchema = z.object({ ...filters, format: z.enum(['csv', 'xlsx']).default('csv') })

export function transactionsRouter({ db, config }) {
  const router = Router()

  router.get('/', async (req, res) => {
    res.json(await listTransactions(db, parse(listSchema, req.query), config))
  })

  router.get('/export', async (req, res) => {
    const { format, ...chosen } = parse(exportSchema, req.query)
    const rows = await allTransactions(db, chosen, config)
    const filename = `shelfmark-transactions-${todayIn(config.reportTimeZone)}.${format}`
    res.attachment(filename)

    if (format === 'csv') {
      res.type('text/csv; charset=utf-8').send(transactionsCsv(rows, config.reportTimeZone))
      return
    }
    const buffer = await transactionsXlsx(rows, { timeZone: config.reportTimeZone, generatedBy: req.user.name, filters: chosen })
    res.type(XLSX_TYPE).send(buffer)
  })

  return router
}
