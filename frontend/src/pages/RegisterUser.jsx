import { useCallback, useEffect, useState } from 'react'
import { Camera, CheckCircle2, Eye, Loader2, RotateCcw, Save, UserPlus, Users } from 'lucide-react'

import CameraScanner from '../components/CameraScanner.jsx'
import { api } from '../utils/api.js'

const ROLES = ['student', 'employee', 'admin']
const SEXES = ['Male', 'Female', 'Other']

export default function RegisterUser() {
  const [step, setStep] = useState(1)
  const [groups, setGroups] = useState([])
  const [form, setForm] = useState({
    name: '',
    user_id: '',
    role: 'student',
    sex: 'Male',
    class_dept: '',
    group_name: localStorage.getItem('group') || '',
    schedule: 'Mon-Fri 08:00-17:00',
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [capturedCount, setCapturedCount] = useState(0)
  const [capturing, setCapturing] = useState(false)
  const [pendingCapture, setPendingCapture] = useState(null)
  const [savingSample, setSavingSample] = useState(false)
  const [sampleMessage, setSampleMessage] = useState('')
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const loadUsers = useCallback(() => {
    setLoadingUsers(true)
    api.getUserManagement()
      .then((res) => setUsers(res.users || []))
      .catch(() => {})
      .finally(() => setLoadingUsers(false))
  }, [])

  useEffect(() => {
    api.getGroups()
      .then((res) => {
        const items = res.groups || []
        setGroups(items)
        if (!form.group_name && items[0]?.name) {
          setForm((prev) => ({ ...prev, group_name: items[0].name }))
        }
      })
      .catch(() => {})
    loadUsers()
  }, [loadUsers])

  async function handleRegisterForm(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (!form.group_name) throw new Error('Please select a group')
      await api.registerUser({
        ...form,
        class_dept: form.class_dept.trim() || form.group_name,
      })
      setStep(2)
      loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCapture = useCallback((capture) => {
    if (capturedCount >= 5 || capturing) return
    setError('')
    setSampleMessage('')
    setPendingCapture(capture)
  }, [capturedCount, capturing])

  const savePendingCapture = useCallback(async () => {
    if (!pendingCapture || capturing || capturedCount >= 5) return
    setCapturing(true)
    setSavingSample(true)
    setError('')
    try {
      const res = await api.registerFace({ user_id: form.user_id, ...pendingCapture })
      setCapturedCount(res.images_captured)
      setPendingCapture(null)
      setSampleMessage(`Sample ${res.images_captured} saved successfully.`)
      if (res.images_captured >= 5) {
        setTimeout(() => setStep(3), 700)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCapturing(false)
      setSavingSample(false)
    }
  }, [capturedCount, capturing, form.user_id, pendingCapture])

  const f = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  function resetForm() {
    setStep(1)
    setForm({
      name: '',
      user_id: '',
      role: 'student',
      sex: 'Male',
      class_dept: '',
      group_name: localStorage.getItem('group') || groups[0]?.name || '',
      schedule: 'Mon-Fri 08:00-17:00',
      password: '',
    })
    setCapturedCount(0)
    setPendingCapture(null)
    setSavingSample(false)
    setSampleMessage('')
    setError('')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((value) => (
          <div key={value} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-display font-bold transition-all ${
              step >= value ? 'bg-cyan-300 text-dark-800 shadow-lg shadow-cyan-300/20' : 'bg-dark-600 text-slate-500 border border-white/10'
            }`}>
              {step > value ? 'OK' : value}
            </div>
            {value < 3 && <div className={`w-12 h-0.5 ${step > value ? 'bg-cyan-300' : 'bg-white/10'}`} />}
          </div>
        ))}
        <div className="ml-2 text-sm text-slate-400">
          {step === 1 && 'Student Information'}
          {step === 2 && 'Live Face Registration'}
          {step === 3 && 'Complete'}
        </div>
      </div>

      {step === 1 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/10 flex items-center justify-center">
              <UserPlus size={20} className="text-cyan-300" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">Register New Student</h2>
              <p className="text-slate-400 text-xs">Create a user record first, then capture secure live face samples.</p>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}

          <form onSubmit={handleRegisterForm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Full Name *">
              <input className="input-field" placeholder="John Smith" value={form.name} onChange={f('name')} required />
            </Field>
            <Field label="Student ID *">
              <input className="input-field" placeholder="STU2024001" value={form.user_id} onChange={f('user_id')} required />
            </Field>
            <Field label="Role *">
              <select className="input-field" value={form.role} onChange={f('role')}>
                {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </Field>
            <Field label="Sex *">
              <select className="input-field" value={form.sex} onChange={f('sex')}>
                {SEXES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Group *">
              <select className="input-field" value={form.group_name} onChange={f('group_name')} required>
                <option value="">-- Select Group --</option>
                {groups.map((group) => <option key={group.id} value={group.name}>{group.name}</option>)}
              </select>
            </Field>
            <Field label="Class / Department">
              <input className="input-field" placeholder="Optional custom label" value={form.class_dept} onChange={f('class_dept')} />
            </Field>
            <Field label="Schedule *">
              <input className="input-field" value={form.schedule} onChange={f('schedule')} required />
            </Field>
            <Field label="Password *">
              <input type="password" className="input-field" value={form.password} onChange={f('password')} required />
            </Field>
            <div className="col-span-2 flex justify-end pt-2">
              <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                Next: Secure Face Capture
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <Camera size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">Capture Live Face Samples</h2>
              <p className="text-slate-400 text-xs">Step-by-step live capture with lighting guidance, preview, retake, and anti-spoofing verification.</p>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}
          {sampleMessage && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-200 text-sm">
              {sampleMessage}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-8 items-center">
            <CameraScanner
              onCapture={handleCapture}
              result={capturedCount >= 5 ? { matched: true, action: 'checkin', user: { name: form.name } } : null}
              scanning={capturing}
              mode="register"
              requireLiveness
              disabled={Boolean(pendingCapture) || savingSample}
              buttonLabel={pendingCapture ? 'Preview Ready' : 'Auto Capture Sample'}
            />

            <div className="flex-1 space-y-4">
              <p className="text-sm text-slate-300">
                Registering face for
                {' '}
                <span className="text-white font-semibold">{form.name}</span>
                {' '}
                in
                {' '}
                <span className="text-cyan-300">{form.group_name}</span>
              </p>

              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-2">
                  <span>Samples captured</span>
                  <span className="font-mono">{capturedCount} / 5</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-primary transition-all duration-500"
                    style={{ width: `${(capturedCount / 5) * 100}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className={`w-12 h-12 rounded-2xl border flex items-center justify-center text-sm transition-all ${
                      index < capturedCount
                        ? 'border-green-400 bg-green-400/10 text-green-300'
                        : 'border-white/10 bg-dark-600/50 text-slate-600'
                    }`}
                  >
                    {index < capturedCount ? 'OK' : index + 1}
                  </div>
                ))}
              </div>

              <div className="text-xs text-slate-500 space-y-1">
                <p>1. Look straight at the camera and keep your face inside the frame.</p>
                <p>2. When scanning starts, blink or move your head slightly left/right.</p>
                <p>3. Review the preview, then save or retake before the sample is stored.</p>
                <p>4. Use the real person, not a phone screen or printed photo.</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-dark-700/40 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={16} className="text-cyan-300" />
                  <p className="text-sm font-semibold text-white">Preview before saving</p>
                </div>

                {pendingCapture ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-950">
                      <img
                        src={pendingCapture.preview_src}
                        alt="Captured face preview"
                        className="w-full h-56 object-cover"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={savePendingCapture}
                        disabled={savingSample}
                        className="btn-primary inline-flex items-center justify-center gap-2"
                      >
                        {savingSample ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                        {savingSample ? 'Saving Sample...' : 'Save Sample'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingCapture(null)
                          setSampleMessage('')
                        }}
                        disabled={savingSample}
                        className="btn-secondary inline-flex items-center justify-center gap-2"
                      >
                        <RotateCcw size={15} />
                        Retake
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Save this preview only if the face is centered, bright enough, and clearly visible.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-slate-400">
                    A preview will appear here automatically after a clear live face scan.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-green-500/15 border-2 border-green-400 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-green-400/20">
            <CheckCircle2 size={40} className="text-green-300" />
          </div>
          <h2 className="font-display text-2xl font-bold text-white mb-2">Registration Complete</h2>
          <p className="text-slate-400 text-sm mb-2">{form.name} is ready for secure scanning.</p>
          <p className="text-xs text-slate-500 font-mono mb-8">ID: {form.user_id}</p>
          <div className="flex gap-3 justify-center">
            <button className="btn-secondary" onClick={resetForm}>Register Another</button>
            <a href="/dashboard" className="btn-primary">Go to Dashboard</a>
          </div>
        </div>
      )}

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Users size={20} className="text-cyan-300" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Student Management</h2>
            <p className="text-slate-400 text-xs">{users.length} users in the selected group</p>
          </div>
        </div>

        {loadingUsers ? (
          <div className="flex justify-center py-8">
            <Loader2 size={24} className="text-primary animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Name', 'ID', 'Group', 'Schedule', 'Check-in', 'Check-out', 'Late Status', 'Early Leave'].map((header) => (
                    <th key={header} className="text-left py-2 px-3 text-xs uppercase tracking-widest text-slate-500 font-mono whitespace-nowrap">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((student) => (
                  <tr key={student.user_id} className="border-b border-white/5 hover:bg-white/2">
                    <td className="py-2.5 px-3 text-white">{student.name}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{student.user_id}</td>
                    <td className="py-2.5 px-3 text-cyan-300 text-xs">{student.group_name || '-'}</td>
                    <td className="py-2.5 px-3 text-slate-400 text-xs">{student.schedule || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-green-300">{student.check_in || '-'}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-yellow-300">{student.check_out || '-'}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-300">{student.late_status || 'On Time'}</td>
                    <td className="py-2.5 px-3 text-xs text-slate-300">{student.early_leave || 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">{label}</label>
      {children}
    </div>
  )
}

function ErrorBanner({ message }) {
  return (
    <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
      {message}
    </div>
  )
}
