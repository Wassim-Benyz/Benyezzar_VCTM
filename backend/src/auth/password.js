import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scrypt = promisify(scryptCallback)

const ALGORITHM = 'scrypt'
const VERSION = '1'
const COST = 16384
const BLOCK_SIZE = 8
const PARALLELIZATION = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const MAX_PASSWORD_LENGTH = 128
const MIN_PASSWORD_LENGTH = 8
const SCRYPT_OPTIONS = {
  N: COST,
  r: BLOCK_SIZE,
  p: PARALLELIZATION,
  maxmem: 64 * 1024 * 1024,
}

export async function hashPassword(password) {
  validatePassword(password)

  const salt = randomBytes(SALT_LENGTH)
  const hash = await deriveKey(password, salt, SCRYPT_OPTIONS)

  return [
    ALGORITHM,
    VERSION,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

export async function verifyPassword(password, storedHash) {
  validatePassword(password)

  const parsedHash = parseStoredHash(storedHash)

  if (!parsedHash) {
    return false
  }

  const derivedHash = await deriveKey(password, parsedHash.salt, parsedHash.options)

  if (derivedHash.length !== parsedHash.hash.length) {
    return false
  }

  return timingSafeEqual(derivedHash, parsedHash.hash)
}

function validatePassword(password) {
  if (typeof password !== 'string') {
    throw new Error('Password must be a string.')
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error('Password must be at least 8 characters.')
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error('Password must be at most 128 characters.')
  }
}

function parseStoredHash(storedHash) {
  if (typeof storedHash !== 'string') {
    return null
  }

  const parts = storedHash.split('$')

  if (parts.length !== 7) {
    return null
  }

  const [
    algorithm,
    version,
    costText,
    blockSizeText,
    parallelizationText,
    saltText,
    hashText,
  ] = parts

  if (algorithm !== ALGORITHM || version !== VERSION) {
    return null
  }

  const cost = Number(costText)
  const blockSize = Number(blockSizeText)
  const parallelization = Number(parallelizationText)

  if (
    !Number.isInteger(cost) ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization) ||
    cost <= 0 ||
    blockSize <= 0 ||
    parallelization <= 0
  ) {
    return null
  }

  const salt = decodeBase64(saltText)
  const hash = decodeBase64(hashText)

  if (!salt || !hash || hash.length !== KEY_LENGTH) {
    return null
  }

  return {
    salt,
    hash,
    options: {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: SCRYPT_OPTIONS.maxmem,
    },
  }
}

function decodeBase64(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    return null
  }

  const buffer = Buffer.from(value, 'base64')

  if (buffer.length === 0 || buffer.toString('base64') !== value) {
    return null
  }

  return buffer
}

function deriveKey(password, salt, options) {
  return scrypt(password, salt, KEY_LENGTH, options)
}
