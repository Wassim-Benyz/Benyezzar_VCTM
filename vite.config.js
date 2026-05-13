import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import {
  createErrorResponse,
  logGroqConfig,
  logGroqError,
  normalizeServerError,
  parseCommandWithGroq,
} from './api/parse-command.js'
import {
  createSpeechWithCartesia,
  createTextToSpeechErrorResponse,
  normalizeTextToSpeechError,
} from './api/text-to-speech.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), localApiPlugin(env)],
  }
})

function localApiPlugin(env) {
  return {
    name: 'local-ai-parser-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]

        if (path === '/api/text-to-speech') {
          await handleLocalTextToSpeechRequest(request, response, env)
          return
        }

        if (path !== '/api/parse-command') {
          next()
          return
        }

        if (request.method !== 'POST') {
          sendJson(response, 405, createErrorResponse({
            message: 'Method not allowed',
            status: 405,
            details: 'Use POST for command parsing.',
          }))
          return
        }

        if (!env.GROQ_API_KEY) {
          logGroqConfig(env)
          sendJson(response, 503, createErrorResponse({
            message: 'Groq API key is not configured',
            status: 503,
            details: 'Set GROQ_API_KEY in your local .env file.',
          }))
          return
        }

        try {
          const { transcript, context } = await readJsonBody(request)

          if (!transcript) {
            sendJson(response, 400, createErrorResponse({
              message: 'Missing transcript',
              status: 400,
              details: 'Request body must include transcript.',
            }))
            return
          }

          const command = await parseCommandWithGroq({
            transcript,
            context,
            env,
          })

          sendJson(response, 200, command)
        } catch (error) {
          const safeError = normalizeServerError(error)
          logGroqError(safeError)
          sendJson(response, safeError.status, createErrorResponse(safeError))
        }
      })
    },
  }
}

async function handleLocalTextToSpeechRequest(request, response, env) {
  if (request.method !== 'POST') {
    sendJson(response, 405, createTextToSpeechErrorResponse({
      message: 'Method not allowed',
      status: 405,
      details: 'Use POST for text to speech.',
    }))
    return
  }

  if (!env.CARTESIA_API_KEY || !env.CARTESIA_VOICE_ID) {
    sendJson(response, 503, createTextToSpeechErrorResponse({
      message: 'Cartesia is not configured',
      status: 503,
      details: 'Set CARTESIA_API_KEY and CARTESIA_VOICE_ID in your local .env file.',
    }))
    return
  }

  try {
    const { text } = await readJsonBody(request)
    const audio = await createSpeechWithCartesia({ text, env })

    response.statusCode = 200
    response.setHeader('Content-Type', audio.contentType)
    response.end(Buffer.from(audio.audioBuffer))
  } catch (error) {
    const safeError = normalizeTextToSpeechError(error)
    sendJson(response, safeError.status, createTextToSpeechErrorResponse(safeError))
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''

    request.on('data', (chunk) => {
      body += chunk
    })

    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })

    request.on('error', reject)
  })
}

function sendJson(response, statusCode, data) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(data))
}
