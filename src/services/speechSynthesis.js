const PREFERRED_VOICE_NAMES = [
  'google',
  'microsoft',
  'natural',
  'samantha',
  'daniel',
  'alex',
]

let voices = []
let voicesPromise = null
let currentSpeakId = 0
let currentAudio = null
let currentAudioUrl = ''
let currentCartesiaRequest = null

export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text, { onEnd, onError } = {}) {
  if (!text) {
    onEnd?.()
    return
  }

  if (!shouldUseCartesiaTts() && !isSpeechSynthesisSupported()) {
    onError?.()
    onEnd?.()
    return
  }

  stopSpeaking()

  const speakId = currentSpeakId + 1
  currentSpeakId = speakId

  if (shouldUseCartesiaTts()) {
    speakWithCartesia(text, speakId, { onEnd })
      .catch(() => {
        if (speakId !== currentSpeakId) {
          return
        }

        currentCartesiaRequest = null
        stopCurrentAudio()
        speakWithBrowserSynthesis(text, speakId, { onEnd, onError })
      })
    return
  }

  speakWithBrowserSynthesis(text, speakId, { onEnd, onError })
}

function speakWithBrowserSynthesis(text, speakId, { onEnd, onError } = {}) {
  if (!isSpeechSynthesisSupported()) {
    onError?.()
    onEnd?.()
    return
  }

  loadVoices().then(() => {
    if (speakId !== currentSpeakId) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = chooseBestEnglishVoice()
    utterance.rate = 0.9
    utterance.pitch = 1
    utterance.volume = 1
    utterance.onend = onEnd
    utterance.onerror = (event) => {
      onError?.(event)
      onEnd?.()
    }

    window.speechSynthesis.speak(utterance)
  })
}

export function stopSpeaking() {
  currentSpeakId += 1
  currentCartesiaRequest?.abort()
  currentCartesiaRequest = null
  stopCurrentAudio()

  if (!isSpeechSynthesisSupported()) {
    return
  }

  window.speechSynthesis.cancel()
}

async function speakWithCartesia(text, speakId, { onEnd } = {}) {
  const controller = new AbortController()
  currentCartesiaRequest = controller

  const response = await fetch('/api/text-to-speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
    signal: controller.signal,
  })

  if (!response.ok) {
    throw new Error('Cartesia text to speech failed.')
  }

  const audioBlob = await response.blob()

  if (speakId !== currentSpeakId) {
    return
  }

  stopCurrentAudio()

  currentAudioUrl = URL.createObjectURL(audioBlob)
  currentAudio = new Audio(currentAudioUrl)

  await new Promise((resolve, reject) => {
    currentAudio.onended = resolve
    currentAudio.onerror = reject
    currentAudio.play().catch(reject)
  })

  if (speakId !== currentSpeakId) {
    return
  }

  stopCurrentAudio()
  currentCartesiaRequest = null
  onEnd?.()
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio.load()
    currentAudio = null
  }

  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl)
    currentAudioUrl = ''
  }
}

function shouldUseCartesiaTts() {
  return import.meta.env.VITE_USE_CARTESIA_TTS === 'true'
}

function loadVoices() {
  const speechSynthesis = window.speechSynthesis
  const loadedVoices = speechSynthesis.getVoices()

  if (loadedVoices.length > 0) {
    voices = loadedVoices
    return Promise.resolve(voices)
  }

  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      let hasResolved = false

      const resolveVoices = () => {
        if (hasResolved) {
          return
        }

        hasResolved = true
        voices = speechSynthesis.getVoices()
        resolve(voices)
      }

      speechSynthesis.onvoiceschanged = () => {
        resolveVoices()
      }

      window.setTimeout(resolveVoices, 1000)
    })
  }

  return voicesPromise
}

function chooseBestEnglishVoice() {
  const englishVoices = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith('en'),
  )

  if (englishVoices.length === 0) {
    return null
  }

  return englishVoices
    .map((voice) => ({
      voice,
      score: getVoiceScore(voice),
    }))
    .sort((first, second) => second.score - first.score)[0].voice
}

function getVoiceScore(voice) {
  const voiceName = voice.name.toLowerCase()
  const preferredNameIndex = PREFERRED_VOICE_NAMES.findIndex((name) =>
    voiceName.includes(name),
  )

  if (preferredNameIndex === -1) {
    return 0
  }

  return PREFERRED_VOICE_NAMES.length - preferredNameIndex
}
