import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
} from '../services/speechRecognition'
import { speak, stopSpeaking } from '../services/speechSynthesis'

export function useVoiceRecognition({
  lang = 'en-US',
  onFinalTranscript,
  onRecognitionError,
} = {}) {
  const recognitionRef = useRef(null)
  const isRecognitionActiveRef = useRef(false)
  const finalTranscriptRef = useRef('')
  const onFinalTranscriptRef = useRef(onFinalTranscript)
  const onRecognitionErrorRef = useRef(onRecognitionError)
  const pendingResponseRef = useRef(null)
  const responseTokenRef = useRef(0)
  const shouldKeepListeningRef = useRef(false)
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const isSupported = isSpeechRecognitionSupported()
  const [error, setError] = useState(() =>
    isSpeechRecognitionSupported()
      ? ''
      : 'Speech Recognition is not supported in this browser.',
  )

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript
  }, [onFinalTranscript])

  useEffect(() => {
    onRecognitionErrorRef.current = onRecognitionError
  }, [onRecognitionError])

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current || isRecognitionActiveRef.current) {
      return
    }

    try {
      recognitionRef.current.start()
    } catch (startError) {
      setError(startError.message || 'Could not start speech recognition.')
    }
  }, [])

  const stopAssistantSpeech = useCallback(() => {
    stopSpeaking()
    setIsSpeaking(false)
  }, [])

  useEffect(() => {
    if (!isSupported) {
      return undefined
    }

    const recognition = createSpeechRecognition({ lang })
    recognitionRef.current = recognition

    recognition.onstart = () => {
      isRecognitionActiveRef.current = true
      setIsListening(true)
      setIsThinking(false)
      setIsSpeaking(false)
      setError('')
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0].transcript

        if (result.isFinal) {
          finalText += text
        } else {
          interimText += text
        }
      }

      if (finalText) {
        const spokenText = finalText.trim()
        finalTranscriptRef.current = `${finalTranscriptRef.current} ${spokenText}`.trim()
        const responseToken = responseTokenRef.current + 1
        responseTokenRef.current = responseToken
        pendingResponseRef.current = {
          response:
            onFinalTranscriptRef.current?.(spokenText) || `I heard: ${spokenText}`,
          token: responseToken,
        }
        setIsThinking(true)
        setIsSpeaking(false)
        recognition.stop()
      }

      setTranscript(`${finalTranscriptRef.current} ${interimText}`.trim())
    }

    recognition.onerror = (event) => {
      const errorMessage = event.error || 'speech recognition failed'
      const assistantResponse =
        onRecognitionErrorRef.current?.(errorMessage) ||
        'I had trouble hearing you. Please try again.'
      const responseToken = responseTokenRef.current + 1
      responseTokenRef.current = responseToken

      setError(errorMessage)
      setIsThinking(false)
      setIsSpeaking(false)
      pendingResponseRef.current = {
        response: assistantResponse,
        token: responseToken,
      }
      isRecognitionActiveRef.current = false
      shouldKeepListeningRef.current = false
      setIsListening(false)
    }

    recognition.onend = () => {
      isRecognitionActiveRef.current = false
      setIsListening(false)

      if (pendingResponseRef.current) {
        const pendingResponse = pendingResponseRef.current
        pendingResponseRef.current = ''
        Promise.resolve(pendingResponse.response)
          .then((responseText) => {
            if (pendingResponse.token !== responseTokenRef.current) {
              return
            }

            setIsThinking(false)
            setIsSpeaking(Boolean(responseText))
            speak(responseText, {
              onEnd: () => {
                setIsSpeaking(false)
                if (shouldKeepListeningRef.current) {
                  startRecognition()
                }
              },
              onError: () => {
                setIsSpeaking(false)
                setError('Speech synthesis failed.')
              },
            })
          })
          .catch(() => {
            setIsThinking(false)
            setIsSpeaking(false)
            setError('Could not process voice command.')

            if (shouldKeepListeningRef.current) {
              startRecognition()
            }
          })
        return
      }

      if (shouldKeepListeningRef.current) {
        startRecognition()
      }
    }

    return () => {
      shouldKeepListeningRef.current = false
      setIsThinking(false)
      setIsSpeaking(false)
      stopSpeaking()
      recognition.stop()
      recognitionRef.current = null
    }
  }, [isSupported, lang, startRecognition])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      return
    }

    shouldKeepListeningRef.current = true
    pendingResponseRef.current = ''
    responseTokenRef.current += 1
    setIsThinking(false)
    setIsSpeaking(false)
    setError('')
    stopAssistantSpeech()
    startRecognition()
  }, [startRecognition, stopAssistantSpeech])

  const stopListening = useCallback(() => {
    shouldKeepListeningRef.current = false
    pendingResponseRef.current = ''
    responseTokenRef.current += 1
    setIsThinking(false)
    recognitionRef.current?.stop()
  }, [])

  const resetTranscript = useCallback(() => {
    finalTranscriptRef.current = ''
    pendingResponseRef.current = ''
    responseTokenRef.current += 1
    setTranscript('')
    setIsThinking(false)
    stopAssistantSpeech()
  }, [stopAssistantSpeech])

  const stopCurrentSpeaking = useCallback(() => {
    stopAssistantSpeech()
  }, [stopAssistantSpeech])

  return {
    transcript,
    isListening,
    isThinking,
    isSpeaking,
    isSupported,
    error,
    startListening,
    stopListening,
    stopSpeaking: stopCurrentSpeaking,
    resetTranscript,
  }
}
