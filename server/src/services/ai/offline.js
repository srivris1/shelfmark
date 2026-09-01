




const HINTS = [
  { name: 'Science Fiction', aliases: ['science fiction', 'sci-fi', 'scifi', 'sci fi'], words: ['space', 'robot', 'robots', 'galaxy', 'alien', 'aliens', 'cyberpunk', 'dystopia', 'dune', 'foundation', 'asimov', 'herbert'] },
  { name: 'Fantasy', aliases: ['fantasy'], words: ['magic', 'wizard', 'wizards', 'dragon', 'dragons', 'elves', 'hobbit', 'sorcerer', 'throne', 'rings', 'witch', 'tolkien', 'rowling', 'silmarillion'] },
  { name: 'Technology', aliases: ['technology', 'tech'], words: ['programming', 'programmer', 'code', 'coding', 'software', 'computer', 'computers', 'algorithm', 'algorithms', 'javascript', 'python', 'java', 'data', 'machine learning', 'engineering', 'agile', 'developer', 'web', 'database', 'databases', 'pragmatic'] },
  { name: 'Science', aliases: ['science'], words: ['physics', 'chemistry', 'biology', 'universe', 'cosmos', 'time', 'quantum', 'evolution', 'gene', 'brain', 'mathematics', 'hawking', 'sagan'] },
  { name: 'History', aliases: ['history', 'historical'], words: ['war', 'empire', 'ancient', 'civilization', 'humankind', 'revolution', 'sapiens', 'guns'] },
  { name: 'Biography', aliases: ['biography', 'biographies', 'memoir', 'memoirs', 'autobiography'], words: ['life', 'wings of fire', 'educated', 'story of my'] },
  { name: 'Self-Help', aliases: ['self-help', 'self help'], words: ['habits', 'habit', 'productivity', 'mindset', 'success', 'motivation', 'focus', 'deep work', 'happiness', 'think', 'power'] },
  { name: 'Business', aliases: ['business', 'finance'], words: ['money', 'investing', 'investor', 'startup', 'startups', 'economics', 'marketing', 'rich', 'wealth', 'management', 'leadership'] },
  { name: 'Mystery', aliases: ['mystery', 'mysteries', 'detective', 'thriller', 'thrillers', 'crime'], words: ['murder', 'suspense', 'da vinci', 'christie', 'sherlock', 'girl with'] },
  { name: 'Fiction', aliases: ['fiction', 'literature', 'classics'], words: ['novel', 'gatsby', 'mockingbird', 'alchemist', 'library', 'orwell'] },
  { name: 'Philosophy', aliases: ['philosophy'], words: ['stoic', 'stoicism', 'ethics', 'meditations', 'meaning'] },
  { name: 'Poetry', aliases: ['poetry', 'poems'], words: ['poem', 'verse', 'sonnets'] },
  { name: 'Children', aliases: ['children', 'kids'], words: ['picture book', 'fairy tale', 'fairy tales'] },
  { name: 'Cooking', aliases: ['cookbook', 'cookbooks', 'cooking', 'recipes'], words: ['recipe', 'kitchen', 'baking', 'food'] },
]

const STOP_WORDS = new Set(
  `a an the any some all me show find list get give search look looking for i we you want need books book novels novel
   titles title copies copy that which who are is was be of on in at to with about by from written please can could do
   does have has there right now today tonight currently anything something stuff kind sort type genre category what where available
   issued borrowed borrow checked out loan shelf stock not unavailable author and or`.split(/\s+/),
)

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const phrase = (text) => new RegExp(`(^|[^a-z0-9])${escapeRegex(text.toLowerCase())}(?=$|[^a-z0-9])`)
const hasPhrase = (haystack, text) => phrase(text).test(haystack)

function findCategory(query, categories) {
  const candidates = []
  for (const name of categories) {
    const lower = name.toLowerCase()
    const forms = [lower, lower.endsWith('s') ? lower.slice(0, -1) : `${lower}s`]
    const hint = HINTS.find((h) => h.name.toLowerCase() === lower)
    for (const form of [...forms, ...(hint?.aliases ?? [])]) {
      if (hasPhrase(query, form)) candidates.push({ name, matched: form })
    }
  }
  
  return candidates.sort((a, b) => b.matched.length - a.matched.length)[0] ?? null
}

function findAvailability(query) {
  if (/\b(not available|unavailable|checked out|on loan|borrowed|issued|out right now)\b/.test(query)) {
    return /\bnot (issued|checked out|borrowed)\b/.test(query) ? { value: 'available' } : { value: 'issued' }
  }
  if (/\b(available|on the shelf|on shelf|in stock|can borrow|i can borrow)\b/.test(query)) return { value: 'available' }
  return { value: 'all' }
}

export function parseSearchOffline(rawQuery, categories) {
  let query = ` ${rawQuery.toLowerCase().replace(/[“”]/g, '"')} `

  const quoted = query.match(/"([^"]{2,80})"/)
  const title = quoted ? quoted[1].trim() : null
  if (quoted) query = query.replace(quoted[0], ' ')

  const authorMatch = query.match(
    /\b(?:by|author)\s+([a-z][a-z.' -]*?)(?=\s+(?:that|which|who|in|about|and|with|available|issued|on|from|published|books?|novels?)\b|[,.?!]|\s*$)/,
  )
  const author = authorMatch ? authorMatch[1].trim() : null
  if (authorMatch) query = query.replace(authorMatch[0], ' ')

  const category = findCategory(query, categories)
  if (category) query = query.replace(phrase(category.matched), ' ')

  const availability = findAvailability(query).value

  const keywords = [...new Set(query.split(/[^a-z0-9+#-]+/))]
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word) && !(category && restatesCategory(word, category.name)))
    .slice(0, 5)

  const filters = { title, author, category: category?.name ?? null, availability, keywords }
  return { filters, explanation: explain(filters) }
}

// "programming" for Technology, "dragons" for Fantasy: the category already says it,

export function restatesCategory(word, category) {
  const lower = word.trim().toLowerCase()
  const hint = HINTS.find((h) => h.name.toLowerCase() === category.toLowerCase())
  return lower === category.toLowerCase() || Boolean(hint && [...hint.aliases, ...hint.words].includes(lower))
}

export function explain({ title, author, category, availability, keywords }) {
  let text = title ? `Looking for "${title}"` : `Looking for ${category ?? 'all'} books`
  if (author) text += ` by ${author}`
  if (keywords.length) text += ` matching "${keywords.join(' ')}"`
  if (availability === 'available') text += ' that are on the shelf'
  if (availability === 'issued') text += ' that are currently issued'
  return `${text}.`
}

export function suggestCategoryOffline({ title, author = '' }, categories) {
  const text = ` ${title} ${author} `.toLowerCase()
  const existing = (name) => categories.find((c) => c.toLowerCase() === name.toLowerCase())

  const direct = categories.find((c) => hasPhrase(text, c))
  if (direct) return { category: direct, isNew: false, reason: `The title mentions "${direct}".` }

  let best = null
  for (const hint of HINTS) {
    const hits = [...hint.aliases, ...hint.words].filter((w) => hasPhrase(text, w)).length
    if (!hits) continue
    // on a tie prefer a category the library already uses
    const score = hits + (existing(hint.name) ? 0.5 : 0)
    if (!best || score > best.score) best = { hint, score }
  }

  if (!best) {
    const general = existing('General')
    return { category: general ?? 'General', isNew: !general, reason: 'No strong clues in the title, so it goes under General.' }
  }
  const match = existing(best.hint.name)
  return { category: match ?? best.hint.name, isNew: !match, reason: `Words in the title and author point to ${best.hint.name}.` }
}
