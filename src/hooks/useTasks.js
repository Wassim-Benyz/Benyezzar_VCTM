import { useCallback, useState } from 'react'
import {
  createTask,
  deleteTask,
  getTasks,
  updateTask,
} from '../services/taskStorage'

export function useTasks() {
  const [tasks, setTasks] = useState(() => getTasks())

  const refreshTasks = useCallback(() => {
    const storedTasks = getTasks()
    setTasks(storedTasks)
    return storedTasks
  }, [])

  const addTask = useCallback(
    (taskDetails) => {
      const task = createTask(taskDetails)
      refreshTasks()
      return task
    },
    [refreshTasks],
  )

  const editTask = useCallback(
    (id, updates) => {
      const task = updateTask(id, updates)
      refreshTasks()
      return task
    },
    [refreshTasks],
  )

  const removeTask = useCallback(
    (id) => {
      const wasDeleted = deleteTask(id)
      refreshTasks()
      return wasDeleted
    },
    [refreshTasks],
  )

  return {
    tasks,
    refreshTasks,
    addTask,
    editTask,
    removeTask,
  }
}
