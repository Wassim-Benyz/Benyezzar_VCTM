const DEFAULT_API_URL = 'http://localhost:3001/api'

const API_BASE_URL = normalizeBaseUrl(
  import.meta.env?.VITE_API_URL || DEFAULT_API_URL,
)

export function fetchTasks() {
  return request('/tasks')
}

export function createApiTask(details) {
  return request('/tasks', {
    method: 'POST',
    body: details,
  })
}

export function updateApiTask(id, changes, source) {
  return request(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: withOptionalSource(changes, source),
  })
}

export function completeApiTask(id, source) {
  return request(`/tasks/${encodeURIComponent(id)}/complete`, {
    method: 'POST',
    body: createSourceBody(source),
  })
}

export function reopenApiTask(id, source) {
  return request(`/tasks/${encodeURIComponent(id)}/reopen`, {
    method: 'POST',
    body: createSourceBody(source),
  })
}

export function rescheduleApiTask(id, scheduledAt, source) {
  return request(`/tasks/${encodeURIComponent(id)}/reschedule`, {
    method: 'POST',
    body: withOptionalSource({ scheduledAt }, source),
  })
}

export function cancelApiTask(id, source) {
  return request(`/tasks/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: createSourceBody(source),
  })
}

export function deleteApiTask(id, source) {
  return request(`/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: createSourceBody(source),
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
    throw createRequestError(error.message || 'Task API request failed.', {
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

  return parseJson(response, 'Task API returned an invalid JSON response.')
}

async function getErrorMessage(response) {
  const fallback = `Task API request failed with status ${response.status}.`
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

function withOptionalSource(values = {}, source) {
  return source === undefined ? values : { ...values, source }
}

function createSourceBody(source) {
  return source === undefined ? undefined : { source }
}

function normalizeBaseUrl(url) {
  return String(url || DEFAULT_API_URL).replace(/\/+$/, '')
}
