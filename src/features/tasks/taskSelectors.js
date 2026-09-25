export function filterTasks(tasks, filters = {}) {
  const search = filters.search.trim().toLowerCase()

  return tasks.filter((task) => {
    if (search && !task.title.toLowerCase().includes(search)) return false
    if (filters.status && task.status !== filters.status) return false
    if (filters.category && task.category !== filters.category) return false
    if (filters.priority && task.priority !== filters.priority) return false
    if (filters.date && !task.scheduledAt?.startsWith(filters.date)) return false
    return true
  })
}