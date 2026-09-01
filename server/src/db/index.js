import { readFile } from 'node:fs/promises'








export async function createDb({ databaseUrl, dataDir, poolMax = 10 } = {}) {
  if (databaseUrl) return createPostgres(databaseUrl, poolMax)

  const { PGlite } = await import('@electric-sql/pglite')
  const lite = dataDir ? await PGlite.create(dataDir) : await PGlite.create()

  return {
    kind: 'pglite',
    query: (text, params) => lite.query(text, params),
    exec: (sql) => lite.exec(sql),
    tx: (fn) => lite.transaction((trx) => fn({ query: (text, params) => trx.query(text, params) })),
    close: () => lite.close(),
  }
}

async function createPostgres(connectionString, max) {
  const { default: pg } = await import('pg')
  const pool = new pg.Pool({ connectionString, max })

  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(client)
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

export async function migrate(db) {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  await db.exec(sql)
}
