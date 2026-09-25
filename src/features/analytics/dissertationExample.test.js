import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  getCompletedTasksInRange,
  getSummaryMetrics,
  groupCompletionsByDay,
  groupCompletionsByTimeOfDay,
} from './analyticsMetrics'

// Grouping uses local Date methods; explicitly fix their timezone for this example.
beforeAll(() => vi.stubEnv('TZ', 'UTC'))
afterAll(() => vi.unstubAllEnvs())

const range = {
  start: new Date('2026-09-21T00:00:00.000Z'),
  end: new Date('2026-09-27T23:59:59.999Z'),
}
const now = new Date('2026-09-27T23:59:59.999Z')
const tasks = [
  { id: 'completed-1', status: 'completed', completedAt: '2026-09-21T09:00:00.000Z', rescheduleCount: 3 },
  { id: 'completed-2', status: 'completed', completedAt: '2026-09-21T11:00:00.000Z', rescheduleCount: 0 },
  { id: 'completed-3', status: 'completed', completedAt: '2026-09-22T18:00:00.000Z', rescheduleCount: 0 },
  { id: 'pending-1', status: 'pending', completedAt: null, rescheduleCount: 1 },
  { id: 'pending-2', status: 'pending', completedAt: null, rescheduleCount: 0 },
  { id: 'cancelled-1', status: 'cancelled', completedAt: null, rescheduleCount: 0 },
].map((task) => ({
  title: task.id,
  priority: 'medium',
  createdAt: '2026-09-21T06:00:00.000Z',
  scheduledAt: null,
  ...task,
}))

describe('dissertation analytics example (UTC, 21–27 September 2026)', () => {
  it('uses UTC for local completion grouping', () => {
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC')
  })

  it.each([
    ['totalCreated', 6],
    ['completed', 3],
    ['pending', 2],
    ['completionRate', 60],
    ['rescheduled', 2],
  ])('%s equals %s', (metric, expected) => {
    expect(getSummaryMetrics(tasks, range, now)[metric]).toBe(expected)
  })

  it('groups two Monday completions and one Tuesday completion', () => {
    const completed = getCompletedTasksInRange(tasks, range)
    expect(groupCompletionsByDay(completed)).toEqual([
      { name: 'Sunday', value: 0 },
      { name: 'Monday', value: 2 },
      { name: 'Tuesday', value: 1 },
      { name: 'Wednesday', value: 0 },
      { name: 'Thursday', value: 0 },
      { name: 'Friday', value: 0 },
      { name: 'Saturday', value: 0 },
    ])
  })

  it('groups two morning completions and one evening completion', () => {
    const completed = getCompletedTasksInRange(tasks, range)
    expect(groupCompletionsByTimeOfDay(completed)).toEqual([
      { name: 'Morning', value: 2 },
      { name: 'Afternoon', value: 0 },
      { name: 'Evening', value: 1 },
      { name: 'Night', value: 0 },
    ])
  })
})
