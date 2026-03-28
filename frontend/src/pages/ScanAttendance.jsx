import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Clock3, Loader2, ScanFace, ShieldCheck, UtensilsCrossed } from 'lucide-react'

import { useAuth, useBranding } from '../App.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import CameraScanner from '../components/CameraScanner.jsx'
import { api } from '../utils/api.js'

export default function ScanAttendance({ initialMode = 'attendance', lockMode = false }) {
  const { user } = useAuth()
  const { branding } = useBranding()
  const isAdmin = user?.role === 'admin'

  const [mode, setMode] = useState(initialMode)
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(() => localStorage.getItem('group') || '')
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState(null)
  const [activity, setActivity] = useState([])
  const [mealCount, setMealCount] = useState(null)
  const [mealVerified, setMealVerified] = useState(null)
  const [settings, setSettings] = useState({
    morning_check_in: '06:30',
    morning_late_after: '07:30',
    morning_check_out: '11:30',
    afternoon_check_in: '13:30',
    afternoon_late_after: '14:00',
    afternoon_check_out: '17:00',
  })
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [requestReason, setRequestReason] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)

  const effectiveMode = useMemo(() => {
    if (!isAdmin) return 'attendance'
    return lockMode ? initialMode : mode
  }, [initialMode, isAdmin, lockMode, mode])

  useEffect(() => {
    if (!result) return undefined
    const timer = setTimeout(() => setResult(null), 7000)
    return () => clearTimeout(timer)
  }, [result])

  useEffect(() => {
    api.getSettings()
      .then((res) => setSettings({
        morning_check_in: res.morning_check_in || '06:30',
        morning_late_after: res.morning_late_after || res.late_time || '07:30',
        morning_check_out: res.morning_check_out || '11:30',
        afternoon_check_in: res.afternoon_check_in || '13:30',
        afternoon_late_after: res.afternoon_late_after || '14:00',
        afternoon_check_out: res.afternoon_check_out || '17:00',
      }))
      .catch(() => {})

    api.getGroups()
      .then((res) => {
        const items = res.groups || []
        setGroups(items)
        if (!selectedGroup && items[0]?.name) {
          setSelectedGroup(items[0].name)
          localStorage.setItem('group', items[0].name)
        }
      })
      .catch(() => {})
  }, [selectedGroup])

  const refreshActivity = useCallback(() => {
    if (!user) return
    const params = { limit: 8 }
    if (!isAdmin && user?.user_id) params.user_id = user.user_id
    api.recentActivity(params)
      .then((res) => setActivity(res.events || []))
      .catch(() => {})
  }, [isAdmin, user])

  useEffect(() => {
    if (!user) return undefined
    refreshActivity()
    const timer = setInterval(refreshActivity, 6000)
    return () => clearInterval(timer)
  }, [refreshActivity, user])

  async function handleCapture(capture) {
    if (scanning) return
    if (!selectedGroup) {
      setResult({ matched: false, action: 'liveness_failed', message: 'Please select a group first.' })
      return
    }

    setScanning(true)
    try {
      localStorage.setItem('group', selectedGroup)
      if (effectiveMode === 'attendance') {
        const payload = { ...capture }
        if (!isAdmin && user?.user_id) payload.user_id = user.user_id
        const res = await api.scanAttendance(payload)
        setResult(res)
        if (res?.matched) refreshActivity()
      } else {
        const res = await api.mealCount({ ...capture })
        setResult({ ...res, matched: true })
        setMealCount(res.count)
        setMealVerified(res.verified ?? null)
        refreshActivity()
      }
    } catch (err) {
      setResult({ matched: false, action: 'liveness_failed', message: err.message })
    } finally {
      setScanning(false)
    }
  }

  async function submitEarlyCheckoutRequest() {
    if (!requestReason.trim()) {
      alert('Please enter a reason first')
      return
    }
    if (!user?.user_id) return

    setRequestLoading(true)
    try {
      await api.createEarlyCheckoutRequest({
        user_id: user.user_id,
        reason: requestReason.trim(),
      })
      setRequestModalOpen(false)
      setRequestReason('')
      setResult({
        matched: true,
        action: 'request_pending',
        user: {
          name: user.name,
          class_dept: user.class_dept,
          user_id: user.user_id,
        },
        message: 'Waiting for admin approval.',
        request_status: 'Pending',
      })
    } catch (err) {
      alert(err.message || 'Unable to submit request')
    } finally {
      setRequestLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <div className="glass-card overflow-hidden">
        <div className="relative p-6 md:p-7">
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-cyan-400/10 via-violet-400/10 to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-4">
              <BrandLogo logoUrl={branding.logo_url} showText compact />
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-200">Live Webcam Scanner</p>
                <h1 className="mt-1 font-display text-2xl text-white">
                  {effectiveMode === 'attendance' ? 'Face Attendance Scan' : 'Meal Verification Scan'}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Clean, fast scanning with clear face guidance and minimal screen clutter.
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:min-w-[28rem]">
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-slate-500">Group</label>
                <select
                  className="input-field"
                  value={selectedGroup}
                  onChange={(e) => {
                    setSelectedGroup(e.target.value)
                    localStorage.setItem('group', e.target.value)
                  }}
                >
                  <option value="">Select group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.name}>{group.name}</option>
                  ))}
                </select>
              </div>

              {isAdmin && !lockMode ? (
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-slate-500">Mode</label>
                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/5 bg-slate-950/40 p-1">
                    <button
                      type="button"
                      onClick={() => { setMode('attendance'); setResult(null) }}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        effectiveMode === 'attendance'
                          ? 'bg-cyan-300/15 text-cyan-100'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Attendance
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMode('meal'); setResult(null) }}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                        effectiveMode === 'meal'
                          ? 'bg-violet-400/15 text-violet-100'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Meal
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-slate-500">Active Mode</label>
                  <div className="input-field flex items-center justify-between">
                    <span>{effectiveMode === 'attendance' ? 'Attendance' : 'Meal'}</span>
                    {effectiveMode === 'attendance' ? <ScanFace size={16} className="text-cyan-200" /> : <UtensilsCrossed size={16} className="text-violet-200" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
        <div className="glass-card p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Camera Area</p>
              <h2 className="mt-1 font-display text-xl text-white">Align your face inside the frame</h2>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Today&apos;s Schedule</p>
              <p className="mt-1 text-sm font-semibold text-white">AM In {settings.morning_check_in} · AM Out {settings.morning_check_out}</p>
              <p className="mt-1 text-xs text-slate-400">AM Late {settings.morning_late_after} · PM In {settings.afternoon_check_in}</p>
              <p className="mt-1 text-xs text-slate-400">PM Late {settings.afternoon_late_after} · PM Out {settings.afternoon_check_out}</p>
            </div>
          </div>

          <CameraScanner
            onCapture={handleCapture}
            result={result}
            scanning={scanning}
            mode={effectiveMode}
            requireLiveness={effectiveMode === 'attendance'}
            disabled={!selectedGroup}
            showOverlayStatus={false}
            buttonLabel={effectiveMode === 'attendance' ? 'Start Secure Scan' : 'Scan Meal Status'}
          />

          {!selectedGroup && (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Please select a group first before scanning.
            </div>
          )}

          {!isAdmin && result?.action === 'request_required' && (
            <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-400/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Early checkout needs approval</p>
                  <p className="mt-1 text-xs text-slate-300">{result.message}</p>
                </div>
                <button
                  onClick={() => setRequestModalOpen(true)}
                  className="btn-primary whitespace-nowrap"
                >
                  Request Approval
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-white">
              <ShieldCheck size={17} className="text-cyan-200" />
              <h3 className="font-display text-lg">Scan Guidance</h3>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <InfoRow label="Selected group" value={selectedGroup || 'Choose a group'} />
              <InfoRow label="Current mode" value={effectiveMode === 'attendance' ? 'Attendance Scan' : 'Meal Verification'} />
              <InfoRow label="Morning check-in" value={settings.morning_check_in} />
              <InfoRow label="Morning late after" value={settings.morning_late_after} />
              <InfoRow label="Morning check-out" value={settings.morning_check_out} />
              <InfoRow label="Afternoon check-in" value={settings.afternoon_check_in} />
              <InfoRow label="Afternoon late after" value={settings.afternoon_late_after} />
              <InfoRow label="Afternoon check-out" value={settings.afternoon_check_out} />
            </div>
            <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-sm text-slate-400">
              Keep the face centered, use a real person, and follow the schedule above when scanning in and out.
            </div>
            {effectiveMode === 'meal' && mealCount !== null && (
              <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-100">Meal Monitoring</p>
                <p className="mt-2 font-display text-4xl text-white">{mealCount}</p>
                <p className="mt-1 text-xs text-slate-300">Verified today{mealVerified !== null ? ` · this scan ${mealVerified}` : ''}</p>
              </div>
            )}
          </div>

          <div className="glass-card p-5">
            <div className="flex items-center gap-2 text-white">
              <Clock3 size={17} className="text-slate-300" />
              <h3 className="font-display text-lg">Recent Activity</h3>
            </div>
            {activity.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">No activity yet</div>
            ) : (
              <div className="mt-4 space-y-3">
                {activity.map((item, index) => (
                  <div key={`${item.type}-${item.scan_time || item.check_in || item.check_out || index}`} className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.user_id} · {item.action || item.type || 'Activity'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-mono text-cyan-200">{item.scan_time || item.check_in || item.check_out || '-'}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.status}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {requestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-400/10 text-violet-200">
                <AlertCircle size={20} />
              </div>
              <div>
                <h3 className="font-display text-xl text-white">Early Checkout Request</h3>
                <p className="text-sm text-slate-400">Enter a clear reason before {settings.afternoon_check_out}.</p>
              </div>
            </div>

            <textarea
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
              rows={4}
              className="input-field mt-5 resize-none"
              placeholder="Example: medical appointment, family emergency..."
            />

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRequestModalOpen(false)
                  setRequestReason('')
                }}
                className="rounded-xl border border-white/10 px-4 py-2 text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                Cancel
              </button>
              <button onClick={submitEarlyCheckoutRequest} disabled={requestLoading} className="btn-primary">
                {requestLoading ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Submitting...</span> : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.03] px-3 py-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right font-semibold text-white">{value}</span>
    </div>
  )
}


