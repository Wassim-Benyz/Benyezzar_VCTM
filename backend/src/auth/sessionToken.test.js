import { describe, expect, it } from 'vitest'
import { createSessionToken, hashSessionToken } from './sessionToken.js'

describe('session tokens', () => {
  it('creates a non-empty browser token', () => {
    const sessionToken = createSessionToken()

    expect(sessionToken.token).toEqual(expect.any(String))
    expect(sessionToken.token.length).toBeGreaterThan(0)
    expect(sessionToken.token).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('creates different tokens each time', () => {
    const firstToken = createSessionToken()
    const secondToken = createSessionToken()

    expect(firstToken.token).not.toBe(secondToken.token)
  })

  it('returns a tokenHash matching hashSessionToken', () => {
    const sessionToken = createSessionToken()

    expect(sessionToken.tokenHash).toBe(hashSessionToken(sessionToken.token))
  })

  it('keeps the raw token and stored hash different', () => {
    const sessionToken = createSessionToken()

    expect(sessionToken.tokenHash).not.toBe(sessionToken.token)
  })

  it('returns the same hash for the same token', () => {
    const { token } = createSessionToken()

    expect(hashSessionToken(token)).toBe(hashSessionToken(token))
  })

  it('returns different hashes for different tokens', () => {
    const firstToken = createSessionToken()
    const secondToken = createSessionToken()

    expect(hashSessionToken(firstToken.token)).not.toBe(hashSessionToken(secondToken.token))
  })

  it('sets expiry approximately seven days in the future', () => {
    const before = Date.now()
    const sessionToken = createSessionToken()
    const after = Date.now()
    const sevenDays = 7 * 24 * 60 * 60 * 1000

    expect(sessionToken.expiresAt).toBeInstanceOf(Date)
    expect(sessionToken.expiresAt.getTime()).toBeGreaterThanOrEqual(before + sevenDays)
    expect(sessionToken.expiresAt.getTime()).toBeLessThanOrEqual(after + sevenDays)
  })

  it('rejects empty and non-string tokens', () => {
    expect(() => hashSessionToken('')).toThrow('Session token is required.')
    expect(() => hashSessionToken('   ')).toThrow('Session token is required.')
    expect(() => hashSessionToken(null)).toThrow('Session token must be a string.')
    expect(() => hashSessionToken(123)).toThrow('Session token must be a string.')
  })
})
