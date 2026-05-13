export function getSpeechRecognitionConstructor() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function isSpeechRecognitionSupported() {
  return Boolean(getSpeechRecognitionConstructor())
}

export function createSpeechRecognition({
  lang = 'en-US',
  continuous = true,
  interimResults = true,
} = {}) {
  const SpeechRecognition = getSpeechRecognitionConstructor()

  if (!SpeechRecognition) {
    return null
  }

  const recognition = new SpeechRecognition()
  recognition.lang = lang
  recognition.continuous = continuous
  recognition.interimResults = interimResults

  return recognition
}
