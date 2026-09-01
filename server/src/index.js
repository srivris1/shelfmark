import { loadConfig } from './config.js'
import { createDb, migrate } from './db/index.js'
import { createApp } from './app.js'
import { createAi } from './services/ai/index.js'
import { createEventBus } from './services/events.js'
import { ensureStarterData } from './seed.js'

const config = loadConfig()
const db = await createDb(config)
await migrate(db)
await ensureStarterData(db, config)

const ai = createAi(config.ai)
const app = createApp({ db, config, ai, events: createEventBus(), clientDist: config.clientDist })

const server = app.listen(config.port, () => {
  const { provider, model } = ai.status()
  console.log(`Shelfmark API listening on http://localhost:${config.port}`)
  console.log(`Database: ${db.kind === 'pglite' ? `PGlite (local files in ${config.dataDir})` : 'PostgreSQL'}`)
  console.log(`Smart search: ${provider === 'offline' ? 'offline rules (set GEMINI_API_KEY or ANTHROPIC_API_KEY to use an LLM)' : `${provider} / ${model}`}`)
})

async function shutdown() {
  server.closeAllConnections() 
  server.close()
  await db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
