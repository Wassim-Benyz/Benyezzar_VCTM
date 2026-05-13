const TASKS_STORAGE_KEY = 'voice-task-manager:tasks'
const DEFAULT_TASK_STATUS = 'pending'

export function getTasks() {
  if (!isLocalStorageAvailable()) {
    return []
  }

  const storedTasks = window.localStorage.getItem(TASKS_STORAGE_KEY)

  if (!storedTasks) {
    return []
  }

  try {
    const tasks = JSON.parse(storedTasks)
    return Array.isArray(tasks) ? tasks : []
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

export function createTask({ title, date = '', time = '' }) {
  const now = getCurrentTimestamp()
  const task = {
    id: createTaskId(),
    title,
    date,
    time,
    status: DEFAULT_TASK_STATUS,
    createdAt: now,
    updatedAt: now,
  }

  const tasks = [...getTasks(), task]
  saveTasks(tasks)

  return task
}

export function updateTask(id, updates) {
  const now = getCurrentTimestamp()
  let updatedTask = null

  const tasks = getTasks().map((task) => {
    if (task.id !== id) {
      return task
    }

    updatedTask = {
      ...task,
      ...updates,
      id: task.id,
      createdAt: task.createdAt,
      updatedAt: now,
    }

    return updatedTask
  })

  saveTasks(tasks)

  return updatedTask
}

export function deleteTask(id) {
  const tasks = getTasks()
  const remainingTasks = tasks.filter((task) => task.id !== id)
  saveTasks(remainingTasks)

  return remainingTasks.length !== tasks.length
}

export function clearTasks() {
  if (!isLocalStorageAvailable()) {
    return
  }

  window.localStorage.removeItem(TASKS_STORAGE_KEY)
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

function isLocalStorageAvailable() {
  return typeof window !== 'undefined' && 'localStorage' in window
}
