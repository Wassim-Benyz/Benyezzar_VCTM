export const DATE_RANGES = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'all', label: 'All time' },
]

export const FALLBACK_RANGE_ID = 'last30'

export function normalizeRangeId(rangeId) {
  return DATE_RANGES.some((range) => range.id === rangeId)
    ? rangeId
    : FALLBACK_RANGE_ID
}

export function getDateRange(rangeId, now = new Date()) {
  const normalizedRangeId = normalizeRangeId(rangeId)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  if (normalizedRangeId === 'all') return { start: null, end, label: 'All time' }

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (normalizedRangeId === 'last7') start.setDate(start.getDate() - 6)
  if (normalizedRangeId === 'last30') start.setDate(start.getDate() - 29)

  return {
    start,
    end,
    label: DATE_RANGES.find((range) => range.id === normalizedRangeId).label,
  }
}

export function filterTasksByDateRange(tasks, range, timestampField = 'createdAt') {
  return tasks.filter((task) => {
    const timestamp = parseTimestamp(task[timestampField])
    if (!timestamp) return false
    if (range.start && timestamp < range.start) return false
    return timestamp <= range.end
  })
}

export function parseTimestamp(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null
  return new Date(value)
}