import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendEvent, clearEvents, getEvents, loadEvents } from './eventStorage'
import {
  completeStoredTask,
  createTask,
  deleteTask,
  reopenStoredTask,
  rescheduleStoredTask,
  saveTasks,
  updateTask,
} from './taskStorage'

class MemoryStorage {
  values = new Map()

  getItem(key) { return this.values.get(key) || null }
  setItem(key, value) { this.values.set(key, String(value)) }
  removeItem(key) { this.values.delete(key) }
}

const baseTask = {
  title: 'Prepare report',
  category: 'Work',
  priority: 'high',
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-04T12:00:00.000Z'))
  globalThis.window = { localStorage: new MemoryStorage() }
  clearEvents()
})

describe('event storage', () => {
  it('appends without overwriting and keeps chronological order', () => {
    appendEvent({ taskId: 'task-1', type: 'task_created', source: 'visual', timestamp: '2026-09-04T12:00:02.000Z' })
    appendEvent({ taskId: 'task-1', type: 'task_edited', source: 'voice', timestamp: '2026-09-04T12:00:01.000Z' })
    expect(getEvents().map((event) => event.type)).toEqual(['task_edited', 'task_created'])
  })

  it('handles malformed JSON and invalid entries safely', () => {
    window.localStorage.setItem('voice-task-manager:events', '{bad json')
    expect(loadEvents()).toEqual([])
    window.localStorage.setItem('voice-task-manager:events', JSON.stringify([{ type: 'unknown' }, { taskId: 't', type: 'task_created', source: 'invalid' }]))
    expect(loadEvents()).toEqual([])
  })

  it('normalizes event timestamps to valid ISO strings', () => {
    const event = appendEvent({ taskId: 'task-1', type: 'task_created', source: 'system', timestamp: 'not-a-date' })
    expect(event.timestamp).toBe('2026-09-04T12:00:00.000Z')
    expect(() => new Date(event.timestamp).toISOString()).not.toThrow()
  })
})

describe('task behavioral events', () => {
  it('records one created event with the requested source', () => {
    const task = createTask(baseTask, 'voice')
    const events = getEvents()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ taskId: task.id, type: 'task_created', source: 'voice' })
  })

  it('records completion and reopening once each', () => {
    const task = createTask(baseTask)
    completeStoredTask(task.id, 'voice')
    reopenStoredTask(task.id, 'visual')
    expect(getEvents().map((event) => event.type)).toEqual(['task_created', 'task_completed', 'task_reopened'])
    expect(getEvents().filter((event) => event.type === 'task_completed')[0].source).toBe('voice')
  })

  it('records rescheduling instead of a generic edit', () => {
    const task = createTask(baseTask)
    rescheduleStoredTask(task.id, '2026-09-05T09:00:00.000Z', 'visual')
    expect(getEvents().map((event) => event.type)).toEqual(['task_created', 'task_rescheduled'])
  })

  it('stores only changed fields for edits and skips no-op edits', () => {
    const task = createTask(baseTask)
    updateTask(task.id, { category: 'Personal', priority: 'low' }, 'visual')
    updateTask(task.id, { category: 'Personal', priority: 'low' }, 'visual')
    const editEvent = getEvents().find((event) => event.type === 'task_edited')
    expect(Object.keys(editEvent.changes).sort()).toEqual(['category', 'priority'])
    expect(getEvents().filter((event) => event.type === 'task_edited')).toHaveLength(1)
  })

  it('records deletion metadata without description text', () => {
    const task = createTask({ ...baseTask, description: 'Private details' })
    deleteTask(task.id, 'voice')
    const deletion = getEvents().find((event) => event.type === 'task_deleted')
    expect(deletion.source).toBe('voice')
    expect(deletion.changes).not.toHaveProperty('description')
    expect(deletion.changes).toMatchObject({ category: 'Work', priority: 'high', status: 'pending', createdAt: task.createdAt })
  })

  it('does not fabricate events for existing tasks', () => {
    saveTasks([{ id: 'legacy', title: 'Old task', status: 'pending', createdAt: '2025-01-01T00:00:00.000Z' }])
    expect(getEvents()).toEqual([])
  })

  it('does not create an event for a failed operation', () => {
    expect(updateTask('missing', { title: 'No task' }, 'voice')).toBeNull()
    expect(deleteTask('missing', 'voice')).toBe(false)
    expect(getEvents()).toEqual([])
  })
})