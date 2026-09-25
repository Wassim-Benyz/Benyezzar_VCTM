const VALID_PRIORITIES = ['low', 'medium', 'high']
const VALID_STATUSES = ['pending', 'completed', 'cancelled']

export function normalizeTask(task = {}) {
  const createdAt = isTimestamp(task.createdAt)
    ? task.createdAt
    : getCurrentTimestamp()
  const status = VALID_STATUSES.includes(task.status) ? task.status : 'pending'

  return {
    id: task.id || createTaskId(),
    title: String(task.title || 'Untitled task').trim(),
    description: task.description ? String(task.description) : '',
    category: task.category ? String(task.category) : '',
    priority: VALID_PRIORITIES.includes(task.priority) ? task.priority : 'medium',
    status,
    createdAt,
    scheduledAt: isTimestamp(task.scheduledAt) ? task.scheduledAt : null,
    completedAt: isTimestamp(task.completedAt) ? task.completedAt : null,
    updatedAt: isTimestamp(task.updatedAt) ? task.updatedAt : createdAt,
    rescheduleCount:
      Number.isInteger(task.rescheduleCount) && task.rescheduleCount >= 0
        ? task.rescheduleCount
        : 0,
    // Keep these legacy fields for voice command compatibility.
    date: task.date || '',
    time: task.time || '',
  }
}

export function normalizeTasks(tasks) {
  return Array.isArray(tasks) ? tasks.map(normalizeTask) : []
}

export function createTaskDetails(details = {}) {
  const now = getCurrentTimestamp()
  return normalizeTask({
    ...details,
    id: createTaskId(),
    createdAt: now,
    updatedAt: now,
  })
}

export function completeTask(task) {
  return { ...task, status: 'completed', completedAt: getCurrentTimestamp() }
}

export function reopenTask(task) {
  return { ...task, status: 'pending', completedAt: null }
}

export function rescheduleTask(task, scheduledAt) {
  return {
    ...task,
    scheduledAt: scheduledAt || null,
    rescheduleCount: task.rescheduleCount + 1,
  }
}

export function isTaskOverdue(task, now = new Date()) {
  return Boolean(
    task.scheduledAt &&
      task.status === 'pending' &&
      new Date(task.scheduledAt).getTime() < now.getTime(),
  )
}

export function formatTaskSchedule(task) {
  if (task.scheduledAt) {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(task.scheduledAt))
  }

  if (task.date || task.time) {
    return `${task.date || 'Unscheduled'}${task.time ? ` at ${task.time}` : ''}`
  }

  return 'Unscheduled'
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function createTaskId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getCurrentTimestamp() {
  return new Date().toISOString()
}