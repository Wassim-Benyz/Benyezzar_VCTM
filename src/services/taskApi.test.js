import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelApiTask,
  completeApiTask,
  createApiTask,
  deleteApiTask,
  fetchTasks,
  reopenApiTask,
  rescheduleApiTask,
  updateApiTask,
} from './taskApi'

const task = {
  id: 'task-1',
  title: 'Prepare demo',
  description: '',
  category: '',
  priority: 'medium',
  status: 'pending',
  scheduledAt: null,
  completedAt: null,
  createdAt: '2026-09-05T10:00:00.000Z',
  updatedAt: '2026-09-05T10:00:00.000Z',
  deletedAt: null,
  rescheduleCount: 0,
}

beforeEach(() => {
  globalThis.fetch = vi.fn()
})

describe('task API client', () => {
  it('fetches tasks without JSON headers', async () => {
    mockJsonResponse([task])

    await expect(fetchTasks()).resolves.toEqual([task])

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tasks',
      {
        method: 'GET',
        credentials: 'include',
      },
    )
  })

  it('creates tasks with a JSON body', async () => {
    mockJsonResponse(task, { status: 201 })

    await expect(createApiTask({ title: 'Prepare demo' })).resolves.toEqual(task)

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tasks',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Prepare demo' }),
      },
    )
  })

  it('calls task mutation endpoints with the expected bodies', async () => {
    mockJsonResponse(task)

    await updateApiTask('task 1', { title: 'Updated' }, 'voice')
    await completeApiTask('task 1', 'system')
    await reopenApiTask('task 1')
    await rescheduleApiTask('task 1', '2026-09-10T09:00:00.000Z', 'visual')
    await cancelApiTask('task 1', 'voice')

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/tasks/task%201',
      {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated', source: 'voice' }),
      },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/api/tasks/task%201/complete',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'system' }),
      },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/api/tasks/task%201/reopen',
      {
        method: 'POST',
        credentials: 'include',
      },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3001/api/tasks/task%201/reschedule',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: '2026-09-10T09:00:00.000Z',
          source: 'visual',
        }),
      },
    )
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      'http://localhost:3001/api/tasks/task%201/cancel',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'voice' }),
      },
    )
  })

  it('handles delete 204 responses without parsing JSON', async () => {
    const json = vi.fn()
    fetch.mockResolvedValue({
      ok: true,
      status: 204,
      json,
    })

    await expect(deleteApiTask('task-1')).resolves.toBeNull()

    expect(json).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/tasks/task-1',
      {
        method: 'DELETE',
        credentials: 'include',
      },
    )
  })

  it('throws backend error details when available', async () => {
    mockJsonResponse(
      { error: true, message: 'Invalid task.', details: 'Title is required.' },
      { ok: false, status: 400 },
    )

    await expect(createApiTask({ title: '' })).rejects.toThrow('Title is required.')
  })

  it('throws safely for unavailable or invalid JSON responses', async () => {
    fetch.mockRejectedValueOnce(new Error('Failed to fetch'))
    await expect(fetchTasks()).rejects.toThrow('Failed to fetch')

    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    })
    await expect(fetchTasks()).rejects.toThrow(
      'Task API returned an invalid JSON response.',
    )

    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('bad json')),
    })
    await expect(fetchTasks()).rejects.toThrow(
      'Task API request failed with status 500.',
    )
  })
})

function mockJsonResponse(data, { ok = true, status = 200 } = {}) {
  fetch.mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(data),
  })
}
