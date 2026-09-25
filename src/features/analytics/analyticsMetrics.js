import { filterTasksByDateRange, parseTimestamp } from './dateRanges'
import { isTaskOverdue } from '../tasks/taskModel'

export function getSummaryMetrics(tasks, range, now = new Date()) {
  const eligibleTasks = filterTasksByDateRange(tasks, range, 'createdAt')
  const completedTasks = eligibleTasks.filter((task) => task.status === 'completed')
  const pendingTasks = eligibleTasks.filter((task) => task.status === 'pending')
  const nonCancelledTasks = eligibleTasks.filter((task) => task.status !== 'cancelled')
  const overdueTasks = pendingTasks.filter((task) => isTaskOverdue(task, now))
  const completionRate = nonCancelledTasks.length
    ? (completedTasks.length / nonCancelledTasks.length) * 100
    : null

  return {
    totalCreated: eligibleTasks.length,
    completed: completedTasks.length,
    pending: pendingTasks.length,
    overdue: overdueTasks.length,
    rescheduled: eligibleTasks.filter((task) => task.rescheduleCount > 0).length,
    completionRate,
    eligibleTasks,
  }
}

export function getCompletedTasksInRange(tasks, range) {
  return filterTasksByDateRange(
    tasks.filter((task) => task.status === 'completed'),
    range,
    'completedAt',
  )
}

export function groupCompletionsByDay(tasks) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const counts = Object.fromEntries(days.map((day) => [day, 0]))
  tasks.forEach((task) => {
    const timestamp = parseTimestamp(task.completedAt)
    if (timestamp) counts[days[timestamp.getDay()]] += 1
  })
  return days.map((name) => ({ name, value: counts[name] }))
}

export function getTimeOfDay(timestamp) {
  const date = parseTimestamp(timestamp)
  if (!date) return null
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'Morning'
  if (hour >= 12 && hour < 17) return 'Afternoon'
  if (hour >= 17 && hour < 21) return 'Evening'
  return 'Night'
}

export function groupCompletionsByTimeOfDay(tasks) {
  const periods = ['Morning', 'Afternoon', 'Evening', 'Night']
  const counts = Object.fromEntries(periods.map((period) => [period, 0]))
  tasks.forEach((task) => {
    const period = getTimeOfDay(task.completedAt)
    if (period) counts[period] += 1
  })
  return periods.map((name) => ({ name, value: counts[name] }))
}
