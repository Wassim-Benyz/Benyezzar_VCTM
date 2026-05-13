export class CartesiaRequestError extends Error {
  constructor({
    message = 'Cartesia request failed',
    status = 500,
    details = 'Unknown Cartesia error',
  } = {}) {
    super(message)
    this.name = 'CartesiaRequestError'
    this.status = status
    this.details = details
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json(createTextToSpeechErrorResponse({
      message: 'Method not allowed',
      status: 405,
      details: 'Use POST for text to speech.',
    }))
    return
  }

  if (!process.env.CARTESIA_API_KEY || !process.env.CARTESIA_VOICE_ID) {
    response.status(503).json(createTextToSpeechErrorResponse({
      message: 'Cartesia is not configured',
      status: 503,
      details: 'Set CARTESIA_API_KEY and CARTESIA_VOICE_ID on the server.',
    }))
    return
  }

  try {
    const { text } = request.body || {}

    const audio = await createSpeechWithCartesia({
      text,
      env: process.env,
    })

    response.setHeader('Content-Type', audio.contentType)
    response.status(200).send(Buffer.from(audio.audioBuffer))
  } catch (error) {
    const safeError = normalizeTextToSpeechError(error)
    response
      .status(safeError.status)
      .json(createTextToSpeechErrorResponse(safeError))
  }
}

export async function createSpeechWithCartesia({
  text,
  env = process.env,
}) {
  const normalizedText = String(text || '').trim()

  if (!normalizedText) {
    throw new CartesiaRequestError({
      message: 'Missing text',
      status: 400,
      details: 'Request body must include text.',
    })
  }

  if (!env.CARTESIA_API_KEY || !env.CARTESIA_VOICE_ID) {
    throw new CartesiaRequestError({
      message: 'Cartesia is not configured',
      status: 503,
      details: 'Set CARTESIA_API_KEY and CARTESIA_VOICE_ID on the server.',
    })
  }

  const cartesiaResponse = await fetch(createCartesiaApiUrl(env), {
    method: 'POST',
    headers: {
      'Cartesia-Version': '2026-03-01',
      'X-API-Key': env.CARTESIA_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: 'sonic-turbo',
      transcript: normalizedText,
      voice: {
        mode: 'id',
        id: env.CARTESIA_VOICE_ID,
      },
      output_format: {
        container: 'wav',
        encoding: 'pcm_s16le',
        sample_rate: 44100,
      },
      language: 'en',
      speed: 'normal',
    }),
  })

  if (!cartesiaResponse.ok) {
    const details = await readProviderErrorMessage(cartesiaResponse, env)
    throw new CartesiaRequestError({
      status: cartesiaResponse.status,
      details,
    })
  }

  return {
    audioBuffer: await cartesiaResponse.arrayBuffer(),
    contentType:
      cartesiaResponse.headers.get('content-type') || 'audio/wav',
  }
}

function createCartesiaApiUrl(env) {
  return env.CARTESIA_API_URL || 'https://api.cartesia.ai/tts/bytes'
}

export function createTextToSpeechErrorResponse({ message, status, details }) {
  return {
    error: true,
    message,
    status,
    details,
  }
}

export function normalizeTextToSpeechError(error) {
  if (error instanceof CartesiaRequestError) {
    return {
      message: error.message,
      status: error.status,
      details: error.details,
    }
  }

  return {
    message: 'Cartesia request failed',
    status: 500,
    details: getSafeErrorMessage(error),
  }
}

async function readProviderErrorMessage(response, env) {
  try {
    const body = await response.text()

    if (!body) {
      return response.statusText || 'No response body from Cartesia provider.'
    }

    return extractProviderErrorMessage(body, env)
  } catch {
    return 'Could not read Cartesia provider error body.'
  }
}

function extractProviderErrorMessage(body, env) {
  try {
    const parsedBody = JSON.parse(body)
    const message =
      parsedBody.detail?.message ||
      parsedBody.detail ||
      parsedBody.error?.message ||
      parsedBody.message ||
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
  const apiKey = env.CARTESIA_API_KEY || process.env.CARTESIA_API_KEY

  if (!apiKey) {
    return message.slice(0, 240)
  }

  return message.replaceAll(apiKey, '[redacted]').slice(0, 240)
}
