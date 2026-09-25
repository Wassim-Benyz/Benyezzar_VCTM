import { query } from '../db.js'
import { hashSessionToken } from './sessionToken.js'

const SESSION_COOKIE_NAME = 'benyezzar_session'
const AUTHENTICATION_REQUIRED_RESPONSE = {
  error: true,
  message: 'Authentication required.',
}

export async function requireAuth(request, response, next) {
  const token = request.cookies?.[SESSION_COOKIE_NAME]

  if (!token) {
    response.status(401).json(AUTHENTICATION_REQUIRED_RESPONSE)
    return
  }

  let tokenHash

  try {
    tokenHash = hashSessionToken(token)
  } catch {
    response.status(401).json(AUTHENTICATION_REQUIRED_RESPONSE)
    return
  }

  try {
    const { rows } = await query(
      `
        SELECT
          sessions.id AS session_id,
          users.id,
          users.name,
          users.email
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = $1
          AND sessions.revoked_at IS NULL
          AND sessions.expires_at > now()
        LIMIT 1
      `,
      [tokenHash],
    )

    if (rows.length === 0) {
      response.status(401).json(AUTHENTICATION_REQUIRED_RESPONSE)
      return
    }

    const user = rows[0]

    request.user = {
      id: user.id,
      name: user.name,
      email: user.email,
    }
    request.sessionId = user.session_id

    next()
  } catch (error) {
    next(error)
  }
}
