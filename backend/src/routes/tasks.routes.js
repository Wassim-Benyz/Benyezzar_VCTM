import { Router } from 'express'
import { getPool, query } from '../db.js'

const VALID_PRIORITIES = new Set(['low', 'medium', 'high'])
const VALID_STATUSES = new Set(['pending', 'completed', 'cancelled'])
const VALID_EVENT_SOURCES = new Set(['voice', 'visual', 'system'])
const ALLOWED_UPDATE_FIELDS = new Set(['title', 'description', 'category', 'priority'])
const ALLOWED_PATCH_KEYS = new Set([...ALLOWED_UPDATE_FIELDS, 'source'])
const ALLOWED_SOURCE_BODY_KEYS = new Set(['source'])
const ALLOWED_RESCHEDULE_BODY_KEYS = new Set(['scheduledAt', 'source'])
const TASK_RETURNING_FIELDS = `
  id,
  title,
  description,
  category,
  priority,
  status,
  scheduled_at,
  completed_at,
  created_at,
  updated_at,
  deleted_at,
  reschedule_count
`
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const tasksRouter = Router()

tasksRouter.get('/', async (request, response, next) => {
  try {
    const { rows } = await query(`
      SELECT
        id,
        title,
        description,
        category,
        priority,
        status,
        scheduled_at,
        completed_at,
        created_at,
        updated_at,
        deleted_at,
        reschedule_count
      FROM tasks
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `, [request.user.id])

    response.json(rows.map(mapTaskRow))
  } catch (error) {
    next(error)
  }
})

tasksRouter.post('/', async (request, response, next) => {
  const validation = validateCreateTask(request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid task.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const taskResult = await client.query(
      ...createTaskInsertQuery(validation.task, request.user.id),
    )

    const task = mapTaskRow(taskResult.rows[0])

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        task.id,
        'task_created',
        validation.source,
        JSON.stringify(createTaskCreatedChanges(task)),
      ],
    )

    await client.query('COMMIT')

    response.status(201).json(task)
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

tasksRouter.patch('/:id', async (request, response, next) => {
  const validation = validateUpdateTask(request.params.id, request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid task update.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const existingResult = await client.query(
      `
        SELECT ${TASK_RETURNING_FIELDS}
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [validation.id, request.user.id],
    )

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      response.status(404).json({
        error: true,
        message: 'Task not found.',
      })
      return
    }

    const existingTask = mapTaskRow(existingResult.rows[0])
    const changes = getTaskUpdateChanges(existingTask, validation.updates)

    if (Object.keys(changes).length === 0) {
      await client.query('COMMIT')
      response.status(200).json(existingTask)
      return
    }

    const updateResult = await client.query(
      ...createTaskUpdateQuery(
        validation.id,
        request.user.id,
        validation.updates,
        changes,
      ),
    )
    const updatedTask = mapTaskRow(updateResult.rows[0])

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        updatedTask.id,
        'task_edited',
        validation.source,
        JSON.stringify(changes),
      ],
    )

    await client.query('COMMIT')

    response.status(200).json(updatedTask)
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

tasksRouter.post('/:id/complete', async (request, response, next) => {
  const validation = validateSourceOnlyRequest(request.params.id, request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid completion request.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const existingResult = await client.query(
      `
        SELECT ${TASK_RETURNING_FIELDS}
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [validation.id, request.user.id],
    )

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      response.status(404).json({
        error: true,
        message: 'Task not found.',
      })
      return
    }

    const existingTask = mapTaskRow(existingResult.rows[0])

    if (existingTask.status === 'completed') {
      await client.query('COMMIT')
      response.status(200).json(existingTask)
      return
    }

    if (existingTask.status === 'cancelled') {
      await client.query('ROLLBACK')
      response.status(409).json({
        error: true,
        message: 'Cancelled tasks cannot be completed.',
      })
      return
    }

    const updateResult = await client.query(
      `
        UPDATE tasks
        SET
          status = $1,
          completed_at = now(),
          updated_at = now()
        WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
        RETURNING ${TASK_RETURNING_FIELDS}
      `,
      ['completed', validation.id, request.user.id],
    )
    const completedTask = mapTaskRow(updateResult.rows[0])

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        completedTask.id,
        'task_completed',
        validation.source,
        JSON.stringify({
          status: {
            before: existingTask.status,
            after: completedTask.status,
          },
          completedAt: {
            before: existingTask.completedAt,
            after: completedTask.completedAt,
          },
        }),
      ],
    )

    await client.query('COMMIT')

    response.status(200).json(completedTask)
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

tasksRouter.post('/:id/reopen', async (request, response, next) => {
  const validation = validateSourceOnlyRequest(request.params.id, request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid reopen request.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const existingResult = await client.query(
      `
        SELECT ${TASK_RETURNING_FIELDS}
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [validation.id, request.user.id],
    )

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      response.status(404).json({
        error: true,
        message: 'Task not found.',
      })
      return
    }

    const existingTask = mapTaskRow(existingResult.rows[0])

    if (existingTask.status === 'pending') {
      await client.query('COMMIT')
      response.status(200).json(existingTask)
      return
    }

    if (existingTask.status === 'cancelled') {
      await client.query('ROLLBACK')
      response.status(409).json({
        error: true,
        message: 'Cancelled tasks cannot be reopened.',
      })
      return
    }

    const updateResult = await client.query(
      `
        UPDATE tasks
        SET
          status = $1,
          completed_at = NULL,
          updated_at = now()
        WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
        RETURNING ${TASK_RETURNING_FIELDS}
      `,
      ['pending', validation.id, request.user.id],
    )
    const reopenedTask = mapTaskRow(updateResult.rows[0])

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        reopenedTask.id,
        'task_reopened',
        validation.source,
        JSON.stringify({
          status: {
            before: existingTask.status,
            after: reopenedTask.status,
          },
          completedAt: {
            before: existingTask.completedAt,
            after: reopenedTask.completedAt,
          },
        }),
      ],
    )

    await client.query('COMMIT')

    response.status(200).json(reopenedTask)
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

tasksRouter.post('/:id/reschedule', async (request, response, next) => {
  const validation = validateRescheduleRequest(request.params.id, request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid reschedule request.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const existingResult = await client.query(
      `
        SELECT ${TASK_RETURNING_FIELDS}
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [validation.id, request.user.id],
    )

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      response.status(404).json({
        error: true,
        message: 'Task not found.',
      })
      return
    }

    const existingTask = mapTaskRow(existingResult.rows[0])

    if (existingTask.status !== 'pending') {
      await client.query('ROLLBACK')
      response.status(409).json({
        error: true,
        message: 'Only pending tasks can be rescheduled.',
      })
      return
    }

    if (existingTask.scheduledAt === validation.scheduledAt) {
      await client.query('COMMIT')
      response.status(200).json(existingTask)
      return
    }

    const updateResult = await client.query(
      `
        UPDATE tasks
        SET
          scheduled_at = $1,
          reschedule_count = reschedule_count + 1,
          updated_at = now()
        WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
        RETURNING ${TASK_RETURNING_FIELDS}
      `,
      [validation.scheduledAt, validation.id, request.user.id],
    )
    const rescheduledTask = mapTaskRow(updateResult.rows[0])

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        rescheduledTask.id,
        'task_rescheduled',
        validation.source,
        JSON.stringify({
          scheduledAt: {
            before: existingTask.scheduledAt,
            after: rescheduledTask.scheduledAt,
          },
          rescheduleCount: {
            before: existingTask.rescheduleCount,
            after: rescheduledTask.rescheduleCount,
          },
        }),
      ],
    )

    await client.query('COMMIT')

    response.status(200).json(rescheduledTask)
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

tasksRouter.post('/:id/cancel', async (request, response, next) => {
  const validation = validateSourceOnlyRequest(request.params.id, request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid cancellation request.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const existingResult = await client.query(
      `
        SELECT ${TASK_RETURNING_FIELDS}
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [validation.id, request.user.id],
    )

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      response.status(404).json({
        error: true,
        message: 'Task not found.',
      })
      return
    }

    const existingTask = mapTaskRow(existingResult.rows[0])

    if (existingTask.status === 'cancelled') {
      await client.query('COMMIT')
      response.status(200).json(existingTask)
      return
    }

    if (existingTask.status === 'completed') {
      await client.query('ROLLBACK')
      response.status(409).json({
        error: true,
        message: 'Completed tasks cannot be cancelled.',
      })
      return
    }

    const updateResult = await client.query(
      `
        UPDATE tasks
        SET
          status = $1,
          updated_at = now()
        WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
        RETURNING ${TASK_RETURNING_FIELDS}
      `,
      ['cancelled', validation.id, request.user.id],
    )
    const cancelledTask = mapTaskRow(updateResult.rows[0])

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        cancelledTask.id,
        'task_cancelled',
        validation.source,
        JSON.stringify({
          status: {
            before: existingTask.status,
            after: cancelledTask.status,
          },
        }),
      ],
    )

    await client.query('COMMIT')

    response.status(200).json(cancelledTask)
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

tasksRouter.delete('/:id', async (request, response, next) => {
  const validation = validateSourceOnlyRequest(request.params.id, request.body)

  if (!validation.ok) {
    response.status(400).json({
      error: true,
      message: 'Invalid deletion request.',
      details: validation.message,
    })
    return
  }

  let client

  try {
    client = await getPool().connect()
    await client.query('BEGIN')

    const existingResult = await client.query(
      `
        SELECT ${TASK_RETURNING_FIELDS}
        FROM tasks
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `,
      [validation.id, request.user.id],
    )

    if (existingResult.rowCount === 0) {
      await client.query('ROLLBACK')
      response.status(404).json({
        error: true,
        message: 'Task not found.',
      })
      return
    }

    const existingTask = mapTaskRow(existingResult.rows[0])

    await client.query(
      `
        UPDATE tasks
        SET
          deleted_at = now(),
          updated_at = now()
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      `,
      [validation.id, request.user.id],
    )

    await client.query(
      `
        INSERT INTO task_events (
          task_id,
          type,
          source,
          changes
        )
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [
        validation.id,
        'task_deleted',
        validation.source,
        JSON.stringify(createTaskDeletedChanges(existingTask)),
      ],
    )

    await client.query('COMMIT')

    response.status(204).end()
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK')
    }
    next(error)
  } finally {
    client?.release()
  }
})

function validateRescheduleRequest(id, body = {}) {
  if (!UUID_PATTERN.test(id)) {
    return invalid('Task ID must be a valid UUID.')
  }

  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object.')
  }

  const unsupportedFields = Object.keys(body).filter(
    (key) => !ALLOWED_RESCHEDULE_BODY_KEYS.has(key),
  )

  if (unsupportedFields.length > 0) {
    return invalid(`Unsupported field: ${unsupportedFields.join(', ')}.`)
  }

  if (!Object.hasOwn(body, 'scheduledAt')) {
    return invalid('scheduledAt is required.')
  }

  const scheduledAt = normalizeRequiredIsoTimestamp(body.scheduledAt)

  if (!scheduledAt.ok) {
    return invalid('scheduledAt must be a valid ISO timestamp.')
  }

  const source = body.source === undefined ? 'visual' : body.source
  if (!VALID_EVENT_SOURCES.has(source)) {
    return invalid('Source must be voice, visual, or system.')
  }

  return {
    ok: true,
    id,
    scheduledAt: scheduledAt.value,
    source,
  }
}

function validateSourceOnlyRequest(id, body = {}) {
  if (!UUID_PATTERN.test(id)) {
    return invalid('Task ID must be a valid UUID.')
  }

  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object.')
  }

  const unsupportedFields = Object.keys(body).filter(
    (key) => !ALLOWED_SOURCE_BODY_KEYS.has(key),
  )

  if (unsupportedFields.length > 0) {
    return invalid(`Unsupported field: ${unsupportedFields.join(', ')}.`)
  }

  const source = body.source === undefined ? 'visual' : body.source
  if (!VALID_EVENT_SOURCES.has(source)) {
    return invalid('Source must be voice, visual, or system.')
  }

  return {
    ok: true,
    id,
    source,
  }
}

function validateUpdateTask(id, body = {}) {
  if (!UUID_PATTERN.test(id)) {
    return invalid('Task ID must be a valid UUID.')
  }

  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object.')
  }

  const keys = Object.keys(body)
  const unsupportedFields = keys.filter((key) => !ALLOWED_PATCH_KEYS.has(key))

  if (unsupportedFields.length > 0) {
    return invalid(`Unsupported field: ${unsupportedFields.join(', ')}.`)
  }

  const updateFields = keys.filter((key) => ALLOWED_UPDATE_FIELDS.has(key))

  if (updateFields.length === 0) {
    return invalid('At least one editable field is required.')
  }

  const source = body.source === undefined ? 'visual' : body.source
  if (!VALID_EVENT_SOURCES.has(source)) {
    return invalid('Source must be voice, visual, or system.')
  }

  const updates = {}

  if (Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string') {
      return invalid('Title must be a string.')
    }

    const title = body.title.trim()

    if (!title) {
      return invalid('Title is required.')
    }

    updates.title = title
  }

  for (const field of ['description', 'category']) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== 'string') {
        return invalid(`${field} must be a string.`)
      }

      updates[field] = body[field]
    }
  }

  if (Object.hasOwn(body, 'priority')) {
    if (!VALID_PRIORITIES.has(body.priority)) {
      return invalid('Priority must be low, medium, or high.')
    }

    updates.priority = body.priority
  }

  return {
    ok: true,
    id,
    source,
    updates,
  }
}

function getTaskUpdateChanges(existingTask, updates) {
  return Object.entries(updates).reduce((changes, [field, after]) => {
    const before = existingTask[field]

    if (before === after) {
      return changes
    }

    if (field === 'description') {
      changes.description = { changed: true }
      return changes
    }

    changes[field] = {
      before,
      after,
    }

    return changes
  }, {})
}

function createTaskUpdateQuery(id, userId, updates, changes) {
  const values = []
  const assignments = Object.keys(changes).map((field) => {
    values.push(updates[field])
    return `${toTaskColumn(field)} = $${values.length}`
  })

  values.push(id)
  values.push(userId)

  return [
    `
      UPDATE tasks
      SET ${assignments.join(', ')}, updated_at = now()
      WHERE id = $${values.length - 1}
        AND user_id = $${values.length}
        AND deleted_at IS NULL
      RETURNING ${TASK_RETURNING_FIELDS}
    `,
    values,
  ]
}

function toTaskColumn(field) {
  if (field === 'rescheduleCount') {
    return 'reschedule_count'
  }

  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function createTaskInsertQuery(task, userId) {
  const columns = ['user_id', 'title']
  const values = [userId, task.title]
  const placeholders = ['$1', '$2']

  addInsertValue({
    columns,
    values,
    placeholders,
    column: 'description',
    value: task.description,
  })
  addInsertValue({
    columns,
    values,
    placeholders,
    column: 'category',
    value: task.category,
  })
  addInsertValue({
    columns,
    values,
    placeholders,
    column: 'priority',
    value: task.priority,
  })
  addInsertValue({
    columns,
    values,
    placeholders,
    column: 'status',
    value: task.status,
  })
  addInsertValue({
    columns,
    values,
    placeholders,
    column: 'scheduled_at',
    value: task.scheduledAt,
  })

  return [
    `
      INSERT INTO tasks (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING
        id,
        title,
        description,
        category,
        priority,
        status,
        scheduled_at,
        completed_at,
        created_at,
        updated_at,
        deleted_at,
        reschedule_count
    `,
    values,
  ]
}

function addInsertValue({ columns, values, placeholders, column, value }) {
  if (value === undefined || value === null) {
    return
  }

  columns.push(column)
  values.push(value)
  placeholders.push(`$${values.length}`)
}

function validateCreateTask(body = {}) {
  if (!isPlainObject(body)) {
    return invalid('Request body must be a JSON object.')
  }

  if (Object.hasOwn(body, 'userId') || Object.hasOwn(body, 'user_id')) {
    return invalid('Task ownership cannot be supplied by the client.')
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''

  if (!title) {
    return invalid('Title is required.')
  }

  const priority = body.priority
  if (priority !== undefined && !VALID_PRIORITIES.has(priority)) {
    return invalid('Priority must be low, medium, or high.')
  }

  const status = body.status
  if (status !== undefined && !VALID_STATUSES.has(status)) {
    return invalid('Status must be pending, completed, or cancelled.')
  }

  const source = body.source || 'visual'
  if (!VALID_EVENT_SOURCES.has(source)) {
    return invalid('Source must be voice, visual, or system.')
  }

  const scheduledAt = normalizeOptionalTimestamp(body.scheduledAt)
  if (!scheduledAt.ok) {
    return invalid('scheduledAt must be a valid timestamp.')
  }

  return {
    ok: true,
    source,
    task: {
      title,
      description: normalizeOptionalText(body.description),
      category: normalizeOptionalText(body.category),
      priority,
      status,
      scheduledAt: scheduledAt.value,
    },
  }
}

function invalid(message) {
  return {
    ok: false,
    message,
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOptionalText(value) {
  return typeof value === 'string' ? value : undefined
}

function normalizeOptionalTimestamp(value) {
  if (value === undefined || value === null) {
    return {
      ok: true,
      value: null,
    }
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
    }
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return {
      ok: false,
    }
  }

  return {
    ok: true,
    value: new Date(timestamp).toISOString(),
  }
}

function normalizeRequiredIsoTimestamp(value) {
  if (typeof value !== 'string') {
    return {
      ok: false,
    }
  }

  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp) || new Date(timestamp).toISOString() !== value) {
    return {
      ok: false,
    }
  }

  return {
    ok: true,
    value,
  }
}

function createTaskCreatedChanges(task) {
  return {
    title: task.title,
    ...(task.category ? { category: task.category } : {}),
    priority: task.priority,
    ...(task.scheduledAt ? { scheduledAt: task.scheduledAt } : {}),
  }
}

function createTaskDeletedChanges(task) {
  return removeEmptyValues({
    category: task.category,
    priority: task.priority,
    status: task.status,
    createdAt: task.createdAt,
    scheduledAt: task.scheduledAt,
    completedAt: task.completedAt,
  })
}

function removeEmptyValues(values) {
  return Object.entries(values).reduce((result, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value
    }

    return result
  }, {})
}

function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    priority: row.priority,
    status: row.status,
    scheduledAt: formatTimestamp(row.scheduled_at),
    completedAt: formatTimestamp(row.completed_at),
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at),
    deletedAt: formatTimestamp(row.deleted_at),
    rescheduleCount: row.reschedule_count,
  }
}

function formatTimestamp(value) {
  if (!value) {
    return null
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
