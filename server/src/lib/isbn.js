import { badRequest } from './errors.js'


const CUSTOM_CODE = /^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/

function isbn10Valid(digits) {
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const value = digits[i] === 'X' ? 10 : Number(digits[i])
    sum += value * (10 - i)
  }
  return sum % 11 === 0
}

const isbn13Valid = (digits) =>
  [...digits].reduce((sum, d, i) => sum + Number(d) * (i % 2 === 0 ? 1 : 3), 0) % 10 === 0



export function normalizeBookCode(raw) {
  const code = String(raw ?? '').trim()
  const compact = code.replace(/[\s-]/g, '').toUpperCase()

  if (/^\d{13}$/.test(compact)) {
    if (!isbn13Valid(compact)) {
      throw badRequest('INVALID_ISBN', "That looks like an ISBN-13 but the check digit doesn't match. Double-check the number.")
    }
    return compact
  }

  if (/^\d{9}[\dX]$/.test(compact)) {
    if (!isbn10Valid(compact)) {
      throw badRequest('INVALID_ISBN', "That looks like an ISBN-10 but the check digit doesn't match. Double-check the number.")
    }
    return compact
  }

  if (!CUSTOM_CODE.test(code)) {
    throw badRequest('INVALID_BOOK_CODE', 'Book ID must be 2-40 characters: letters, numbers, dashes, dots or slashes.')
  }
  return code
}
