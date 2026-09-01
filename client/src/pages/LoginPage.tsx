import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Wordmark } from '../components/Layout'
import { Button, Field, Input } from '../components/ui'

const DEMO = [
  { role: 'Admin', name: 'Priya Raman', email: 'admin@shelfmark.dev', password: 'Admin@123' },
  { role: 'Librarian', name: 'Arjun Menon', email: 'librarian@shelfmark.dev', password: 'Librarian@123' },
]

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ ok: boolean; demo: boolean }>('/health') })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
        <Wordmark />

        <div className="w-full max-w-sm py-12">
          <h1 className="font-display text-4xl leading-[1.05] font-medium tracking-[-0.02em]">Circulation desk</h1>
          <p className="mt-3 text-ink-2">Sign in with your staff account to issue and return books.</p>

          <form onSubmit={submit} className="mt-9 space-y-5" noValidate>
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </Field>
            <Field label="Password" htmlFor="password">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && (
              <p className="rounded-md bg-tag-red-bg px-3 py-2 text-sm text-tag-red-ink" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" busy={busy} className="w-full" disabled={!email || !password}>
              Sign in
            </Button>
          </form>

          {health.data?.demo && (
            <div className="mt-10 border-t border-line pt-6">
              <p className="text-[13px] text-ink-2">This is a demo library. Pick an account to fill in the form:</p>
              <div className="mt-3 grid gap-2">
                {DEMO.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => {
                      setEmail(account.email)
                      setPassword(account.password)
                    }}
                    className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface"
                  >
                    <span>
                      <span className="block text-sm font-medium">{account.name}</span>
                      <span className="font-mono text-xs text-ink-3">{account.email}</span>
                    </span>
                    <span className="text-xs text-ink-2">{account.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-3">Staff access only. Sessions end after 8 hours.</p>
      </div>

      {/* a catalogue card, the thing this whole app replaces */}
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-line bg-surface-2 lg:flex">
        <div className="relative w-[440px] rotate-[-2deg] rounded-sm border border-line-strong bg-surface px-8 pt-6 pb-12 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.25)]">
          <div className="flex items-baseline justify-between border-b-2 border-stamp/70 pb-2">
            <span className="font-mono text-xs text-ink-2">025.6 SHE</span>
            <span className="font-mono text-xs text-ink-3">No. 000142</span>
          </div>
          <div className="ruled mt-1 font-display text-[17px] leading-8 text-ink">
            <p>Shelfmark</p>
            <p className="pl-6 text-ink-2 italic">Circulation desk for the college library.</p>
            <p className="pl-6 text-ink-2">Scan a label, pick a borrower,</p>
            <p className="pl-6 text-ink-2">stamp the due date. That's it.</p>
            <p>&nbsp;</p>
            <p className="font-mono text-[13px] text-ink-3">1. Circulation 2. QR codes</p>
          </div>
          <div className="stamp absolute right-8 bottom-7 px-3 py-1 font-mono text-sm font-bold tracking-widest text-stamp">STAFF ONLY</div>
          <span className="absolute bottom-3 left-1/2 h-4 w-4 -translate-x-1/2 rounded-full border border-line-strong bg-surface-2" aria-hidden />
        </div>
      </div>
    </div>
  )
}
