const EVENTS_STORAGE_KEY = 'voice-task-manager:events'
const EVENT_SCHEMA_VERSION = 1
const EVENT_TYPES = new Set([
  'task_created',
  'task_completed',
  'task_reopened',
  'task_edited',
  'task_rescheduled',
  'task_cancelled',
  'task_deleted',
])
const EVENT_SOURCES = new Set(['voice', 'visual', 'system'])

export function loadEvents() {
  if (!isLocalStorageAvailable()) return []

  const storedEvents = window.localStorage.getItem(EVENTS_STORAGE_KEY)
  if (!storedEvents) return []

  try {
    return normalizeEvents(JSON.parse(storedEvents))
  } catch {
    return []
  }
}

export function appendEvent(event) {
  const normalizedEvent = normalizeEvent(event)
  if (!normalizedEvent) return null

  try {
    const events = [...loadEvents(), normalizedEvent].sort(compareEvents)
    window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events))
    return normalizedEvent
  } catch {
    return null
  }
}

export function getEvents() {
  return loadEvents()
}

export function clearEvents() {
  if (isLocalStorageAvailable()) window.localStorage.removeItem(EVENTS_STORAGE_KEY)
}

export function normalizeEvent(event = {}) {
  if (!event.taskId || !EVENT_TYPES.has(event.type) || !EVENT_SOURCES.has(event.source)) {
    return null
  }

  const timestamp = isTimestamp(event.timestamp) ? event.timestamp : new Date().toISOString()
  return {
    id: event.id || createEventId(),
    schemaVersion: EVENT_SCHEMA_VERSION,
    taskId: String(event.taskId),
    type: event.type,
    timestamp,
    source: event.source,
    changes: isPlainObject(event.changes) ? event.changes : {},
  }
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return []
  return events.map(normalizeEvent).filter(Boolean).sort(compareEvents)
}

function compareEvents(first, second) {
  return Date.parse(first.timestamp) - Date.parse(second.timestamp)
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function createEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isLocalStorageAvailable() {
  return typeof window !== 'undefined' && 'localStorage' in window
}