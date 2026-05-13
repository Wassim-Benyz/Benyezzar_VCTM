const USERS_STORAGE_KEY = 'voice-task-manager:demo-auth:users'
const SESSION_STORAGE_KEY = 'voice-task-manager:demo-auth:session'

export function getDemoSession() {
  if (!isLocalStorageAvailable()) {
    return null
  }

  try {
    const session = JSON.parse(window.localStorage.getItem(SESSION_STORAGE_KEY))
    return isValidSession(session) ? session : null
  } catch {
    return null
  }
}

export async function signupDemoUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email)
  const displayName = String(name || '').trim()
  const safePassword = String(password || '')

  if (!displayName || !normalizedEmail || !safePassword) {
    return {
      error: 'Enter a name, email, and password to create a demo account.',
    }
  }

  if (safePassword.length < 6) {
    return { error: 'Use at least 6 characters for this demo password.' }
  }

  const users = getDemoUsers()

  if (users.some((user) => user.email === normalizedEmail)) {
    return { error: 'A demo account already exists for that email.' }
  }

  const user = {
    id: createDemoUserId(),
    name: displayName,
    email: normalizedEmail,
    passwordHash: await hashPassword(safePassword),
    createdAt: new Date().toISOString(),
  }
  const nextUsers = [...users, user]

  saveDemoUsers(nextUsers)

  return { session: createDemoSession(user) }
}

export async function loginDemoUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email)
  const passwordHash = await hashPassword(String(password || ''))
  const user = getDemoUsers().find(
    (storedUser) =>
      storedUser.email === normalizedEmail &&
      storedUser.passwordHash === passwordHash,
  )

  if (!user) {
    return { error: 'Email or password did not match a demo account.' }
  }

  return { session: createDemoSession(user) }
}

export function logoutDemoUser() {
  if (!isLocalStorageAvailable()) {
    return
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

function createDemoSession(user) {
  const session = {
    userId: user.id,
    name: user.name,
    email: user.email,
    startedAt: new Date().toISOString(),
  }

  if (isLocalStorageAvailable()) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  }

  return session
}

function getDemoUsers() {
  if (!isLocalStorageAvailable()) {
    return []
  }

  try {
    const users = JSON.parse(window.localStorage.getItem(USERS_STORAGE_KEY))
    return Array.isArray(users) ? users : []
  } catch {
    return []
  }
}

function saveDemoUsers(users) {
  if (!isLocalStorageAvailable()) {
    return
  }

  window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
}

async function hashPassword(password) {
  const text = `demo-auth:${password}`

  if (crypto.subtle) {
    const data = new TextEncoder().encode(text)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  return btoa(text)
}

function createDemoUserId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidSession(session) {
  return Boolean(session?.userId && session?.email)
}

function isLocalStorageAvailable() {
  return typeof window !== 'undefined' && 'localStorage' in window
}
