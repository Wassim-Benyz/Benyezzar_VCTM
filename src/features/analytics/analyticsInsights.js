export const INSIGHT_THRESHOLDS = {
  minimumCompletions: 3,
  minimumComparisonTasks: 3,
}

export function getSevenDayComparison(tasks, now = new Date()) {
  const currentEnd = new Date(now)
  const currentStart = startOfDay(currentEnd)
  currentStart.setDate(currentStart.getDate() - 6)
  const previousEnd = new Date(currentStart)
  previousEnd.setMilliseconds(-1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - 6)
  const current = completedBetween(tasks, currentStart, currentEnd)
  const previous = completedBetween(tasks, previousStart, previousEnd)
  const rate = (items) => {
    const eligible = items.filter((task) => task.status !== 'cancelled')
    return eligible.length ? (items.filter((task) => task.status === 'completed').length / eligible.length) * 100 : null
  }
  return { currentRate: rate(current), previousRate: rate(previous), currentCount: current.length, previousCount: previous.length }
}

export function generateInsights({ completedByDay, completedByTime, comparison, summary }) {
  const insights = []
  const totalCompletions = summary.completed

  if (totalCompletions >= INSIGHT_THRESHOLDS.minimumCompletions) {
    const topDay = [...completedByDay].sort((a, b) => b.value - a.value)[0]
    const topTime = [...completedByTime].sort((a, b) => b.value - a.value)[0]
    if (topDay.value > 0) insights.push(`Your records show ${topDay.value} of ${totalCompletions} recorded completions occurred on ${topDay.name}.`)
    if (topTime.value > 0) insights.push(`In the selected period, ${topTime.value} of ${totalCompletions} recorded completions occurred in the ${topTime.name.toLowerCase()}.`)
  }

  if (comparison.currentCount + comparison.previousCount >= INSIGHT_THRESHOLDS.minimumComparisonTasks && comparison.currentRate !== null && comparison.previousRate !== null) {
    const difference = comparison.currentRate - comparison.previousRate
    const direction = difference >= 0 ? 'higher' : 'lower'
    insights.push(`Your records show the current seven-day completion rate is ${Math.abs(Math.round(difference))}% ${direction} than the previous seven-day rate.`)
  }

  return insights
}

function completedBetween(tasks, start, end) {
  return tasks.filter((task) => {
    const time = Date.parse(task.createdAt)
    return !Number.isNaN(time) && time >= start.getTime() && time <= end.getTime()
  })
}

function startOfDay(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}