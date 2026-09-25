import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

const databaseUrl = process.env.DATABASE_URL

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
    })
  : null

if (pool) {
  pool.on('error', (error) => {
    console.error('[database] unexpected idle client error', error.message)
  })
}

export function getPool() {
  if (!pool) {
    const error = new Error('DATABASE_URL is not configured.')
    error.code = 'DATABASE_URL_MISSING'
    throw error
  }

  return pool
}

export function query(text, params) {
  return getPool().query(text, params)
}

export async function checkDatabaseConnection() {
  if (!pool) {
    return {
      ok: false,
      message: 'DATABASE_URL is not configured.',
    }
  }

  try {
    await pool.query('SELECT 1')
    return {
      ok: true,
      message: 'Database connection verified.',
    }
  } catch (error) {
    return {
      ok: false,
      message: error.message,
    }
  }
}

export async function closeDatabasePool() {
  if (pool) {
    await pool.end()
  }
}
