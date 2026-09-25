import { getDateRange } from './dateRanges'
import {
  getCompletedTasksInRange,
  getSummaryMetrics,
  groupCompletionsByDay,
  groupCompletionsByTimeOfDay,
} from './analyticsMetrics'
import { generateInsights, getSevenDayComparison } from './analyticsInsights'

export function getAnalyticsVoiceResponse({ query, tasks, rangeId = 'last7', now = new Date() }) {
  const range = getDateRange(rangeId, now)
  const summary = getSummaryMetrics(tasks, range, now)
  const completedTasks = getCompletedTasksInRange(tasks, range)
  const completedByDay = groupCompletionsByDay(completedTasks)
  const completedByTime = groupCompletionsByTimeOfDay(completedTasks)

  if (query === 'COMPLETION_RATE') {
    return summary.completionRate === null
      ? `There is not enough data to calculate a completion rate for ${range.label.toLowerCase()}.`
      : `In ${range.label.toLowerCase()}, your recorded completion rate is ${Math.round(summary.completionRate)}%: ${summary.completed} completed of ${summary.eligibleTasks.filter((task) => task.status !== 'cancelled').length} eligible tasks.`
  }

  if (query === 'COMPLETED_COUNT') {
    return completedTasks.length
      ? `In ${range.label.toLowerCase()}, you recorded ${completedTasks.length} completed ${completedTasks.length === 1 ? 'task' : 'tasks'}.`
      : `There are no recorded completions with a valid completion time for ${range.label.toLowerCase()}.`
  }

  if (query === 'TOP_COMPLETION_DAY' || query === 'TOP_COMPLETION_TIME') {
    if (completedTasks.length < 3) return `There is not enough recorded completion data for ${range.label.toLowerCase()} to identify a leading pattern.`
    const data = query === 'TOP_COMPLETION_DAY' ? completedByDay : completedByTime
    const top = [...data].sort((a, b) => b.value - a.value)[0]
    const placement = query === 'TOP_COMPLETION_TIME'
      ? `during the ${top.name.toLowerCase()}`
      : `on ${top.name}`
    return `In ${range.label.toLowerCase()}, ${top.value} of ${completedTasks.length} recorded completions occurred ${placement}.`
  }

  if (query === 'OBSERVED_PATTERNS') {
    const insights = generateInsights({
      completedByDay,
      completedByTime,
      comparison: getSevenDayComparison(tasks, now),
      summary,
    })
    return insights.length ? insights.join(' ') : 'There is not enough recorded task data to report observed patterns yet.'
  }

  return `I can report analytics for ${range.label.toLowerCase()}, including completion rate, completions, leading days or time periods, and observed patterns.`
}