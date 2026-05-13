import { useState } from 'react'
import { loginDemoUser, signupDemoUser } from '../../services/demoAuth'

export function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSignup = mode === 'signup'

  const handleChange = (event) => {
    setForm((currentForm) => ({
      ...currentForm,
      [event.target.name]: event.target.value,
    }))
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    const result = isSignup
      ? await signupDemoUser(form)
      : await loginDemoUser(form)

    setIsSubmitting(false)

    if (result.error) {
      setError(result.error)
      return
    }

    onAuthenticated(result.session)
  }

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup')
    setError('')
  }

  return (
    <main className="auth-shell">
      <section className="glass-card auth-card" aria-label="Demo authentication">
        <div>
          <div className="card-kicker">Demo Access</div>
          <h1>{isSignup ? 'Create Demo Account' : 'Login'}</h1>
          <p>
            This local-only gate stores demo account and session data in your
            browser.
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup ? (
            <label>
              Name
              <input
                name="name"
                type="text"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
            />
          </label>

          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={form.password}
              onChange={handleChange}
            />
          </label>

          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : isSignup ? 'Sign up' : 'Log in'}
          </button>
        </form>

        <button className="auth-link" type="button" onClick={switchMode}>
          {isSignup
            ? 'Already have a demo account? Log in'
            : 'Need a demo account? Sign up'}
        </button>
      </section>
    </main>
  )
}
