import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelApiTask,
  completeApiTask,
  createApiTask,
  deleteApiTask,
  fetchTasks,
  reopenApiTask,
  rescheduleApiTask,
  updateApiTask,
} from '../services/taskApi'

const EDITABLE_TASK_FIELDS = ['title', 'description', 'category', 'priority']

export function useTasks({ onUnauthorized } = {}) {
  const [tasks, setTasks] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const tasksRef = useRef(tasks)

  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  const refreshTasks = useCallback(async () => {
    try {
      setError('')
      const apiTasks = await fetchTasks()
      const normalizedTasks = apiTasks.map(enrichTaskForExistingUi)
      setTasks(normalizedTasks)
      return normalizedTasks
    } catch (requestError) {
      setError(getTaskApiErrorMessage(requestError))
      handleUnauthorizedTaskError(requestError, onUnauthorized)
      throw requestError
    } finally {
      setIsLoading(false)
    }
  }, [onUnauthorized])

  useEffect(() => {
    let isActive = true

    fetchTasks()
      .then((apiTasks) => {
        if (!isActive) return

        const normalizedTasks = apiTasks.map(enrichTaskForExistingUi)
        setTasks(normalizedTasks)
        setError('')
      })
      .catch((requestError) => {
        if (!isActive) return

        setError(getTaskApiErrorMessage(requestError))
        handleUnauthorizedTaskError(requestError, onUnauthorized)
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [onUnauthorized])

  const runTaskOperation = useCallback(async (operation) => {
    setIsSaving(true)
    setError('')

    try {
      return await operation()
    } catch (requestError) {
      setError(getTaskApiErrorMessage(requestError))
      handleUnauthorizedTaskError(requestError, onUnauthorized)
      throw requestError
    } finally {
      setIsSaving(false)
    }
  }, [onUnauthorized])

  const addTask = useCallback(
    async (taskDetails, source = 'visual') =>
      runTaskOperation(async () => {
        const task = enrichTaskForExistingUi(
          await createApiTask({
            ...createApiTaskPayload(taskDetails),
            source,
          }),
        )

        setTasks((currentTasks) => [task, ...currentTasks])
        return task
      }),
    [runTaskOperation],
  )

  const editTask = useCallback(
    async (id, updates = {}, source = 'visual') =>
      runTaskOperation(async () => {
        let latestTask = findTaskById(tasksRef.current, id)
        let changedTask = null
        const editableUpdates = pickEditableUpdates(updates)

        if (Object.keys(editableUpdates).length > 0) {
          changedTask = enrichTaskForExistingUi(
            await updateApiTask(id, editableUpdates, source),
          )
          setTasks((currentTasks) => replaceTask(currentTasks, changedTask))
          latestTask = changedTask
        }

        const scheduledAt = createScheduledAtFromTaskInput(updates, latestTask)

        if (scheduledAt) {
          changedTask = enrichTaskForExistingUi(
            await rescheduleApiTask(id, scheduledAt, source),
          )
          setTasks((currentTasks) => replaceTask(currentTasks, changedTask))
          latestTask = changedTask
        }

        if (updates.status) {
          changedTask = enrichTaskForExistingUi(
            await updateTaskStatus(id, updates.status, source),
          )
          setTasks((currentTasks) => replaceTask(currentTasks, changedTask))
        }

        return changedTask || latestTask
      }),
    [runTaskOperation],
  )

  const removeTask = useCallback(
    async (id, source = 'visual') =>
      runTaskOperation(async () => {
        await deleteApiTask(id, source)
        setTasks((currentTasks) => currentTasks.filter((task) => task.id !== id))
        return true
      }),
    [runTaskOperation],
  )

  const completeTask = useCallback(
    async (id, source = 'visual') =>
      runTaskOperation(async () => {
        const task = enrichTaskForExistingUi(await completeApiTask(id, source))
        setTasks((currentTasks) => replaceTask(currentTasks, task))
        return task
      }),
    [runTaskOperation],
  )

  const reopenTask = useCallback(
    async (id, source = 'visual') =>
      runTaskOperation(async () => {
        const task = enrichTaskForExistingUi(await reopenApiTask(id, source))
        setTasks((currentTasks) => replaceTask(currentTasks, task))
        return task
      }),
    [runTaskOperation],
  )

  const rescheduleTask = useCallback(
    async (id, scheduledAt, source = 'visual') =>
      runTaskOperation(async () => {
        const task = enrichTaskForExistingUi(
          await rescheduleApiTask(id, scheduledAt, source),
        )
        setTasks((currentTasks) => replaceTask(currentTasks, task))
        return task
      }),
    [runTaskOperation],
  )

  const cancelTask = useCallback(
    async (id, source = 'visual') =>
      runTaskOperation(async () => {
        const task = enrichTaskForExistingUi(await cancelApiTask(id, source))
        setTasks((currentTasks) => replaceTask(currentTasks, task))
        return task
      }),
    [runTaskOperation],
  )

  return {
    tasks,
    isLoading,
    isSaving,
    error,
    refreshTasks,
    addTask,
    editTask,
    removeTask,
    completeTask,
    reopenTask,
    rescheduleTask,
    cancelTask,
  }
}

function createApiTaskPayload(taskDetails = {}) {
  return {
    ...taskDetails,
    scheduledAt: taskDetails.scheduledAt || createScheduledAtFromTaskInput(taskDetails),
  }
}

function pickEditableUpdates(updates = {}) {
  return EDITABLE_TASK_FIELDS.reduce((editableUpdates, field) => {
    if (Object.hasOwn(updates, field)) {
      editableUpdates[field] = updates[field]
    }

    return editableUpdates
  }, {})
}

function updateTaskStatus(id, status, source) {
  if (status === 'completed') {
    return completeApiTask(id, source)
  }

  if (status === 'pending') {
    return reopenApiTask(id, source)
  }

  if (status === 'cancelled') {
    return cancelApiTask(id, source)
  }

  throw new Error('Unsupported task status.')
}

function replaceTask(tasks, updatedTask) {
  return tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))
}

function findTaskById(tasks, id) {
  return tasks.find((task) => task.id === id) || null
}

function enrichTaskForExistingUi(task) {
  if (!task) {
    return task
  }

  const scheduleParts = getScheduleParts(task.scheduledAt)

  return {
    ...task,
    date: task.date || scheduleParts.date,
    time: task.time || scheduleParts.time,
  }
}

function createScheduledAtFromTaskInput(input = {}, existingTask = {}) {
  if (input.scheduledAt !== undefined) {
    return input.scheduledAt
  }

  if (!input.date && !input.time) {
    return null
  }

  const baseDate = parseTaskDate(input.date || existingTask.date)

  if (!baseDate) {
    return null
  }

  const timeParts = parseTaskTime(input.time || existingTask.time)

  baseDate.setHours(timeParts.hour, timeParts.minute, 0, 0)
  return baseDate.toISOString()
}

function parseTaskDate(value) {
  const text = String(value || '').trim().toLowerCase()
  const date = new Date()
  date.setHours(12, 0, 0, 0)

  if (!text || text === 'today') {
    return date
  }

  if (text === 'tomorrow') {
    date.setDate(date.getDate() + 1)
    return date
  }

  const isoDateMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (isoDateMatch) {
    return new Date(`${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}T12:00:00`)
  }

  const weekdayMatch = text.match(/^on\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)

  if (weekdayMatch) {
    return getNextWeekdayDate(weekdayMatch[1])
  }

  return null
}

function parseTaskTime(value) {
  const text = String(value || '').trim().toLowerCase()
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?\s?(am|pm)?$/)

  if (!match) {
    return {
      hour: 12,
      minute: 0,
    }
  }

  let hour = Number(match[1])
  const minute = Number(match[2] || 0)
  const meridiem = match[3]

  if (meridiem === 'pm' && hour < 12) {
    hour += 12
  }

  if (meridiem === 'am' && hour === 12) {
    hour = 0
  }

  return {
    hour,
    minute,
  }
}

function getNextWeekdayDate(weekdayName) {
  const weekdays = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  const date = new Date()
  const targetDay = weekdays.indexOf(weekdayName)
  const dayDifference = (targetDay - date.getDay() + 7) % 7 || 7

  date.setDate(date.getDate() + dayDifference)
  date.setHours(12, 0, 0, 0)

  return date
}

function getScheduleParts(scheduledAt) {
  if (!scheduledAt) {
    return {
      date: '',
      time: '',
    }
  }

  const date = new Date(scheduledAt)

  if (Number.isNaN(date.getTime())) {
    return {
      date: '',
      time: '',
    }
  }

  return {
    date: getRelativeDateLabel(date),
    time: formatSpeechTime(date),
  }
}

function getRelativeDateLabel(date) {
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  if (isSameLocalDate(date, today)) {
    return 'today'
  }

  if (isSameLocalDate(date, tomorrow)) {
    return 'tomorrow'
  }

  return date.toISOString().slice(0, 10)
}

function isSameLocalDate(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

function formatSpeechTime(date) {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const meridiem = hours >= 12 ? 'pm' : 'am'
  const hour = hours % 12 || 12

  return minutes === 0
    ? `${hour} ${meridiem}`
    : `${hour}:${String(minutes).padStart(2, '0')} ${meridiem}`
}

function getTaskApiErrorMessage(error) {
  return error?.message || 'Could not reach the task API.'
}

function handleUnauthorizedTaskError(error, onUnauthorized) {
  if (error?.status === 401) {
    onUnauthorized?.(getTaskApiErrorMessage(error))
  }
}
