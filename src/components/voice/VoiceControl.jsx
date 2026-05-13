import { useCallback, useState } from 'react'
import { TaskList } from '../tasks/TaskList'
import { parseVoiceCommandWithAI } from '../../features/voice/aiVoiceParser'
import { useTasks } from '../../hooks/useTasks'
import { useVoiceRecognition } from '../../hooks/useVoiceRecognition'
import {
  clearPendingDeleteRequest,
  clearPendingDeleteTask,
  getConversationContext,
  setPendingDeleteRequest,
  setPendingDeleteTask,
  updateConversationContext,
} from '../../store/conversationContext'
import { TranscriptPanel } from './TranscriptPanel'

export function VoiceControl() {
  const { tasks, refreshTasks, addTask, editTask, removeTask } = useTasks()
  const [assistantMessage, setAssistantMessage] = useState(
    'Ready for a voice command.',
  )

  const handleFinalTranscript = useCallback(
    async (spokenText) => {
      let response
      const context = getConversationContext()
      const pendingDeleteRequest = context.pendingDeleteRequest
      const pendingDeleteTask = context.pendingDeleteTask

      if (pendingDeleteRequest) {
        response = handleDeleteRequestConfirmation({
          spokenText,
          deleteRequest: pendingDeleteRequest,
          removeTask,
        })
        setAssistantMessage(response)
        return response
      }

      if (pendingDeleteTask) {
        response = handleDeleteConfirmation({
          spokenText,
          task: pendingDeleteTask,
          removeTask,
        })
        setAssistantMessage(response)
        return response
      }

      if (isConfirmationAnswer(spokenText)) {
        response = 'There is nothing to confirm right now.'
        setAssistantMessage(response)
        return response
      }

      const command = await parseVoiceCommandWithAI(
        spokenText,
        getConversationContext(),
      )
      if (import.meta.env.DEV) {
        console.log('[voice command]', {
          intent: command.intent,
          payload: command.payload,
        })
      }

      refreshTasks()

      if (command.intent === 'CREATE_TASK') {
        const task = addTask(command.payload)
        updateConversationContext({ lastCreatedTask: task })
        response = `Created task: ${task.title}.`
        setAssistantMessage(response)
        return response
      }

      if (command.intent === 'CREATE_MULTIPLE_TASKS') {
        const createdTasks = command.payload.tasks.map((taskDetails) =>
          addTask(taskDetails),
        )

        updateConversationContext({
          lastCreatedTask: createdTasks.at(-1),
          lastReadResults: createdTasks,
        })

        response = `I created ${createdTasks.length} tasks for you.`
        setAssistantMessage(response)
        return response
      }

      if (command.intent === 'READ_TASKS') {
        const storedTasks = refreshTasks()
        const filteredTasks = filterTasks(storedTasks, command.payload)
        updateConversationContext({ lastReadResults: filteredTasks })
        response = createTasksSummary(filteredTasks, command.payload)
        setAssistantMessage(response)
        return response
      }

      if (command.intent === 'UPDATE_TASK') {
        const storedTasks = refreshTasks()
        const taskResult = resolveTaskReference(
          command.payload.searchText,
          storedTasks,
          getConversationContext(),
        )

        const failureResponse = createTaskMatchFailureResponse(
          taskResult,
          command.payload.searchText,
          storedTasks,
        )

        if (failureResponse) {
          setAssistantMessage(failureResponse)
          return failureResponse
        }

        const task = taskResult.task
        const updatedTask = editTask(task.id, command.payload.updates)
        if (!updatedTask) {
          response = `I could not update ${task.title}.`
          setAssistantMessage(response)
          return response
        }

        updateConversationContext({ lastUpdatedTask: updatedTask })
        response = `Updated task: ${updatedTask.title}.`
        setAssistantMessage(response)
        return response
      }

      if (command.intent === 'DELETE_MULTIPLE_TASKS') {
        const storedTasks = refreshTasks()
        const deleteRequestResult = createDeleteMultipleRequest(
          command.payload,
          storedTasks,
        )

        if (deleteRequestResult.message) {
          response = deleteRequestResult.message
          setAssistantMessage(response)
          return response
        }

        setPendingDeleteRequest(deleteRequestResult.deleteRequest)
        response = createDeleteMultipleConfirmation(deleteRequestResult.deleteRequest)
        setAssistantMessage(response)
        return response
      }

      if (command.intent === 'DELETE_TASK') {
        const storedTasks = refreshTasks()
        const taskResult = resolveTaskReference(
          command.payload.searchText,
          storedTasks,
          getConversationContext(),
        )

        const failureResponse = createTaskMatchFailureResponse(
          taskResult,
          command.payload.searchText,
          storedTasks,
        )

        if (failureResponse) {
          setAssistantMessage(failureResponse)
          return failureResponse
        }

        const task = taskResult.task
        setPendingDeleteTask(task)
        response = `Do you want me to delete ${task.title}? Say yes to confirm or no to cancel.`
        setAssistantMessage(response)
        return response
      }

      response = command.message || 'Please rephrase that command.'
      setAssistantMessage(response)
      return response
    },
    [addTask, editTask, refreshTasks, removeTask],
  )

  const handleRecognitionError = useCallback((recognitionError) => {
    const response = createRecognitionErrorResponse(recognitionError)
    setAssistantMessage(response)
    return response
  }, [])

  const {
    transcript,
    isListening,
    isSupported,
    error,
    startListening,
    stopListening,
    stopSpeaking,
    resetTranscript,
  } = useVoiceRecognition({
    onFinalTranscript: handleFinalTranscript,
    onRecognitionError: handleRecognitionError,
  })

  return (
    <main className="voice-dashboard">
      <section className="dashboard-hero" aria-label="Voice assistant controls">
        <div className="hero-copy">
          <div className="eyebrow">Benyezzar VC</div>
          <h1>Benyezzar VC Task Manager</h1>
          <p>
            Speak naturally to create, update, delete, and review your local
            task agenda.
          </p>
        </div>

        <div className="orb-stage">
          <div className={`voice-orb ${isListening ? 'is-listening' : ''}`}>
            <div className="sonic-ring ring-one"></div>
            <div className="sonic-ring ring-two"></div>
            <div className="waveform" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <button
              type="button"
              className="mic-button"
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported}
              aria-label={isListening ? 'Stop listening' : 'Start listening'}
              aria-pressed={isListening}
            >
              <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                <path d="M12 14c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v5c0 1.66 1.34 3 3 3Z" />
                <path d="M17.3 11a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-1.7Z" />
              </svg>
            </button>
          </div>

          <div className="orb-status">
            <span className={isListening ? 'status-dot active' : 'status-dot'}></span>
            {isListening ? 'Listening' : 'Standby'}
          </div>
        </div>

        <div className="control-strip" aria-label="Voice controls">
          <button type="button" onClick={resetTranscript} disabled={!transcript}>
            Clear transcript
          </button>
          <button type="button" onClick={stopSpeaking}>
            Stop speaking
          </button>
        </div>

        {error ? <p className="system-alert" role="alert">{error}</p> : null}
      </section>

      <section className="dashboard-grid">
        <div className="left-stack">
          <TranscriptPanel transcript={transcript} />
          <section className="glass-card assistant-card" aria-label="Assistant response">
            <div className="card-kicker">Assistant Response</div>
            <h2>Response</h2>
            <p>{assistantMessage}</p>
          </section>
        </div>

        <TaskList tasks={tasks} />
      </section>

      <section className="glass-card command-card" aria-label="Command examples">
        <div>
          <div className="card-kicker">Try Saying</div>
          <h2>Command Examples</h2>
        </div>
        <div className="command-grid">
          <span>Create task gym tomorrow at 7 AM</span>
          <span>Add tasks gym at 7, study at 9, call mom at 5</span>
          <span>What do I have tomorrow morning?</span>
          <span>Change the previous one to 7 PM</span>
          <span>Delete the last task</span>
        </div>
      </section>
    </main>
  )
}

function handleDeleteConfirmation({
  spokenText,
  task,
  removeTask,
}) {
  const answer = normalizeConfirmationText(spokenText)

  if (['yes', 'yeah', 'confirm', 'delete it', 'delete'].includes(answer)) {
    const wasDeleted = removeTask(task.id)

    if (!wasDeleted) {
      clearPendingDeleteTask()
      return `I could not delete ${task.title}.`
    }

    updateConversationContext({ lastDeletedCandidate: task })
    clearPendingDeleteTask()
    return `Deleted task: ${task.title}.`
  }

  if (['no', 'cancel', 'stop', 'never mind'].includes(answer)) {
    clearPendingDeleteTask()
    return `Okay, I will not delete ${task.title}.`
  }

  return `Please say yes to delete ${task.title}, or no to cancel.`
}

function handleDeleteRequestConfirmation({
  spokenText,
  deleteRequest,
  removeTask,
}) {
  const answer = normalizeConfirmationText(spokenText)

  if (isCancelAnswer(answer)) {
    clearPendingDeleteRequest()
    return `Okay, I will not delete ${createDeleteRequestLabel(deleteRequest)}.`
  }

  if (deleteRequest.deleteAll && !isStrongDeleteAllConfirmation(answer)) {
    return `To confirm deleting ${createDeleteRequestLabel(
      deleteRequest,
    )}, say yes, delete all. Or say no to cancel.`
  }

  if (!deleteRequest.deleteAll && !isDeleteConfirmationAnswer(answer)) {
    return `Please say yes to delete ${createDeleteRequestLabel(
      deleteRequest,
    )}, or no to cancel.`
  }

  const deletedTasks = deleteRequest.tasks.filter((task) => removeTask(task.id))

  clearPendingDeleteRequest()

  if (deletedTasks.length === 0) {
    return `I could not delete ${createDeleteRequestLabel(deleteRequest)}.`
  }

  updateConversationContext({
    lastDeletedCandidate: deletedTasks.at(-1),
    lastReadResults: deletedTasks,
  })

  return `I deleted ${deletedTasks.length} ${pluralizeTask(
    deletedTasks.length,
  )} for you.`
}

function createDeleteMultipleRequest(payload, tasks) {
  const normalizedPayload = normalizeDeleteMultiplePayload(payload)
  const scopedTasks = filterTasks(tasks, {
    dateFilter: normalizedPayload.dateFilter,
  })

  if (tasks.length === 0) {
    return { message: 'You do not have any tasks yet.' }
  }

  if (normalizedPayload.deleteAll) {
    if (scopedTasks.length === 0) {
      return {
        message: `You do not have any tasks${createFilterPhrase({
          dateFilter: normalizedPayload.dateFilter,
        })}.`,
      }
    }

    return {
      deleteRequest: {
        tasks: scopedTasks,
        deleteAll: true,
        dateFilter: normalizedPayload.dateFilter,
      },
    }
  }

  if (normalizedPayload.taskNames.length < 2) {
    return { message: 'Please say which tasks you want to delete.' }
  }

  const taskResult = resolveMultipleTaskNames(
    normalizedPayload.taskNames,
    scopedTasks,
  )

  if (taskResult.missingNames.length > 0) {
    return {
      message: `I could not find tasks matching ${joinWithAnd(
        taskResult.missingNames,
      )}.`,
    }
  }

  if (taskResult.ambiguousNames.length > 0) {
    return {
      message: `I found multiple matching tasks for ${joinWithAnd(
        taskResult.ambiguousNames,
      )}. Please be more specific.`,
    }
  }

  if (taskResult.tasks.length === 0) {
    return { message: 'I could not find those tasks.' }
  }

  return {
    deleteRequest: {
      tasks: taskResult.tasks,
      deleteAll: false,
      dateFilter: normalizedPayload.dateFilter,
    },
  }
}

function normalizeDeleteMultiplePayload(payload = {}) {
  const taskNames = Array.isArray(payload.taskNames)
    ? payload.taskNames
      .map((taskName) => String(taskName || '').trim())
      .filter(Boolean)
    : []

  return {
    taskNames,
    dateFilter: normalizeText(payload.dateFilter),
    deleteAll: Boolean(payload.deleteAll),
  }
}

function resolveMultipleTaskNames(taskNames, tasks) {
  return taskNames.reduce(
    (result, taskName) => {
      const matches = findMatchingTasks(tasks, taskName)

      if (matches.length === 0) {
        result.missingNames.push(taskName)
        return result
      }

      if (matches.length > 1) {
        result.ambiguousNames.push(taskName)
        return result
      }

      if (!result.tasks.some((task) => task.id === matches[0].id)) {
        result.tasks.push(matches[0])
      }

      return result
    },
    {
      tasks: [],
      missingNames: [],
      ambiguousNames: [],
    },
  )
}

function createDeleteMultipleConfirmation(deleteRequest) {
  const label = createDeleteRequestLabel(deleteRequest)

  if (deleteRequest.deleteAll) {
    return `This will delete ${label}. Say yes, delete all to confirm, or no to cancel.`
  }

  return `Do you want me to delete ${label}? Say yes to confirm or no to cancel.`
}

function createDeleteRequestLabel(deleteRequest) {
  if (deleteRequest.deleteAll) {
    return `all ${deleteRequest.tasks.length} ${pluralizeTask(
      deleteRequest.tasks.length,
    )}${createFilterPhrase({ dateFilter: deleteRequest.dateFilter })}`
  }

  return joinWithAnd(deleteRequest.tasks.map((task) => task.title))
}

function isDeleteConfirmationAnswer(answer) {
  return ['yes', 'yeah', 'confirm', 'delete it', 'delete'].includes(answer)
}

function isStrongDeleteAllConfirmation(answer) {
  return [
    'yes delete all',
    'yes delete all tasks',
    'confirm delete all',
    'confirm delete all tasks',
    'delete all',
    'delete all tasks',
    'clear all',
    'clear all tasks',
  ].includes(answer)
}

function isCancelAnswer(answer) {
  return ['no', 'cancel', 'stop', 'never mind'].includes(answer)
}

function normalizeConfirmationText(text) {
  return normalizeText(text).replace(/[^\w\s]/g, '').replace(/\s+/g, ' ')
}

function pluralizeTask(count) {
  return count === 1 ? 'task' : 'tasks'
}

function createRecognitionErrorResponse(error) {
  if (error === 'no-speech') {
    return 'I did not catch that. Please try again.'
  }

  if (error === 'not-allowed' || error === 'service-not-allowed') {
    return 'I cannot access the microphone. Please check your browser permission.'
  }

  return 'I had trouble with speech recognition. Please try again.'
}

function createTaskMatchFailureResponse(taskResult, searchText, tasks) {
  if (tasks.length === 0) {
    return 'You do not have any tasks yet.'
  }

  if (taskResult.matches.length > 1) {
    updateConversationContext({ lastReadResults: taskResult.matches })
    return `I found multiple matching tasks: ${joinWithAnd(
      taskResult.matches.map((task) => task.title),
    )}. Which one did you mean?`
  }

  if (!taskResult.task) {
    return `I could not find a task matching ${searchText}.`
  }

  return ''
}

function createTasksSummary(tasks, filters = {}) {
  if (tasks.length === 0) {
    return `You do not have any tasks${createFilterPhrase(filters)}.`
  }

  const taskSummaries = tasks.map(formatTaskForSpeech)
  return `You have ${joinWithAnd(taskSummaries)}${createFilterPhrase(filters)}.`
}

function filterTasks(tasks, filters = {}) {
  return tasks.filter((task) => {
    if (filters.dateFilter && normalizeText(task.date) !== filters.dateFilter) {
      return false
    }

    if (filters.timeOfDay && getTimeOfDay(task.time) !== filters.timeOfDay) {
      return false
    }

    return true
  })
}

function formatTaskForSpeech(task) {
  if (!task.time) {
    return task.title
  }

  return `${task.title} at ${task.time}`
}

function createFilterPhrase(filters = {}) {
  const phraseParts = [filters.dateFilter, filters.timeOfDay].filter(Boolean)

  if (phraseParts.length === 0) {
    return ''
  }

  return ` ${phraseParts.join(' ')}`
}

function getTimeOfDay(time) {
  const hour = getHourFromTime(time)

  if (hour === null) {
    return ''
  }

  if (hour >= 5 && hour < 12) {
    return 'morning'
  }

  if (hour >= 12 && hour < 17) {
    return 'afternoon'
  }

  return 'evening'
}

function getHourFromTime(time) {
  const match = String(time || '')
    .trim()
    .match(/^(\d{1,2})(:\d{2})?\s?(am|pm)?$/i)

  if (!match) {
    return null
  }

  let hour = Number(match[1])
  const meridiem = match[3]?.toLowerCase()

  if (meridiem === 'pm' && hour < 12) {
    hour += 12
  }

  if (meridiem === 'am' && hour === 12) {
    hour = 0
  }

  return hour
}

function joinWithAnd(items) {
  if (items.length <= 2) {
    return items.join(' and ')
  }

  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

function resolveTaskReference(searchText, tasks, context) {
  const normalizedSearch = normalizeText(searchText)

  if (isPreviousReference(normalizedSearch)) {
    return createTaskResult(
      findTaskById(tasks, context.lastUpdatedTask?.id) ||
      findTaskById(tasks, context.lastCreatedTask?.id) ||
      findTaskById(tasks, context.lastDeletedCandidate?.id) ||
      getTaskAtIndex(context.lastReadResults, context.lastReadResults.length - 1, tasks) ||
      null,
    )
  }

  const ordinalIndex = getOrdinalIndex(normalizedSearch)

  if (ordinalIndex !== null) {
    const sourceTasks = context.lastReadResults.length > 0 ? context.lastReadResults : tasks
    return createTaskResult(getTaskAtIndex(sourceTasks, ordinalIndex, tasks))
  }

  if (isLastTaskReference(normalizedSearch)) {
    const sourceTasks = context.lastReadResults.length > 0 ? context.lastReadResults : tasks
    return createTaskResult(getTaskAtIndex(sourceTasks, sourceTasks.length - 1, tasks))
  }

  const matches = findMatchingTasks(tasks, searchText)

  return {
    task: matches.length === 1 ? matches[0] : null,
    matches,
  }
}

function createTaskResult(task) {
  return {
    task,
    matches: task ? [task] : [],
  }
}

function getTaskAtIndex(sourceTasks, index, currentTasks) {
  const task = sourceTasks[index]

  if (!task) {
    return null
  }

  return findTaskById(currentTasks, task.id)
}

function findTaskById(tasks, id) {
  if (!id) {
    return null
  }

  return tasks.find((task) => task.id === id) || null
}

function findMatchingTasks(tasks, searchText) {
  const normalizedSearch = normalizeText(searchText)

  return tasks.filter((task) =>
    normalizeText(task.title).includes(normalizedSearch),
  )
}

function isConfirmationAnswer(text) {
  const answer = normalizeConfirmationText(text)

  return [
    'yes',
    'yeah',
    'confirm',
    'delete it',
    'delete',
    'yes delete all',
    'yes delete all tasks',
    'confirm delete all',
    'confirm delete all tasks',
    'delete all',
    'delete all tasks',
    'clear all',
    'clear all tasks',
    'no',
    'cancel',
    'stop',
    'never mind',
  ].includes(answer)
}

function isPreviousReference(searchText) {
  return [
    'previous',
    'previous one',
    'the previous one',
    'previous task',
    'the previous task',
  ].includes(searchText)
}

function isLastTaskReference(searchText) {
  return [
    'last',
    'last task',
    'the last task',
    'last one',
    'the last one',
  ].includes(searchText)
}

function getOrdinalIndex(searchText) {
  const ordinalMap = {
    'first one': 0,
    'the first one': 0,
    'first task': 0,
    'second one': 1,
    'the second one': 1,
    'second task': 1,
    'third one': 2,
    'the third one': 2,
    'third task': 2,
  }

  return ordinalMap[searchText] ?? null
}

function normalizeText(text) {
  return String(text || '').toLowerCase().trim()
}
