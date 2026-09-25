// Local synthetic screenshot data only; never evidence of real activity or tests.
// From the repository root: node backend/scripts/demo-account.js [--remove]
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createServer } from 'vite'
import { hashPassword } from '../src/auth/password.js'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })
process.env.TZ = 'Europe/Berlin'
const { getPool, closeDatabasePool } = await import('../src/db.js')
const seed = 'dissertation-demo-august-2026-v1'
const email = 'demo.admin@example.com'
const userId = stableId('user')
const description = `Synthetic demonstration only; not real user behaviour or study/test evidence. Seed: ${seed}.`
const api = `http://127.0.0.1:${process.env.PORT || 3001}/api`
const mode = process.argv[2] || '--seed'
assert(['--seed', '--remove', '--check-remove'].includes(mode), 'Unknown option.')
assert(process.argv.length <= 3, 'Unexpected arguments.')
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL).hostname),
  'This script only supports a local database.')
assert(process.env.NODE_ENV !== 'production', 'This script is for local demonstrations only.')

// title, category, priority, created day, completion day/hour, reschedule count, status
const examples = [
  ['Prepare fictional project brief', 'Work', 'high', 1, 3, 9, 3, 'completed'],
  ['Organise sample reading notes', 'Study', 'medium', 2, 4, 14, 0, 'completed'],
  ['Plan a sample weekly menu', 'Home', 'low', 3, 5, 18, 0, 'completed'],
  ['Review mock presentation slides', 'Work', 'high', 4, 6, 10, 1, 'completed'],
  ['Complete practice vocabulary', 'Study', 'medium', 5, 7, 15, 0, 'completed'],
  ['Schedule a fictional exercise plan', 'Health', 'medium', 8, 10, 19, 0, 'completed'],
  ['Sort sample household receipts', 'Home', 'low', 9, 11, 9, 1, 'completed'],
  ['Draft an imaginary weekend itinerary', 'Personal', 'low', 10, 12, 14, 0, 'completed'],
  ['Summarise a practice chapter', 'Study', 'high', 11, 13, 18, 0, 'completed'],
  ['Review a fictional monthly budget', 'Personal', 'high', 12, 14, 10, 1, 'completed'],
  ['Prepare a mock meeting agenda', 'Work', 'medium', 15, 17, 15, 0, 'completed'],
  ['Plan a sample stretching routine', 'Health', 'low', 22, 24, 9, 0, 'completed'],
  ['Outline a practice literature summary', 'Study', 'high', 19, null, null, 1, 'pending'],
  ['Arrange a fictional desk workspace', 'Home', 'low', 21, null, null, 0, 'pending'],
  ['Prepare a mock milestone checklist', 'Work', 'high', 25, null, null, 1, 'pending'],
  ['Plan an imaginary day trip', 'Personal', 'medium', 27, null, null, 0, 'pending'],
  ['Create a sample walking schedule', 'Health', 'medium', 29, null, null, 0, 'pending'],
  ['Organise a fictional pantry inventory', 'Home', 'low', 31, null, null, 0, 'pending'],
  ['Book an imaginary workshop', 'Personal', 'medium', 20, null, null, 0, 'cancelled'],
  ['Plan a fictional group fitness session', 'Health', 'low', 28, null, null, 0, 'cancelled'],
]
const fixtures = examples.map(buildFixture)

function stableId(key) {
  const hex = createHash('sha256').update(`${seed}:${key}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function timestamp(day, hour) {
  return new Date(`2026-08-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`).toISOString()
}

function buildFixture([title, category, priority, day, completedDay, hour, count, status], index) {
  const task = {
    id: stableId(`task-${index + 1}`), title: `[Demo] ${title}`, description, category, priority,
    status, createdAt: timestamp(day, 8), scheduledAt: timestamp(Math.min(day + 1, 31), 9),
    completedAt: completedDay ? timestamp(completedDay, hour) : null,
    updatedAt: timestamp(day, 8), deletedAt: null, rescheduleCount: count,
  }
  const events = []
  const addEvent = (type, time, changes) => events.push({
    id: stableId(`task-${index + 1}-event-${events.length + 1}`),
    type, timestamp: time, changes,
  })
  addEvent('task_created', task.createdAt, {
    title: task.title, category, priority, scheduledAt: task.scheduledAt,
  })
  for (let n = 1; n <= count; n += 1) {
    const before = task.scheduledAt
    task.scheduledAt = timestamp(day + 1, 9 + n * 2)
    task.updatedAt = timestamp(day, 8 + n * 2)
    addEvent('task_rescheduled', task.updatedAt, {
      scheduledAt: { before, after: task.scheduledAt },
      rescheduleCount: { before: n - 1, after: n },
    })
  }
  if (status === 'completed') {
    task.updatedAt = task.completedAt
    addEvent('task_completed', task.updatedAt, {
      status: { before: 'pending', after: 'completed' },
      completedAt: { before: null, after: task.completedAt },
    })
  } else if (status === 'cancelled') {
    task.updatedAt = timestamp(day + 1, 16)
    addEvent('task_cancelled', task.updatedAt, { status: { before: 'pending', after: 'cancelled' } })
  }
  assert(events.every((event, i) => !i || event.timestamp > events[i - 1].timestamp))
  assert.equal(events.at(-1).timestamp, task.updatedAt)
  return { task, events }
}

async function insertFixtures(client) {
  let inserted = 0
  for (const { task, events } of fixtures) {
    const result = await client.query(`
      INSERT INTO tasks (id, user_id, title, description, category, priority, status,
        created_at, scheduled_at, completed_at, updated_at, reschedule_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO NOTHING`,
    [task.id, userId, task.title, description, task.category, task.priority, task.status,
      task.createdAt, task.scheduledAt, task.completedAt, task.updatedAt, task.rescheduleCount])
    inserted += result.rowCount
    // Never rewrite an existing task or append history to it on a rerun.
    if (!result.rowCount) continue
    for (const event of events) {
      await client.query(`INSERT INTO task_events (id, task_id, schema_version, type, source, timestamp, changes)
        VALUES ($1,$2,1,$3,'system',$4,$5::jsonb)`,
      [event.id, task.id, event.type, event.timestamp, JSON.stringify(event.changes)])
    }
  }
  return inserted
}

async function verifyFixtures(client) {
  const { rows } = await client.query(`SELECT id, title, description, category, priority, status,
    created_at AS "createdAt", scheduled_at AS "scheduledAt", completed_at AS "completedAt",
    updated_at AS "updatedAt", deleted_at AS "deletedAt", reschedule_count AS "rescheduleCount"
    FROM tasks WHERE user_id = $1 ORDER BY id`, [userId])
  const tasks = JSON.parse(JSON.stringify(rows))
  assert.deepEqual(tasks, fixtures.map(({ task }) => task).sort((a, b) => a.id.localeCompare(b.id)),
    'Demo tasks differ from the fixture; no existing data will be overwritten.')
  const events = await client.query(`SELECT e.id, e.task_id AS "taskId", e.type, e.source,
    e.schema_version AS "schemaVersion", e.timestamp, e.changes FROM task_events e
    JOIN tasks t ON t.id = e.task_id WHERE t.user_id = $1 ORDER BY e.id`, [userId])
  const expected = fixtures.flatMap(({ task, events }) => events.map((event) => ({
    ...event, taskId: task.id, source: 'system', schemaVersion: 1,
  }))).sort((a, b) => a.id.localeCompare(b.id))
  assert.deepEqual(JSON.parse(JSON.stringify(events.rows)), expected, 'Synthetic event history differs.')
  return tasks
}

async function removeDemo(client) {
  const owned = await client.query('SELECT id, description FROM tasks WHERE user_id = $1 FOR UPDATE', [userId])
  const ids = fixtures.map(({ task }) => task.id)
  assert(owned.rows.every((row) => ids.includes(row.id) && row.description === description),
    'Refusing removal: this account contains tasks outside this demonstration seed.')
  await client.query('DELETE FROM task_events WHERE task_id IN (SELECT id FROM tasks WHERE user_id = $1)', [userId])
  await client.query('DELETE FROM tasks WHERE user_id = $1', [userId])
  // Existing ON DELETE CASCADE removes only this account's sessions.
  await client.query('DELETE FROM users WHERE id = $1 AND email = $2', [userId, email])
  assert.equal((await client.query('SELECT id FROM users WHERE id = $1', [userId])).rowCount, 0)
}

async function verifyAuthentication(password, expectedTasks) {
  const login = await fetch(`${api}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  assert.equal(login.status, 200, 'Demo login failed.')
  assert.equal((await login.json()).user.id, userId)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert(cookie, 'Login did not set the existing session cookie.')
  try {
    const me = await fetch(`${api}/auth/me`, { headers: { Cookie: cookie } })
    assert.equal(me.status, 200)
    assert.equal((await me.json()).user.id, userId)
    const response = await fetch(`${api}/tasks`, { headers: { Cookie: cookie } })
    assert.equal(response.status, 200)
    const tasks = await response.json()
    assert.deepEqual(tasks.sort((a, b) => a.id.localeCompare(b.id)), expectedTasks)
    console.log(`Existing login, session and task APIs verified: ${tasks.length} demo tasks loaded.`)
    return tasks
  } finally {
    const logout = await fetch(`${api}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })
    assert.equal(logout.status, 204, 'Verification session logout failed.')
  }
}

async function reportAnalytics(tasks) {
  // Vite resolves the application's existing extensionless imports without changing them.
  const server = await createServer({
    root: fileURLToPath(new URL('../../', import.meta.url)), configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  })
  try {
    const metrics = await server.ssrLoadModule('/src/features/analytics/analyticsMetrics.js')
    const { getDateRange } = await server.ssrLoadModule('/src/features/analytics/dateRanges.js')
    const now = new Date('2026-09-25T12:00:00+02:00')
    const range = getDateRange('all', now)
    const summary = { ...metrics.getSummaryMetrics(tasks, range, now) }
    delete summary.eligibleTasks
    const completed = metrics.getCompletedTasksInRange(tasks, range)
    console.log(JSON.stringify({
      demonstrationOnly: true, timezone: process.env.TZ, asOf: now.toISOString(), range: range.label,
      summary, cancelled: tasks.filter((task) => task.status === 'cancelled').length,
      displayedCompletionRate: `${Math.round(summary.completionRate)}%`,
      days: metrics.groupCompletionsByDay(completed),
      periods: metrics.groupCompletionsByTimeOfDay(completed),
      syntheticEvents: fixtures.reduce((total, fixture) => total + fixture.events.length, 0),
    }, null, 2))
  } finally {
    await server.close()
  }
}

let client
try {
  client = await getPool().connect()
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [seed])
  const existing = await client.query('SELECT id, name, email FROM users WHERE lower(email) = $1 OR id = $2 FOR UPDATE', [email, userId])
  assert(existing.rowCount <= 1, 'Demo identity conflict; refusing to touch existing users.')
  if (existing.rowCount) {
    assert.deepEqual(existing.rows[0], { id: userId, name: 'Demo Admin', email },
      'The email or ID belongs to another account; refusing to change it.')
  }
  if (mode !== '--seed') {
    if (existing.rowCount) await removeDemo(client)
    await client.query(mode === '--check-remove' ? 'ROLLBACK' : 'COMMIT')
    console.log(mode === '--check-remove' ? 'Demo cleanup verified and rolled back; data retained.' : 'Only this demonstration account, tasks, events and sessions removed (or already absent).')
  } else {
    let password
    if (!existing.rowCount) {
      assert(process.stdout.isTTY, 'Run in an interactive terminal: the temporary password must not be redirected to a file or log.')
      password = randomBytes(24).toString('base64url')
      await client.query('INSERT INTO users (id, name, email, password_hash) VALUES ($1,$2,$3,$4)',
        [userId, 'Demo Admin', email, await hashPassword(password)])
    }
    const inserted = await insertFixtures(client)
    const tasks = await verifyFixtures(client)
    assert.equal(await insertFixtures(client), 0, 'Rerun unexpectedly inserted duplicate tasks.')
    await verifyFixtures(client)
    await client.query('COMMIT')
    console.log(`Demo seed ready: ${inserted} tasks inserted; 20 tasks / 42 system events verified; rerun added zero duplicates.`)
    if (password) {
      // Only the terminal receives plaintext; the database stores the existing scrypt hash.
      process.stdout.write(`\nTemporary password for ${email}: ${password}\n\n`)
      const loadedTasks = await verifyAuthentication(password, tasks)
      password = undefined
      await reportAnalytics(loadedTasks)
    } else {
      console.log('Existing demonstration account and password preserved. Login was not repeated because its password is not stored in plaintext.')
      await reportAnalytics(tasks)
    }
  }
} catch (error) {
  if (client) await client.query('ROLLBACK')
  // Avoid logging database details, request bodies or any generated credentials on errors.
  const reason = error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : (error.code || error.name)
  console.error(`Demo operation failed (${reason}); no existing data was overwritten.`)
  process.exitCode = 1
} finally {
  client?.release()
  await closeDatabasePool()
}
