const VALID_INTENTS = new Set([
  'CREATE_TASK',
  'READ_TASKS',
  'UPDATE_TASK',
  'DELETE_TASK',
  'CREATE_MULTIPLE_TASKS',
  'DELETE_MULTIPLE_TASKS',
  'UNKNOWN',
])

export class GroqRequestError extends Error {
  constructor({
    message = 'Groq request failed',
    status = 500,
    details = 'Unknown Groq error',
  } = {}) {
    super(message)
    this.name = 'GroqRequestError'
    this.status = status
    this.details = details
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json(createErrorResponse({
      message: 'Method not allowed',
      status: 405,
      details: 'Use POST for command parsing.',
    }))
    return
  }

  if (!process.env.GROQ_API_KEY) {
    logGroqConfig(process.env)
    response.status(503).json(createErrorResponse({
      message: 'Groq API key is not configured',
      status: 503,
      details: 'Set GROQ_API_KEY on the server.',
    }))
    return
  }

  try {
    const { transcript, context } = request.body || {}

    if (!transcript) {
      response.status(400).json(createErrorResponse({
        message: 'Missing transcript',
        status: 400,
        details: 'Request body must include transcript.',
      }))
      return
    }

    const command = await parseCommandWithGroq({ transcript, context })
    response.status(200).json(command)
  } catch (error) {
    const safeError = normalizeServerError(error)
    logGroqError(safeError)
    response.status(safeError.status).json(createErrorResponse(safeError))
  }
}

export async function parseCommandWithGroq({
  transcript,
  context,
  env = process.env,
}) {
  const model = env.GROQ_MODEL || 'llama-3.1-8b-instant'
  const apiUrl = createGroqApiUrl(env)
  logGroqConfig(env)

  const groqResponse = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: createSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify({
            transcript,
            context,
          }),
        },
      ],
      temperature: 0,
      response_format: { type: 'json_object' },
    }),
  })

  if (!groqResponse.ok) {
    const details = await readProviderErrorMessage(groqResponse, env)
    console.error('[Groq parser] provider response', {
      status: groqResponse.status,
      details,
    })
    throw new GroqRequestError({
      status: groqResponse.status,
      details,
    })
  }

  const data = await groqResponse.json()
  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new GroqRequestError({
      status: 502,
      details: 'No message content returned from Groq.',
    })
  }

  const command = JSON.parse(content)

  return sanitizeCommand(command)
}

function createGroqApiUrl(env) {
  const baseUrl =
    env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions'

  return baseUrl
}

export function createErrorResponse({ message, status, details }) {
  return {
    error: true,
    message,
    status,
    details,
  }
}

export function normalizeServerError(error) {
  if (error instanceof GroqRequestError) {
    return {
      message: error.message,
      status: error.status,
      details: error.details,
    }
  }

  return {
    message: 'Groq request failed',
    status: 500,
    details: getSafeErrorMessage(error),
  }
}

export function logGroqConfig(env = process.env) {
  console.info('[Groq parser] config', {
    hasGroqApiKey: Boolean(env.GROQ_API_KEY),
    GROQ_API_URL:
      env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions',
    GROQ_MODEL: env.GROQ_MODEL || 'llama-3.1-8b-instant',
  })
}

export function logGroqError(error) {
  console.error('[Groq parser] error', {
    message: error.message,
    status: error.status,
    details: error.details,
  })
}

async function readProviderErrorMessage(response, env) {
  try {
    const body = await response.text()

    if (!body) {
      return response.statusText || 'No response body from Groq provider.'
    }

    return extractProviderErrorMessage(body, env)
  } catch {
    return 'Could not read Groq provider error body.'
  }
}

function extractProviderErrorMessage(body, env) {
  try {
    const parsedBody = JSON.parse(body)
    const message =
      parsedBody.error?.message ||
      parsedBody.message ||
      parsedBody.detail ||
      body

    return getSafeErrorMessage(message, env)
  } catch {
    return getSafeErrorMessage(body, env)
  }
}

function getSafeErrorMessage(error, env = process.env) {
  const message =
    typeof error === 'string'
      ? error
      : error?.message || 'Unknown server error.'
  const apiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY

  if (!apiKey) {
    return message.slice(0, 240)
  }

  return message.replaceAll(apiKey, '[redacted]').slice(0, 240)
}

function createSystemPrompt() {
  return [
    'Convert voice transcripts into task manager commands.',
    'Return JSON only. Do not return markdown or explanations.',
    'Valid intents: CREATE_TASK, READ_TASKS, UPDATE_TASK, DELETE_TASK, CREATE_MULTIPLE_TASKS, DELETE_MULTIPLE_TASKS, UNKNOWN.',
    'CREATE_TASK payload: { "title": string, "date": string, "time": string }.',
    'CREATE_MULTIPLE_TASKS payload: { "tasks": [{ "title": string, "date": string, "time": string }] }.',
    'READ_TASKS payload: { "dateFilter": "today" | "tomorrow" | "", "timeOfDay": "morning" | "afternoon" | "evening" | "" }.',
    'UPDATE_TASK payload: { "searchText": string, "updates": { "title"?: string, "date"?: string, "time"?: string, "status"?: string } }.',
    'DELETE_TASK payload: { "searchText": string }.',
    'DELETE_MULTIPLE_TASKS payload: { "taskNames": string[], "dateFilter": "today" | "tomorrow" | "", "deleteAll": boolean }.',
    'Use DELETE_MULTIPLE_TASKS when the user asks to delete, remove, or clear more than one named task, or all tasks.',
    'For delete all commands like "clear all tasks" or "delete all my tasks tomorrow", use taskNames: [], deleteAll: true, and preserve dateFilter when present.',
    'For multiple named delete commands like "delete gym and LinkedIn post", use taskNames with each requested task name and deleteAll: false.',
    'For context references, use searchText values like "previous", "previous task", "last task", "second one".',
    'Preserve simple date words like today and tomorrow. Preserve spoken times like 7 am or 8 pm.',
    'If the command is unclear, use UNKNOWN with an empty payload.',
  ].join(' ')
}

function sanitizeCommand(command) {
  if (!command || !VALID_INTENTS.has(command.intent)) {
    return { intent: 'UNKNOWN', payload: {} }
  }

  return {
    intent: command.intent,
    payload:
      command.payload && typeof command.payload === 'object'
        ? command.payload
        : {},
  }
}
