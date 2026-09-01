import { z } from 'zod'
import { badRequest } from './errors.js'

export function parse(schema, input) {
  const result = schema.safeParse(input ?? {})
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }))
    throw badRequest('VALIDATION_ERROR', 'Some fields need fixing.', details)
  }
  return result.data
}


export const optionalText = (max = 100) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

export const emailField = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address'))

export const uuidParams = z.object({ id: z.uuid('That is not a valid id') })
export const intIdParams = z.object({ id: z.coerce.number().int().positive() })
