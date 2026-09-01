import { HttpError } from '../lib/errors.js'

const send = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details && { details }) } })

export function errorHandler(config) {
  
  return (err, req, res, next) => {
    if (err instanceof HttpError) return send(res, err.status, err.code, err.message, err.details)
    if (err.type === 'entity.parse.failed') return send(res, 400, 'BAD_JSON', 'Request body is not valid JSON.')
    if (err.type === 'entity.too.large') return send(res, 413, 'TOO_LARGE', 'Request body is too large.')

    
    if (config.env !== 'test') console.error(err)
    return send(res, 500, 'INTERNAL', 'Something went wrong on our side. Please try again.')
  }
}

export const apiNotFound = (req, res) => send(res, 404, 'NOT_FOUND', 'No such API endpoint.')
