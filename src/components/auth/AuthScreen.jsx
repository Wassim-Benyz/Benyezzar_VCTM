import { useState } from 'react'
import { loginUser, registerUser } from '../../services/authApi'

export function AuthScreen({ initialError = '', onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState(initialError)
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

    try {
      const result = isSignup
        ? await registerUser(form)
        : await loginUser(form)

      onAuthenticated(result.user)
    } catch (requestError) {
      setError(requestError.message || 'Authentication failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup')
    setError('')
  }

  return (
    <main className="auth-shell">
      <section className="glass-card auth-card" aria-label="Authentication">
        <div>
          <div className="card-kicker">{isSignup ? 'Create account' : 'Sign in'}</div>
          <h1>{isSignup ? 'Create account' : 'Sign in'}</h1>
          <p>Use your email and password to access your tasks.</p>
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
            ? 'Already have an account? Sign in'
            : 'Need an account? Create one'}
        </button>
      </section>
    </main>
  )
}
