

export function whereBuilder() {
  const clauses = []
  const params = []

  return {
    params,
    
    add(fragment, value) {
      params.push(value)
      clauses.push(fragment.replaceAll('$?', `$${params.length}`))
    },
    raw(fragment) {
      clauses.push(fragment)
    },
    param(value) {
      params.push(value)
      return `$${params.length}`
    },
    toSql: () => (clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''),
  }
}

// ILIKE pattern for "contains", with the user's own % and _ escaped.
export const containsPattern = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`



export const stem = (word) => word.replace(/(?:ing|ers|er|es|ed|s)$/i, (suffix, at) => (at >= 4 ? '' : suffix))
