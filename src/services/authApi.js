const DEFAULT_API_URL = 'http://localhost:3001/api'

const API_BASE_URL = normalizeBaseUrl(
  import.meta.env?.VITE_API_URL || DEFAULT_API_URL,
)

export function registerUser({ name, email, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: { name, email, password },
  })
}

export function loginUser({ email, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export function fetchCurrentUser() {
  return request('/auth/me')
}

export function logoutUser() {
  return request('/auth/logout', {
    method: 'POST',
  })
}

async function request(path, { method = 'GET', body } = {}) {
  const options = {
    method,
    credentials: 'include',
  }

  if (body !== undefined) {
    options.headers = {
      'Content-Type': 'application/json',
    }
    options.body = JSON.stringify(body)
  }

  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, options)
  } catch (error) {
    throw createRequestError(error.message || 'Authentication request failed.', {
      cause: error,
    })
  }

  if (!response.ok) {
    throw createRequestError(await getErrorMessage(response), {
      status: response.status,
    })
  }

  if (response.status === 204) {
    return null
  }

  return parseJson(response, 'Authentication API returned an invalid JSON response.')
}

async function getErrorMessage(response) {
  const fallback = `Authentication request failed with status ${response.status}.`
  const errorBody = await parseJson(response, fallback)

  if (!errorBody || typeof errorBody !== 'object') {
    return fallback
  }

  return errorBody.details || errorBody.message || fallback
}

async function parseJson(response, fallbackMessage) {
  try {
    return await response.json()
  } catch {
    throw createRequestError(fallbackMessage, {
      status: response.status,
    })
  }
}

function createRequestError(message, { status, cause } = {}) {
  const error = new Error(message, cause ? { cause } : undefined)

  if (status) {
    error.status = status
  }

  return error
}

function normalizeBaseUrl(url) {
  return String(url || DEFAULT_API_URL).replace(/\/+$/, '')
}
