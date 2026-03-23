'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        router.push('/fixturely-app.html')
        router.refresh()
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (error) {
        setError(error.message)
      } else {
        setMessage('Account created! Check your email to confirm, then log in.')
        setMode('login')
      }
    }

    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(155deg, #E8724A 0%, #F09070 40%, #FDE68A 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Nunito', sans-serif",
      padding: '20px',
    }}>
      <div style={{
        background: '#FFFFFF',
        borderRadius: '28px',
        padding: '40px 32px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎾</div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#1C1407', letterSpacing: '-0.5px' }}>
            Fixturely
          </div>
          <div style={{ fontSize: '14px', color: '#7A6840', fontWeight: '600', marginTop: '4px' }}>
            {mode === 'login' ? 'Welcome back, Coach' : 'Create your coach account'}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#7A6840', marginBottom: '7px' }}>
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="e.g. Alex Johnson"
                required
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  background: '#FAF8F5',
                  border: '1.5px solid #EEE8DC',
                  borderRadius: '14px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#1C1407',
                  fontFamily: "'Nunito', sans-serif",
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#7A6840', marginBottom: '7px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={{
                width: '100%',
                padding: '12px 15px',
                background: '#FAF8F5',
                border: '1.5px solid #EEE8DC',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: '600',
                color: '#1C1407',
                fontFamily: "'Nunito', sans-serif",
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#7A6840', marginBottom: '7px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={{
                width: '100%',
                padding: '12px 15px',
                background: '#FAF8F5',
                border: '1.5px solid #EEE8DC',
                borderRadius: '14px',
                fontSize: '15px',
                fontWeight: '600',
                color: '#1C1407',
                fontFamily: "'Nunito', sans-serif",
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#FDECEA',
              border: '1px solid #F0B8B4',
              borderRadius: '12px',
              padding: '11px 14px',
              marginBottom: '16px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#B85450',
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: '#E6F5EE',
              border: '1px solid #A8D8BC',
              borderRadius: '12px',
              padding: '11px 14px',
              marginBottom: '16px',
              fontSize: '13px',
              fontWeight: '700',
              color: '#3D8B5E',
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              background: loading ? '#F09070' : 'linear-gradient(135deg, #E8724A, #C05530)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '16px',
              fontSize: '16px',
              fontWeight: '900',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: "'Nunito', sans-serif",
              boxShadow: '0 4px 14px rgba(192,85,48,0.3)',
              transition: 'transform 0.15s',
            }}
          >
            {loading ? '…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '13px',
              fontWeight: '700',
              color: '#7A6840',
              cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif",
            }}
          >
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        </div>
      </div>
    </div>
  )
}
