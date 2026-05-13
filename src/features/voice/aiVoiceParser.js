import { parseVoiceCommand } from './voiceParser'

export async function parseVoiceCommandWithAI(transcript, context = {}) {
  try {
    console.log('[AI parser] calling /api/parse-command')

    const response = await fetch('/api/parse-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript,
        context,
      }),
    })

    if (!response.ok) {
      return parseVoiceCommand(transcript)
    }

    const command = await response.json()
    return isValidCommand(command) ? command : parseVoiceCommand(transcript)
  } catch {
    return parseVoiceCommand(transcript)
  }
}

function isValidCommand(command) {
  const validIntents = [
    'CREATE_TASK',
    'READ_TASKS',
    'UPDATE_TASK',
    'DELETE_TASK',
    'CREATE_MULTIPLE_TASKS',
    'DELETE_MULTIPLE_TASKS',
    'UNKNOWN',
  ]

  return (
    command &&
    validIntents.includes(command.intent) &&
    command.payload &&
    typeof command.payload === 'object' &&
    !Array.isArray(command.payload)
  )
}
