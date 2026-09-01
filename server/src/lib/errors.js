
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (code, message, details) => new HttpError(400, code, message, details)
export const unauthorized = (message = 'Please sign in to continue.') => new HttpError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = "You don't have permission to do that.") => new HttpError(403, 'FORBIDDEN', message)
export const notFound = (code, message) => new HttpError(404, code, message)
export const conflict = (code, message, details) => new HttpError(409, code, message, details)
