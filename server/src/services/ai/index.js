import { z } from 'zod'
import { createClaudeProvider } from './claude.js'
import { createGeminiProvider } from './gemini.js'
import { explain, parseSearchOffline, restatesCategory, suggestCategoryOffline } from './offline.js'

const SearchFilters = z.object({
  title: z.string().nullable(),
  author: z.string().nullable(),
  category: z.string().nullable(),
  availability: z.enum(['all', 'available', 'issued']),
  keywords: z.array(z.string()),
  explanation: z.string(),
})

const CategoryGuess = z.object({
  category: z.string(),
  reason: z.string(),
})

const SEARCH_SYSTEM = `You turn a librarian's search request into filters for a library catalogue search.
Rules:
- category: copy one of the catalogue categories exactly, or null if none clearly applies.
- author: the author's name or surname if the request mentions one, otherwise null.
- title: only when the request quotes or clearly names one specific book, otherwise null.
- availability: "available" if they want books that can be borrowed right now, "issued" if they want books that are currently checked out, otherwise "all".
- keywords: at most 4 words that narrow the search beyond the category and are likely to appear in a book's title. Leave it empty when the category already covers the request (e.g. "programming books" is just the Technology category). Never include filler such as "books", "show me" or "please", and don't repeat the author.
- explanation: one short, friendly sentence telling the librarian what you searched for.`

const CATEGORY_SYSTEM = `You help librarians shelve new books. Pick the best category for the book.
Prefer one of the library's existing categories when it fits reasonably well; only invent a new one (one or two words, Title Case) when none do.
Give a one-sentence reason a librarian would find useful.`

function pickEngine({ provider, anthropicKey, geminiKey, model }) {
  if (provider && typeof provider === 'object') return provider 
  if (provider === 'none' || provider === 'offline') return null
  if ((!provider || provider === 'claude') && anthropicKey) return createClaudeProvider({ apiKey: anthropicKey, model })
  if ((!provider || provider === 'gemini') && geminiKey) return createGeminiProvider({ apiKey: geminiKey, model })
  return null
}

const cleanText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '') || null

// Model output is treated like user input: trimmed, length-capped, and the
// category must be one the catalogue actually has.
function sanitizeFilters(raw, categories) {
  const category = categories.find((c) => c.toLowerCase() === raw.category?.trim().toLowerCase()) ?? null
  const keywords = [...raw.keywords, ...(raw.category && !category ? [raw.category] : [])]
    .map((k) => cleanText(k, 40))
    .filter((k) => k && !(category && restatesCategory(k, category)))
    .slice(0, 5)
  return { title: cleanText(raw.title, 120), author: cleanText(raw.author, 80), category, availability: raw.availability, keywords }
}

export function createAi({ logger = console, ...options } = {}) {
  const engine = pickEngine(options)
  const fail = (task, err) => logger.warn(`[ai] ${engine.name} ${task} failed, using offline rules instead: ${err.message}`)

  return {
    status: () => ({ provider: engine?.name ?? 'offline', model: engine?.model ?? null, live: Boolean(engine) }),

    async interpretSearch(query, categories) {
      if (engine) {
        try {
          const raw = SearchFilters.parse(
            await engine.generateJson({
              system: SEARCH_SYSTEM,
              prompt: `Catalogue categories: ${categories.join(', ') || '(none yet)'}\n\nLibrarian's request: "${query}"`,
              schema: SearchFilters,
            }),
          )
          const filters = sanitizeFilters(raw, categories)
          return { filters, explanation: cleanText(raw.explanation, 200) ?? explain(filters), source: engine.name }
        } catch (err) {
          fail('search', err)
        }
      }
      return { ...parseSearchOffline(query, categories), source: 'offline' }
    },

    async suggestCategory({ title, author }, categories) {
      if (engine) {
        try {
          const guess = CategoryGuess.parse(
            await engine.generateJson({
              system: CATEGORY_SYSTEM,
              prompt: `Suggest a shelf category for this book.\nTitle: ${title}\nAuthor: ${author || 'unknown'}\nExisting categories: ${categories.join(', ') || '(none yet)'}`,
              schema: CategoryGuess,
            }),
          )
          const name = cleanText(guess.category, 40) ?? 'General'
          const existing = categories.find((c) => c.toLowerCase() === name.toLowerCase())
          return { category: existing ?? name, isNew: !existing, reason: cleanText(guess.reason, 200) ?? '', source: engine.name }
        } catch (err) {
          fail('categorize', err)
        }
      }
      return { ...suggestCategoryOffline({ title, author }, categories), source: 'offline' }
    },
  }
}
