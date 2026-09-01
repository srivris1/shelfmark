import { z } from 'zod'




export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createGeminiProvider({ apiKey, model = DEFAULT_GEMINI_MODEL }) {
  return {
    name: 'gemini',
    model,
    async generateJson({ system, prompt, schema, maxTokens = 4096 }) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(schema),
          
          ...(/2\.5-flash/.test(model) && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      })

      
      let res
      for (let attempt = 1; attempt <= 2; attempt++) {
        res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: AbortSignal.timeout(20_000),
        })
        if (res.ok || !RETRYABLE.has(res.status)) break
        if (attempt === 1) await wait(800)
      }

      if (!res.ok) throw new Error(`Gemini returned HTTP ${res.status}`)
      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
      
      return schema.parse(JSON.parse(text))
    },
  }
}
