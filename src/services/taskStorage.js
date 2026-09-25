import {
  completeTask,
  createTaskDetails,
  normalizeTask,
  normalizeTasks,
  reopenTask,
  rescheduleTask,
} from '../features/tasks/taskModel'
import { appendEvent } from './eventStorage'

const TASKS_STORAGE_KEY = 'voice-task-manager:tasks'

export function getTasks() {
  if (!isLocalStorageAvailable()) {
    return []
  }

  const storedTasks = window.localStorage.getItem(TASKS_STORAGE_KEY)

  if (!storedTasks) {
    return []
  }

  try {
    const tasks = normalizeTasks(JSON.parse(storedTasks))
    saveTasks(tasks)
    return tasks
  } catch {
    return []
  }
}

export function saveTasks(tasks) {
  if (!isLocalStorageAvailable()) {
    return []
  }

  const safeTasks = Array.isArray(tasks) ? tasks : []
  window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(safeTasks))

  return safeTasks
}

export function createTask(taskDetails = {}, source = 'system') {
  const task = createTaskDetails(taskDetails)

  const tasks = [...getTasks(), task]
  saveTasks(tasks)
  appendEvent({
    taskId: task.id,
    type: 'task_created',
    timestamp: task.createdAt,
    source,
    changes: pickTaskFields(task, ['title', 'category', 'priority', 'scheduledAt']),
  })

  return task
}

export function updateTask(id, updates, source = 'system') {
  const now = getCurrentTimestamp()
  let updatedTask = null

  const tasks = getTasks().map((task) => {
    if (task.id !== id) {
      return task
    }

    const candidate = normalizeTask({
      ...task,
      ...updates,
      id: task.id,
      createdAt: task.createdAt,
      updatedAt: now,
    })

    const changes = getChangedFields(task, candidate)
    if (Object.keys(changes).length === 0) {
      updatedTask = task
      return task
    }

    updatedTask = candidate
    appendEvent({
      taskId: task.id,
      type: getUpdateEventType(task, candidate, changes),
      timestamp: now,
      source,
      changes,
    })

    return updatedTask
  })

  saveTasks(tasks)

  return updatedTask
}

export function completeStoredTask(id, source = 'visual') {
  const task = getTasks().find((candidate) => candidate.id === id)
  return task ? updateTask(id, completeTask(task), source) : null
}

export function reopenStoredTask(id, source = 'visual') {
  const task = getTasks().find((candidate) => candidate.id === id)
  return task ? updateTask(id, reopenTask(task), source) : null
}

export function rescheduleStoredTask(id, scheduledAt, source = 'visual') {
  const task = getTasks().find((candidate) => candidate.id === id)
  return task ? updateTask(id, rescheduleTask(task, scheduledAt), source) : null
}

export function deleteTask(id, source = 'system') {
  const tasks = getTasks()
  const deletedTask = tasks.find((task) => task.id === id)
  const remainingTasks = tasks.filter((task) => task.id !== id)
  saveTasks(remainingTasks)

  if (deletedTask) {
    appendEvent({
      taskId: deletedTask.id,
      type: 'task_deleted',
      timestamp: getCurrentTimestamp(),
      source,
      changes: pickTaskFields(deletedTask, [
        'category',
        'priority',
        'status',
        'createdAt',
        'scheduledAt',
        'completedAt',
      ]),
    })
  }

  return remainingTasks.length !== tasks.length
}

function getUpdateEventType(previousTask, updatedTask, changes) {
  if (previousTask.status !== 'completed' && updatedTask.status === 'completed') return 'task_completed'
  if (previousTask.status === 'completed' && updatedTask.status === 'pending') return 'task_reopened'
  if (updatedTask.status === 'cancelled' && previousTask.status !== 'cancelled') return 'task_cancelled'
  if (changes.scheduledAt || changes.date || changes.time || changes.rescheduleCount) return 'task_rescheduled'
  return 'task_edited'
}

function getChangedFields(previousTask, updatedTask) {
  const fields = [
    'title',
    'description',
    'category',
    'priority',
    'status',
    'scheduledAt',
    'completedAt',
    'rescheduleCount',
    'date',
    'time',
  ]
  return fields.reduce((changes, field) => {
    if (previousTask[field] !== updatedTask[field]) {
      changes[field] = { before: previousTask[field] ?? null, after: updatedTask[field] ?? null }
    }
    return changes
  }, {})
}

function pickTaskFields(task, fields) {
  return fields.reduce((values, field) => {
    if (task[field] !== undefined && task[field] !== null && task[field] !== '') values[field] = task[field]
    return values
  }, {})
}

export function clearTasks() {
  if (!isLocalStorageAvailable()) {
    return
  }

  window.localStorage.removeItem(TASKS_STORAGE_KEY)
}

function getCurrentTimestamp() {
  return new Date().toISOString()
}

function isLocalStorageAvailable() {
  return typeof window !== 'undefined' && 'localStorage' in window
}
