import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

// Local development only: create random secrets once and keep them in data/
// (gitignored), so sessions and printed QR labels survive restarts with zero setup.
function devSecrets(dataDir) {
  const file = path.join(dataDir, 'dev-secrets.json')
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
  const secrets = { jwtSecret: randomBytes(32).toString('hex'), qrSecret: randomBytes(32).toString('hex') }
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(file, JSON.stringify(secrets, null, 2))
  return secrets
}

function checkTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return timeZone
  } catch {
    throw new Error(`REPORT_TIMEZONE "${timeZone}" is not a valid IANA time zone (e.g. Asia/Kolkata).`)
  }
}

export function loadConfig(env = process.env) {
  const isProd = env.NODE_ENV === 'production'
  const dataDir = path.resolve(SERVER_ROOT, env.DATA_DIR || 'data')
  const missingSecrets = !env.JWT_SECRET || !env.QR_SECRET

  if (isProd && missingSecrets) {
    throw new Error('JWT_SECRET and QR_SECRET must be set when NODE_ENV=production. See .env.example.')
  }
  const generated = missingSecrets ? devSecrets(dataDir) : {}

  return {
    env: env.NODE_ENV || 'development',
    isProd,
    port: int(env.PORT, 4000),
    databaseUrl: env.DATABASE_URL || null,
    dataDir: path.join(dataDir, 'pglite'),
    jwtSecret: env.JWT_SECRET || generated.jwtSecret,
    qrSecret: env.QR_SECRET || generated.qrSecret,
    loanDays: int(env.LOAN_DAYS, 14),
    maxActiveLoans: int(env.MAX_ACTIVE_LOANS, 5),
    finePerDay: int(env.FINE_PER_DAY, 5),
    bcryptRounds: 10,
    loginRateLimit: int(env.LOGIN_RATE_LIMIT, 20),
    reportTimeZone: checkTimeZone(env.REPORT_TIMEZONE || 'Asia/Kolkata'),
    
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
    seedDemo: env.SEED_DEMO ? env.SEED_DEMO === 'true' : !isProd,
    admin: { name: env.ADMIN_NAME || 'Library Admin', email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    ai: {
      provider: env.AI_PROVIDER || undefined,
      anthropicKey: env.ANTHROPIC_API_KEY || undefined,
      geminiKey: env.GEMINI_API_KEY || undefined,
      model: env.AI_MODEL || undefined,
    },
    clientDist: path.resolve(SERVER_ROOT, '../client/dist'),
  }
}
