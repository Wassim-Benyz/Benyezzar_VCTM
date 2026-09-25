import { describe, expect, it } from 'vitest'
import { getDateRange, filterTasksByDateRange, normalizeRangeId } from './dateRanges'
import {
  getSummaryMetrics,
  getTimeOfDay,
  groupCompletionsByDay,
  groupCompletionsByTimeOfDay,
} from './analyticsMetrics'
import { generateInsights, INSIGHT_THRESHOLDS, getSevenDayComparison } from './analyticsInsights'
import { isTaskOverdue } from '../tasks/taskModel'
import { getAnalyticsVoiceResponse } from './analyticsVoice'
import { parseVoiceCommand } from '../voice/voiceParser'

const now = new Date('2026-09-02T12:00:00.000Z')
const task = (overrides = {}) => ({
  id: Math.random().toString(),
  title: 'Task',
  status: 'pending',
  priority: 'medium',
  createdAt: '2026-09-02T10:00:00.000Z',
  completedAt: null,
  scheduledAt: null,
  rescheduleCount: 0,
  ...overrides,
})

describe('analytics date ranges', () => {
  it('uses inclusive seven-day boundaries', () => {
    const range = getDateRange('last7', now)
    expect(range.start.getHours()).toBe(0)
    expect(range.start.getDate()).toBe(27)
    expect(filterTasksByDateRange([task({ createdAt: localTimestamp(2026, 7, 27) })], range)).toHaveLength(1)
  })

  it('ignores invalid and missing timestamps', () => {
    const range = getDateRange('all', now)
    expect(filterTasksByDateRange([task({ createdAt: 'bad' }), task({ createdAt: null })], range)).toHaveLength(0)
  })

  it('retains three ranges and falls back removed or invalid values to last 30 days', () => {
    expect(normalizeRangeId('last7')).toBe('last7')
    expect(normalizeRangeId('last30')).toBe('last30')
    expect(normalizeRangeId('all')).toBe('all')
    expect(normalizeRangeId('week')).toBe('last30')
    expect(normalizeRangeId('month')).toBe('last30')
    expect(getDateRange('invalid', now).label).toBe('Last 30 days')
  })
})

describe('analytics metrics', () => {
  it('calculates completion rate excluding cancelled tasks', () => {
    const summary = getSummaryMetrics([
      task({ status: 'completed' }),
      task({ status: 'pending' }),
      task({ status: 'cancelled' }),
    ], getDateRange('all', now), now)
    expect(summary.completionRate).toBe(50)
  })

  it('returns null completion rate with no eligible tasks', () => {
    expect(getSummaryMetrics([task({ status: 'cancelled' })], getDateRange('all', now), now).completionRate).toBeNull()
  })

  it('detects only pending overdue tasks with valid scheduledAt', () => {
    expect(isTaskOverdue(task({ scheduledAt: '2026-09-02T11:00:00.000Z' }), now)).toBe(true)
    expect(isTaskOverdue(task({ status: 'completed', scheduledAt: '2026-09-02T11:00:00.000Z' }), now)).toBe(false)
    expect(isTaskOverdue(task({ scheduledAt: 'bad' }), now)).toBe(false)
  })

  it('groups completion day and time safely', () => {
    const tasks = [
      task({ status: 'completed', completedAt: localTimestamp(2026, 8, 2, 6) }),
      task({ status: 'completed', completedAt: localTimestamp(2026, 8, 2, 22) }),
    ]
    expect(groupCompletionsByDay(tasks).find((item) => item.name === 'Wednesday').value).toBe(2)
    expect(groupCompletionsByTimeOfDay(tasks).find((item) => item.name === 'Morning').value).toBe(1)
    expect(getTimeOfDay(localTimestamp(2026, 8, 2, 2))).toBe('Night')
  })

})

function localTimestamp(year, month, day, hour = 0) {
  return new Date(year, month, day, hour).toISOString()
}

describe('analytics insights', () => {
  it('waits for the minimum completion sample', () => {
    const summary = { completed: INSIGHT_THRESHOLDS.minimumCompletions - 1, totalCreated: 0 }
    expect(generateInsights({ completedByDay: [], completedByTime: [], comparison: {}, summary })).toEqual([])
  })

  it('compares current and previous seven-day created populations', () => {
    const tasks = [
      task({ createdAt: '2026-09-02T10:00:00.000Z', status: 'completed' }),
      task({ createdAt: '2026-08-25T10:00:00.000Z', status: 'pending' }),
      task({ createdAt: '2026-08-24T10:00:00.000Z', status: 'completed' }),
    ]
    const comparison = getSevenDayComparison(tasks, now)
    expect(comparison.currentRate).toBe(100)
    expect(comparison.previousRate).toBe(50)
  })
})

describe('analytics voice commands', () => {
  it.each([
    ['open analytics', 'OPEN_ANALYTICS'],
    ['go back to task manager', 'OPEN_TASK_MANAGER'],
    ['show me the last 7 days', 'SET_ANALYTICS_RANGE'],
    ['show the last 30 days', 'SET_ANALYTICS_RANGE'],
    ['show all time', 'SET_ANALYTICS_RANGE'],
    ['what is my completion rate', 'ANALYTICS_QUERY'],
    ['which day has the most completions', 'ANALYTICS_QUERY'],
    ['when do I usually complete tasks', 'ANALYTICS_QUERY'],
    ['read my observed patterns', 'ANALYTICS_QUERY'],
    ['stop reading', 'STOP_READING'],
  ])('recognizes %s', (text, intent) => {
    expect(parseVoiceCommand(text).intent).toBe(intent)
  })

  it('formats measurable analytics responses without productivity claims', () => {
    const tasks = [
      task({ status: 'completed', completedAt: '2026-09-02T07:00:00.000Z' }),
      task({ status: 'pending' }),
    ]
    const response = getAnalyticsVoiceResponse({ query: 'COMPLETION_RATE', tasks, rangeId: 'all', now })
    expect(response).toContain('50%')
    expect(response).not.toMatch(/productive|unproductive|work better/i)
  })
})