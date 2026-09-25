import { useCallback, useEffect, useState } from 'react'
import { AuthScreen } from './components/auth/AuthScreen'
import { VoiceControl } from './components/voice/VoiceControl'
import { AnalyticsDashboard } from './components/analytics/AnalyticsDashboard'
import { normalizeRangeId } from './features/analytics/dateRanges'
import { useTasks } from './hooks/useTasks'
import { fetchCurrentUser, logoutUser } from './services/authApi'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [authError, setAuthError] = useState('')
  const [section, setSection] = useState('tasks')
  const [analyticsRangeId, setAnalyticsRangeId] = useState('last7')

  useEffect(() => {
    let isActive = true

    fetchCurrentUser()
      .then((result) => {
        if (!isActive) return

        setUser(result.user)
        setAuthError('')
      })
      .catch((error) => {
        if (!isActive) return

        setUser(null)
        setAuthError(error.status === 401 ? '' : getAuthErrorMessage(error))
      })
      .finally(() => {
        if (isActive) {
          setIsCheckingAuth(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [])

  const handleAnalyticsRangeChange = (rangeId) => {
    setAnalyticsRangeId(normalizeRangeId(rangeId))
  }

  const handleAuthenticated = useCallback((authenticatedUser) => {
    setUser(authenticatedUser)
    setAuthError('')
  }, [])

  const handleAuthRequired = useCallback((message) => {
    setUser(null)
    setSection('tasks')
    setAuthError(message || 'Please sign in again.')
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await logoutUser()
    } catch (error) {
      setAuthError(getAuthErrorMessage(error))
    } finally {
      setUser(null)
      setSection('tasks')
    }
  }, [])

  if (isCheckingAuth) {
    return (
      <main className="auth-shell">
        <section className="glass-card auth-card" aria-label="Authentication loading">
          <div>
            <div className="card-kicker">Sign in</div>
            <h1>Checking session</h1>
            <p>Loading your account.</p>
          </div>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        initialError={authError}
        onAuthenticated={handleAuthenticated}
      />
    )
  }

  const displayName = user.name || user.email?.split('@')[0] || 'there'

  return (
    <AuthenticatedApp
      displayName={displayName}
      section={section}
      setSection={setSection}
      analyticsRangeId={analyticsRangeId}
      onAnalyticsRangeChange={handleAnalyticsRangeChange}
      onLogout={handleLogout}
      onAuthRequired={handleAuthRequired}
    />
  )
}

function AuthenticatedApp({
  displayName,
  section,
  setSection,
  analyticsRangeId,
  onAnalyticsRangeChange,
  onLogout,
  onAuthRequired,
}) {
  const taskManager = useTasks({ onUnauthorized: onAuthRequired })

  return (
    <div className="authenticated-shell">
      <header className="auth-header">
        <p>Hi, {displayName} 👋</p>
        <nav className="app-nav" aria-label="Primary navigation">
          <button className={section === 'tasks' ? 'active' : ''} type="button" onClick={() => setSection('tasks')}>Task Manager</button>
          <button className={section === 'analytics' ? 'active' : ''} type="button" onClick={() => setSection('analytics')}>Analytics</button>
        </nav>
        <button className="logout-button" type="button" onClick={onLogout}>Logout</button>
      </header>
      <VoiceControl
        compact={section === 'analytics'}
        onNavigate={setSection}
        analyticsRangeId={analyticsRangeId}
        onAnalyticsRangeChange={onAnalyticsRangeChange}
        taskManager={taskManager}
      />
      {section === 'analytics' ? (
        <AnalyticsDashboard
          rangeId={analyticsRangeId}
          onRangeChange={onAnalyticsRangeChange}
          tasks={taskManager.tasks}
          isLoading={taskManager.isLoading}
          error={taskManager.error}
        />
      ) : null}
    </div>
  )
}

function getAuthErrorMessage(error) {
  return error?.message || 'Could not reach the authentication API.'
}

export default App
