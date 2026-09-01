import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'

export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5'



export function createClaudeProvider({ apiKey, model = DEFAULT_CLAUDE_MODEL }) {
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 })

  return {
    name: 'claude',
    model,
    async generateJson({ system, prompt, schema, maxTokens = 2048 }) {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: maxTokens,
        
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        
        output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: 'user', content: prompt }],
      })

      if (response.stop_reason === 'refusal') throw new Error('Claude declined the request')
      if (!response.parsed_output) throw new Error(`No structured output (stop_reason: ${response.stop_reason})`)
      return response.parsed_output
    },
  }
}
