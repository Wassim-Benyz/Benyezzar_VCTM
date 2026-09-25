import { createHash, randomBytes } from 'crypto'

const TOKEN_BYTES = 32
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

export function createSessionToken() {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')

  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  }
}

export function hashSessionToken(token) {
  validateSessionToken(token)

  return createHash('sha256').update(token).digest('base64url')
}

function validateSessionToken(token) {
  if (typeof token !== 'string') {
    throw new Error('Session token must be a string.')
  }

  if (!token.trim()) {
    throw new Error('Session token is required.')
  }
}
