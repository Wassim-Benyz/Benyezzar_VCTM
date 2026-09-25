import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './password.js'

const VALID_PASSWORD = 'correct horse battery'

describe('password hashing', () => {
  it('hashes and verifies a valid password', async () => {
    const storedHash = await hashPassword(VALID_PASSWORD)

    expect(storedHash).toMatch(/^scrypt\$1\$16384\$8\$1\$[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]+=*$/)
    await expect(verifyPassword(VALID_PASSWORD, storedHash)).resolves.toBe(true)
  })

  it('returns false for an incorrect password', async () => {
    const storedHash = await hashPassword(VALID_PASSWORD)

    await expect(verifyPassword('different password', storedHash)).resolves.toBe(false)
  })

  it('uses a different salt for the same password', async () => {
    const firstHash = await hashPassword(VALID_PASSWORD)
    const secondHash = await hashPassword(VALID_PASSWORD)

    expect(firstHash).not.toBe(secondHash)
    await expect(verifyPassword(VALID_PASSWORD, firstHash)).resolves.toBe(true)
    await expect(verifyPassword(VALID_PASSWORD, secondHash)).resolves.toBe(true)
  })

  it('rejects too-short passwords', async () => {
    await expect(hashPassword('short')).rejects.toThrow(
      'Password must be at least 8 characters.',
    )
  })

  it('rejects too-long passwords', async () => {
    await expect(hashPassword('a'.repeat(129))).rejects.toThrow(
      'Password must be at most 128 characters.',
    )
  })

  it('rejects non-string passwords', async () => {
    await expect(hashPassword(null)).rejects.toThrow('Password must be a string.')
    await expect(verifyPassword(null, 'bad-hash')).rejects.toThrow(
      'Password must be a string.',
    )
  })

  it('returns false for malformed stored hashes', async () => {
    await expect(verifyPassword(VALID_PASSWORD, '')).resolves.toBe(false)
    await expect(verifyPassword(VALID_PASSWORD, 'scrypt$1$bad')).resolves.toBe(false)
    await expect(
      verifyPassword(VALID_PASSWORD, 'scrypt$1$16384$8$1$not-base64$also-bad'),
    ).resolves.toBe(false)
    await expect(verifyPassword(VALID_PASSWORD, null)).resolves.toBe(false)
  })

  it('returns false for modified hashes', async () => {
    const storedHash = await hashPassword(VALID_PASSWORD)
    const parts = storedHash.split('$')
    const hash = parts.at(-1)
    const replacement = hash.at(-1) === 'A' ? 'B' : 'A'
    parts[parts.length - 1] = `${hash.slice(0, -1)}${replacement}`

    await expect(verifyPassword(VALID_PASSWORD, parts.join('$'))).resolves.toBe(false)
  })
})
