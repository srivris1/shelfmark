

const FORMULA_START = /^[=+\-@\t\r]/

function cell(value) {
  if (value === null || value === undefined) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(columns, rows) {
  const lines = [
    columns.map((col) => cell(col.header)),
    ...rows.map((row) => columns.map((col) => cell(col.value(row)))),
  ]
  return lines.map((line) => line.join(',')).join('\r\n') + '\r\n'
}
