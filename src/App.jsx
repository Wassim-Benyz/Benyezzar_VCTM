import { useState } from 'react'
import { AuthScreen } from './components/auth/AuthScreen'
import { VoiceControl } from './components/voice/VoiceControl'
import { getDemoSession, logoutDemoUser } from './services/demoAuth'
import './App.css'

function App() {
  const [session, setSession] = useState(() => getDemoSession())

  if (!session) {
    return <AuthScreen onAuthenticated={setSession} />
  }

  const handleLogout = () => {
    logoutDemoUser()
    setSession(null)
  }

  const displayName = session.name || session.email?.split('@')[0] || 'there'

  return (
    <div className="authenticated-shell">
      <header className="auth-header">
        <p>Hi, {displayName} 👋</p>
        <button className="logout-button" type="button" onClick={handleLogout}>
          Logout
        </button>
      </header>
      <VoiceControl />
    </div>
  )
}

export default App
