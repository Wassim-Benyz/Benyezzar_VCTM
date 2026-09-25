import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCurrentUser, loginUser, logoutUser, registerUser } from './authApi'

const user = {
  id: 'user-1',
  name: 'Wassim',
  email: 'wassim@example.com',
}

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

describe('auth API client', () => {
  it('registers users with credentials included', async () => {
    mockJsonResponse({ user }, { status: 201 })

    await expect(
      registerUser({
        name: 'Wassim',
        email: 'wassim@example.com',
        password: 'valid-password',
      }),
    ).resolves.toEqual({ user })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/register',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Wassim',
          email: 'wassim@example.com',
          password: 'valid-password',
        }),
      },
    )
  })

  it('logs in users with credentials included', async () => {
    mockJsonResponse({ user })

    await expect(
      loginUser({
        email: 'wassim@example.com',
        password: 'valid-password',
      }),
    ).resolves.toEqual({ user })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/login',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'wassim@example.com',
          password: 'valid-password',
        }),
      },
    )
  })

  it('fetches the current user without JSON headers', async () => {
    mockJsonResponse({ user })

    await expect(fetchCurrentUser()).resolves.toEqual({ user })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/me',
      {
        method: 'GET',
        credentials: 'include',
      },
    )
  })

  it('handles logout 204 responses without parsing JSON', async () => {
    const json = vi.fn()
    fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json,
    })

    await expect(logoutUser()).resolves.toBeNull()

    expect(json).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/logout',
      {
        method: 'POST',
        credentials: 'include',
      },
    )
  })

  it('throws useful errors with status for backend failures', async () => {
    mockJsonResponse(
      { error: true, message: 'Authentication required.' },
      { ok: false, status: 401 },
    )

    await expect(fetchCurrentUser()).rejects.toMatchObject({
      message: 'Authentication required.',
      status: 401,
    })
  })

  it('throws safely for unavailable or invalid JSON responses', async () => {
    fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(fetchCurrentUser()).rejects.toThrow('Failed to fetch')

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    })
    await expect(fetchCurrentUser()).rejects.toThrow(
      'Authentication API returned an invalid JSON response.',
    )

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    })
    await expect(fetchCurrentUser()).rejects.toThrow(
      'Authentication request failed with status 500.',
    )
  })
})

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  fetch.mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  })
}
