import { describe, it, expect, vi, afterEach } from 'vitest'
import { z } from 'zod'

const parseMock = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { parse: parseMock } }
  },
}))

const { createClaudeProvider } = await import('../src/services/ai/claude.js')
const { createGeminiProvider } = await import('../src/services/ai/gemini.js')

const schema = z.object({ category: z.string(), reason: z.string() })

afterEach(() => {
  vi.unstubAllGlobals()
  parseMock.mockReset()
})

describe('Claude provider', () => {
  it('asks for structured output with refusal fallbacks and returns the parsed object', async () => {
    parseMock.mockResolvedValue({ stop_reason: 'end_turn', parsed_output: { category: 'Fantasy', reason: 'Dragons.' } })
    const claude = createClaudeProvider({ apiKey: 'test' })
    await expect(claude.generateJson({ system: 'sys', prompt: 'hi', schema })).resolves.toEqual({ category: 'Fantasy', reason: 'Dragons.' })

    const request = parseMock.mock.calls[0][0]
    expect(request).toMatchObject({ model: 'claude-opus-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'], system: 'sys' })
    expect(request.output_config.effort).toBe('low')
    expect(request.output_config.format).toBeTruthy()
  })

  it('throws on a refusal or a missing parse so the caller can fall back', async () => {
    const claude = createClaudeProvider({ apiKey: 'test' })
    parseMock.mockResolvedValueOnce({ stop_reason: 'refusal', parsed_output: null })
    await expect(claude.generateJson({ system: 's', prompt: 'p', schema })).rejects.toThrow(/declined/)
    parseMock.mockResolvedValueOnce({ stop_reason: 'max_tokens', parsed_output: null })
    await expect(claude.generateJson({ system: 's', prompt: 'p', schema })).rejects.toThrow(/max_tokens/)
  })
})

describe('Gemini provider', () => {
  const reply = (status, json) => ({ ok: status < 400, status, json: async () => json })
  const answer = { candidates: [{ content: { parts: [{ text: '{"category":"History","reason":"Old empires."}' }] } }] }

  it('retries once when the free tier is busy, then parses the JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503, {})).mockResolvedValueOnce(reply(200, answer))
    vi.stubGlobal('fetch', fetchMock)

    const gemini = createGeminiProvider({ apiKey: 'k' })
    await expect(gemini.generateJson({ system: 's', prompt: 'p', schema })).resolves.toEqual({ category: 'History', reason: 'Old empires.' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('gemini-2.5-flash:generateContent')
    expect(init.headers['x-goog-api-key']).toBe('k')
    const { generationConfig } = JSON.parse(init.body)
    expect(generationConfig.responseMimeType).toBe('application/json')
    
    expect(generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it('does not retry client errors and rejects output that breaks the schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(400, {}))
    vi.stubGlobal('fetch', fetchMock)
    await expect(createGeminiProvider({ apiKey: 'k' }).generateJson({ system: 's', prompt: 'p', schema })).rejects.toThrow(/HTTP 400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { candidates: [{ content: { parts: [{ text: '{"category":1}' }] } }] })))
    await expect(createGeminiProvider({ apiKey: 'k' }).generateJson({ system: 's', prompt: 'p', schema })).rejects.toThrow()
  })
})
