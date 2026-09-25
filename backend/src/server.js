import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { checkDatabaseConnection, closeDatabasePool } from './db.js'
import { requireAuth } from './auth/requireAuth.js'
import { authRouter } from './routes/auth.routes.js'
import { tasksRouter } from './routes/tasks.routes.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '127.0.0.1'

if (process.env.CORS_ORIGIN) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  }))
}

app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok' })
})

app.use('/api/auth', authRouter)
app.use('/api/tasks', requireAuth, tasksRouter)

app.use((request, response) => {
  response.status(404).json({
    error: true,
    message: 'Route not found.',
  })
})

app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error)
    return
  }

  console.error('[server] request error', error.message)

  if (error.code === 'DATABASE_URL_MISSING') {
    response.status(503).json({
      error: true,
      message: 'Database is not configured.',
    })
    return
  }

  response.status(error.status || 500).json({
    error: true,
    message: error.status ? error.message : 'Internal server error.',
  })
})

const server = app.listen(port, host, async () => {
  console.info(`[server] listening on http://${host}:${port}`)

  const databaseStatus = await checkDatabaseConnection()

  if (databaseStatus.ok) {
    console.info(`[database] ${databaseStatus.message}`)
    return
  }

  console.warn(`[database] ${databaseStatus.message}`)
})

server.on('error', (error) => {
  console.error('[server] startup error', error.message)
  process.exit(1)
})

async function shutdown(signal) {
  console.info(`[server] received ${signal}, shutting down`)

  server.close(async () => {
    try {
      await closeDatabasePool()
      process.exit(0)
    } catch (error) {
      console.error('[database] shutdown error', error.message)
      process.exit(1)
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

export { app, server }
