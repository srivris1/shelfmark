import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { parseSearchOffline, suggestCategoryOffline } from '../src/services/ai/offline.js'
import { createAi } from '../src/services/ai/index.js'
import { setupApp, addBook } from './helpers.js'

const CATEGORIES = ['Fantasy', 'Science Fiction', 'Technology', 'History', 'Self-Help', 'Biography']

describe('offline search parser (used when no AI key is configured)', () => {
  it('pulls out author, category and availability', () => {
    const { filters } = parseSearchOffline('available fantasy books by tolkien', CATEGORIES)
    expect(filters).toMatchObject({ author: 'tolkien', category: 'Fantasy', availability: 'available', keywords: [] })
  })

  it('understands "not available" and synonyms like sci-fi', () => {
    const { filters } = parseSearchOffline('sci-fi that is not available right now', CATEGORIES)
    expect(filters).toMatchObject({ category: 'Science Fiction', availability: 'issued' })
  })

  it('keeps meaningful leftover words as keywords', () => {
    const { filters } = parseSearchOffline('show me books about python programming', CATEGORIES)
    expect(filters.keywords).toEqual(['python', 'programming'])
    expect(filters.category).toBeNull()
  })

  it('does not keep topic words the category already covers', () => {
    const { filters } = parseSearchOffline('fantasy books about dragons', CATEGORIES)
    expect(filters).toMatchObject({ category: 'Fantasy', keywords: [] })
  })

  it('always explains what it understood', () => {
    expect(parseSearchOffline('history', CATEGORIES).explanation).toMatch(/History/)
  })
})

describe('offline category suggestion', () => {
  it('prefers an existing category that matches the title', () => {
    expect(suggestCategoryOffline({ title: 'Clean Code: A Handbook of Agile Software Craftsmanship', author: 'Robert C. Martin' }, CATEGORIES)).toMatchObject({
      category: 'Technology',
      isNew: false,
    })
  })

  it('suggests a new category when nothing fits', () => {
    const result = suggestCategoryOffline({ title: 'The Joy of Cooking', author: 'Irma Rombauer' }, CATEGORIES)
    expect(result.category).toBe('Cooking')
    expect(result.isNew).toBe(true)
  })

  it('falls back to General', () => {
    expect(suggestCategoryOffline({ title: 'Zzyzx', author: 'Nobody' }, []).category).toBe('General')
  })
})

describe('AI service wrapper', () => {
  it('uses the provider when it answers', async () => {
    const provider = {
      name: 'fake',
      model: 'fake-1',
      generateJson: async () => ({ title: null, author: 'Tolkien', category: 'fantasy', availability: 'available', keywords: [], explanation: 'Fantasy by Tolkien on the shelf' }),
    }
    const ai = createAi({ provider })
    const result = await ai.interpretSearch('any tolkien fantasy I can borrow', CATEGORIES)
    expect(result.source).toBe('fake')
    
    expect(result.filters).toMatchObject({ author: 'Tolkien', category: 'Fantasy', availability: 'available' })
  })

  it('moves an invented category into keywords', async () => {
    const provider = {
      name: 'fake',
      generateJson: async () => ({ title: null, author: null, category: 'Wizards', availability: 'all', keywords: [], explanation: 'x' }),
    }
    const { filters } = await createAi({ provider }).interpretSearch('wizard books', CATEGORIES)
    expect(filters.category).toBeNull()
    expect(filters.keywords).toContain('Wizards')
  })

  it('drops keywords that only restate the category', async () => {
    
    const provider = {
      name: 'fake',
      generateJson: async () => ({ title: null, author: null, category: 'Technology', availability: 'available', keywords: ['programming', 'Tech', 'rust'], explanation: 'x' }),
    }
    const { filters } = await createAi({ provider }).interpretSearch('programming books about rust on the shelf', CATEGORIES)
    expect(filters).toMatchObject({ category: 'Technology', keywords: ['rust'] })
  })

  it('falls back to the offline parser when the provider fails', async () => {
    const provider = {
      name: 'fake',
      generateJson: async () => {
        throw new Error('network down')
      },
    }
    const result = await createAi({ provider, logger: { warn() {} } }).interpretSearch('fantasy by tolkien', CATEGORIES)
    expect(result.source).toBe('offline')
    expect(result.filters).toMatchObject({ author: 'tolkien', category: 'Fantasy' })
  })

  it('works with no provider at all', async () => {
    const ai = createAi({})
    expect(ai.status()).toEqual({ provider: 'offline', model: null, live: false })
    expect((await ai.suggestCategory({ title: 'A Brief History of Time', author: 'Stephen Hawking' }, ['Science'])).category).toBe('Science')
  })

  it('picks Claude or Gemini from the available keys', () => {
    expect(createAi({ anthropicKey: 'sk-ant-x' }).status()).toMatchObject({ provider: 'claude', model: 'claude-opus-5', live: true })
    expect(createAi({ geminiKey: 'g-x' }).status()).toMatchObject({ provider: 'gemini', model: 'gemini-2.5-flash', live: true })
    expect(createAi({ geminiKey: 'g-x', anthropicKey: 'a', provider: 'none' }).status().provider).toBe('offline')
  })
})

describe('AI routes', () => {
  let t
  beforeAll(async () => {
    const provider = {
      name: 'fake',
      model: 'fake-1',
      generateJson: async ({ prompt }) =>
        prompt.includes('Suggest')
          ? { category: 'Fantasy', reason: 'Dragons and elves.' }
          : { title: null, author: 'tolkien', category: 'Fantasy', availability: 'all', keywords: [], explanation: 'Fantasy books by Tolkien' },
    }
    t = await setupApp({ ai: createAi({ provider }) })
    await addBook(t.librarian, { title: 'The Hobbit', author: 'J.R.R. Tolkien', category: 'Fantasy' })
    await addBook(t.librarian, { title: 'Sapiens', author: 'Yuval Noah Harari', category: 'History' })
  })
  afterAll(() => t.close())

  it('turns a sentence into filters and returns matching books', async () => {
    const res = await t.librarian.post('/api/ai/search').send({ query: 'anything by tolkien?' }).expect(200)
    expect(res.body.source).toBe('fake')
    expect(res.body.filters.author).toBe('tolkien')
    expect(res.body.results.items.map((b) => b.title)).toEqual(['The Hobbit'])
  })

  it('suggests a category for a new book', async () => {
    const res = await t.librarian.post('/api/ai/categorize').send({ title: 'The Silmarillion', author: 'Tolkien' }).expect(200)
    expect(res.body).toMatchObject({ category: 'Fantasy', isNew: false, source: 'fake' })
  })

  it('reports which engine is active', async () => {
    const res = await t.librarian.get('/api/ai/status').expect(200)
    expect(res.body).toEqual({ provider: 'fake', model: 'fake-1', live: true })
  })

  it('validates input', async () => {
    await t.librarian.post('/api/ai/search').send({ query: ' ' }).expect(400)
    await t.librarian.post('/api/ai/categorize').send({ author: 'x' }).expect(400)
  })

  it('still works when the app was started without an AI engine', async () => {
    const plain = await setupApp()
    try {
      await addBook(plain.librarian, { title: 'Dune', author: 'Frank Herbert', category: 'Science Fiction' })
      const res = await plain.librarian.post('/api/ai/search').send({ query: 'science fiction by herbert' }).expect(200)
      expect(res.body.source).toBe('offline')
      expect(res.body.results.items.map((b) => b.title)).toEqual(['Dune'])
    } finally {
      await plain.close()
    }
  })
})
