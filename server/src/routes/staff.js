import { Router } from 'express'
import { z } from 'zod'
import { parse, emailField, intIdParams } from '../lib/validate.js'
import { createStaff, deleteStaff, listStaff } from '../services/staff.js'

const staffSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  email: emailField,
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  role: z.enum(['admin', 'librarian']).default('librarian'),
})


export function staffRouter({ db, config }) {
  const router = Router()

  router.get('/', async (req, res) => {
    res.json({ staff: await listStaff(db) })
  })

  router.post('/', async (req, res) => {
    const input = parse(staffSchema, req.body)
    res.status(201).json({ staff: await createStaff(db, input, config.bcryptRounds) })
  })

  router.delete('/:id', async (req, res) => {
    const { id } = parse(intIdParams, req.params)
    await deleteStaff(db, id, req.user.id)
    res.status(204).end()
  })

  return router
}
