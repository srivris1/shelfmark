import { createHmac, timingSafeEqual } from 'node:crypto'
import { badRequest } from './errors.js'




const PREFIX = 'SHELFMARK'
const VERSION = '1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const sign = (bookId, secret) =>
  createHmac('sha256', secret).update(`${VERSION}:${bookId.toLowerCase()}`).digest('base64url').slice(0, 16)

export const createQrPayload = (bookId, secret) => `${PREFIX}:${VERSION}:${bookId}:${sign(bookId, secret)}`

export function readQrPayload(raw, secret) {
  const [prefix, version, bookId = '', signature = '', ...extra] = String(raw ?? '').trim().split(':')

  if (prefix !== PREFIX || version !== VERSION || !UUID.test(bookId) || !signature || extra.length) {
    throw badRequest('INVALID_QR', "That QR code isn't a Shelfmark book label.")
  }

  const expected = Buffer.from(sign(bookId, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw badRequest('INVALID_QR', "This QR code wasn't issued by this library (signature mismatch).")
  }

  return bookId.toLowerCase()
}
