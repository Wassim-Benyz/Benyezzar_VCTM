import { Router } from 'express'
import { getPool } from '../db.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { requireAuth } from '../auth/requireAuth.js'
import { createSessionToken } from '../auth/sessionToken.js'

const SESSION_COOKIE_NAME = 'benyezzar_session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const ALLOWED_REGISTER_FIELDS = new Set(['name', 'email', 'password'])
const ALLOWED_LOGIN_FIELDS = new Set(['email', 'password'])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const authRouter = Router()

authRouter.get('/me', requireAuth, (request, response) => {
  response.status(200).json({
    user: request.user,
  })
})

authRouter.post('/logout', requireAuth, async (request, response, next) => {
  try {
    await getPool().query(
      `
        UPDATE sessions
        SET revoked_at = now()
        WHERE id = $1
      `,
      [request.sessionId],
    )

    clearSessionCookie(response)
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

authRouter.post('/register', async (request, response, next) => {
  const validation = validateRegisterRequest(request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid registration.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const passwordHash = await hashPassword(validation.user.password)

    const userResult = await client.query(
      `
        INSERT INTO users (
          name,
          email,
          password_hash
        )
        VALUES ($1, $2, $3)
        RETURNING id, name, email
      `,
      [
        validation.user.name,
        validation.user.email,
        passwordHash,
      ],
    )
    const user = userResult.rows[0]
    const sessionToken = createSessionToken()

    await client.query(
      `
        INSERT INTO sessions (
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [
        user.id,
        sessionToken.tokenHash,
        sessionToken.expiresAt,
      ],
    )

    await client.query('COMMIT')

    setSessionCookie(response, sessionToken.token)

    response.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }

    if (error.code === '23505') {
      response.status(409).json({
        error: true,
        message: 'Email already exists.',
      })
      return
    }

    if (isPasswordValidationError(error)) {
      response.status(400).json({
        error: true,
        message: 'Invalid registration.',
        details: error.message,
      })
      return
    }

    next(error)
  } finally {
    client?.release()
  }
})

authRouter.post('/login', async (request, response, next) => {
  const validation = validateLoginRequest(request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid login.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()

    const userResult = await client.query(
      `
        SELECT id, name, email, password_hash
        FROM users
        WHERE lower(email) = $1
      `,
      [validation.credentials.email],
    )

    if (userResult.rowCount === 0) {
      response.status(401).json(createInvalidLoginResponse())
      return
    }

    const user = userResult.rows[0]
    const passwordMatches = await verifyPassword(
      validation.credentials.password,
      user.password_hash,
    )

    if (!passwordMatches) {
      response.status(401).json(createInvalidLoginResponse())
      return
    }

    await client.query('BEGIN')

    const sessionToken = createSessionToken()

    await client.query(
      `
        INSERT INTO sessions (
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3)
      `,
      [
        user.id,
        sessionToken.tokenHash,
        sessionToken.expiresAt,
      ],
    )

    await client.query('COMMIT')

    setSessionCookie(response, sessionToken.token)

    response.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }

    next(error)
  } finally {
    client?.release()
  }
})

function validateRegisterRequest(body = {}) {
  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object.')
  }

  const unsupportedFields = Object.keys(body).filter(
    (key) => !ALLOWED_REGISTER_FIELDS.has(key),
  )

  if (unsupportedFields.length > 0) {
    return invalid(`Unsupported field: ${unsupportedFields.join(', ')}.`)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = normalizeEmail(body.email)

  if (!name) {
    return invalid('Name is required.')
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    return invalid('Email must be a valid email address.')
  }

  return {
    ok: true,
    user: {
      name,
      email,
      password: body.password,
    },
  }
}

function validateLoginRequest(body = {}) {
  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object.')
  }

  const unsupportedFields = Object.keys(body).filter(
    (key) => !ALLOWED_LOGIN_FIELDS.has(key),
  )

  if (unsupportedFields.length > 0) {
    return invalid(`Unsupported field: ${unsupportedFields.join(', ')}.`)
  }

  const email = normalizeEmail(body.email)

  if (!email || !EMAIL_PATTERN.test(email)) {
    return invalid('Email must be a valid email address.')
  }

  if (typeof body.password !== 'string' || !body.password) {
    return invalid('Password is required.')
  }

  if (body.password.length < 8) {
    return invalid('Password must be at least 8 characters.')
  }

  if (body.password.length > 128) {
    return invalid('Password must be at most 128 characters.')
  }

  return {
    ok: true,
    credentials: {
      email,
      password: body.password,
    },
  }
}

function setSessionCookie(response, token) {
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
    secure: process.env.NODE_ENV === 'production',
  })
}

function clearSessionCookie(response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
}

function createInvalidLoginResponse() {
  return {
    error: true,
    message: 'Email or password is incorrect.',
  }
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : ''
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalid(message) {
  return {
    ok: false,
    message,
  }
}

function isPasswordValidationError(error) {
  return [
    'Password must be a string.',
    'Password must be at least 8 characters.',
    'Password must be at most 128 characters.',
  ].includes(error.message)
}
