import { clientId } from './clientId'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }

  
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {}
    return Object.fromEntries(this.details.map((d: { field: string; message: string }) => [d.field, d.message]))
  }
}

type QueryValue = string | number | boolean | undefined | null

export const toQuery = (params: Record<string, QueryValue>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString()

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, QueryValue>
}

export async function api<T>(path: string, { method = 'GET', body, query }: RequestOptions = {}): Promise<T> {
  const qs = query ? toQuery(query) : ''
  let res: Response
  try {
    res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        'X-Client-Id': clientId,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.")
  }

  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const error = data?.error
    throw new ApiError(res.status, error?.code ?? `HTTP_${res.status}`, error?.message ?? 'Something went wrong. Please try again.', error?.details)
  }
  return data as T
}


export const exportUrl = (format: 'csv' | 'xlsx', filters: Record<string, QueryValue> = {}) =>
  `/api/transactions/export?${toQuery({ ...filters, format })}`

export const qrUrl = (bookId: string, format: 'png' | 'svg' = 'png', download = false) =>
  `/api/books/${bookId}/qr?${toQuery({ format, download: download ? '1' : undefined })}`
