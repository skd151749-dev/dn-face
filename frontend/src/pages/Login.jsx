import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

import { useAuth, useBranding } from '../App.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import { api, popSessionNotice } from '../utils/api.js'

export default function Login() {
  const { login } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()

  const [form, setForm] = useState({ identifier: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const message = popSessionNotice()
    if (message) setNotice(message)
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const identifier = form.identifier.trim()
      const password = form.password.trim()
      if (!identifier || !password) {
        setError('Please enter your ID and password.')
        return
      }
      const data = await api.login({ identifier, password })
      login(data.user, data.token)
      navigate('/select-group')
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 right-[-10%] w-[28rem] h-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-[-8rem] w-[24rem] h-[24rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="w-full max-w-5xl grid lg:grid-cols-[1.05fr_0.95fr] gap-8 items-center relative z-10">
        <div className="hidden lg:block">
          <div className="glass-card p-10 border border-cyan-400/10">
            <BrandLogo logoUrl={branding.logo_url} showText compact={false} />
            <div className="mt-8 space-y-4">
              <h2 className="font-display text-5xl leading-tight text-white">
                Secure attendance for
                <span className="block text-cyan-300">school competition demos</span>
              </h2>
              <p className="text-slate-400 text-base max-w-xl">
                DN FACE combines live face recognition, group management, early checkout approval,
                meal verification, and real-time alerts in one clean admin system.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-3 text-xs uppercase tracking-[0.25em] text-slate-400">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">Live Detection</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">JWT Secure</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">Group Filtered</div>
            </div>
          </div>
        </div>

        <div className="glass-card p-7 sm:p-8 lg:p-9">
          <div className="lg:hidden mb-6">
            <BrandLogo logoUrl={branding.logo_url} showText compact />
          </div>
          <h2 className="font-display text-2xl text-white mb-1">Sign In</h2>
          <p className="text-slate-400 text-sm mb-6">Enter your credentials to access the system.</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
              {error}
            </div>
          )}

          {notice && (
            <div className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">Username</label>
              <input
                type="text"
                className="input-field"
                placeholder="admin001"
                value={form.identifier}
                onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input-field pr-11"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Signing In...' : 'Access DN FACE'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-6">
            Demo admin:
            {' '}
            <span className="font-mono text-slate-300">admin001 / admin123</span>
          </p>
        </div>
      </div>
    </div>
  )
}
