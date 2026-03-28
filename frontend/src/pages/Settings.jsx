import { useEffect, useState } from 'react'
import {
  BellRing,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Save,
  Settings as SettingsIcon,
  Shapes,
  Trash2,
  Users,
  X,
} from 'lucide-react'

import { useBranding } from '../App.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import { api } from '../utils/api.js'

export default function Settings() {
  const { branding, refreshBranding } = useBranding()
  const [settings, setSettings] = useState({
    morning_check_in: '06:30',
    morning_late_after: '07:30',
    morning_check_out: '11:30',
    afternoon_check_in: '13:30',
    afternoon_late_after: '14:00',
    afternoon_check_out: '17:00',
    logo_url: '',
  })
  const [users, setUsers] = useState([])
  const [requests, setRequests] = useState([])
  const [groups, setGroups] = useState([])
  const [newGroup, setNewGroup] = useState('')
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [reviewingId, setReviewingId] = useState(null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [deletingUserId, setDeletingUserId] = useState(null)

  async function loadPage() {
    setLoading(true)
    try {
      const [settingsRes, usersRes, requestsRes, groupsRes] = await Promise.all([
        api.getSettings(),
        api.getUserManagement({ group: '' }),
        api.getEarlyCheckoutRequests({ status: 'Pending' }),
        api.getGroups(),
      ])
      if (settingsRes && Object.keys(settingsRes).length) {
        setSettings({
          morning_check_in: settingsRes.morning_check_in || '06:30',
          morning_late_after: settingsRes.morning_late_after || settingsRes.late_time || '07:30',
          morning_check_out: settingsRes.morning_check_out || '11:30',
          afternoon_check_in: settingsRes.afternoon_check_in || '13:30',
          afternoon_late_after: settingsRes.afternoon_late_after || '14:00',
          afternoon_check_out: settingsRes.afternoon_check_out || '17:00',
          logo_url: settingsRes.logo_url || '',
        })
      }
      setUsers(usersRes.users || [])
      setRequests(requestsRes.requests || [])
      setGroups(groupsRes.groups || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPage()
  }, [])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    try {
      await api.saveSettings({
        morning_check_in: settings.morning_check_in,
        morning_late_after: settings.morning_late_after,
        morning_check_out: settings.morning_check_out,
        afternoon_check_in: settings.afternoon_check_in,
        afternoon_late_after: settings.afternoon_late_after,
        afternoon_check_out: settings.afternoon_check_out,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.message || 'Unable to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function reviewRequest(requestId, status) {
    setReviewingId(requestId)
    try {
      await api.reviewEarlyCheckoutRequest(requestId, status)
      await loadPage()
    } catch (err) {
      alert(err.message || 'Unable to update request')
    } finally {
      setReviewingId(null)
    }
  }

  async function createGroup() {
    if (!newGroup.trim()) return
    try {
      await api.createGroup({ name: newGroup.trim() })
      setNewGroup('')
      await loadPage()
    } catch (err) {
      alert(err.message || 'Unable to create group')
    }
  }

  async function saveGroupEdit(groupId) {
    if (!editingGroupName.trim()) return
    const currentSelected = localStorage.getItem('group')
    const group = groups.find((item) => item.id === groupId)
    try {
      await api.updateGroup(groupId, { name: editingGroupName.trim() })
      if (currentSelected && group?.name === currentSelected) {
        localStorage.setItem('group', editingGroupName.trim())
      }
      setEditingGroupId(null)
      setEditingGroupName('')
      await loadPage()
    } catch (err) {
      alert(err.message || 'Unable to rename group')
    }
  }

  async function removeGroup(groupId, groupName) {
    if (!window.confirm(`Delete group "${groupName}"?`)) return
    try {
      await api.deleteGroup(groupId)
      if (localStorage.getItem('group') === groupName) {
        localStorage.removeItem('group')
      }
      await loadPage()
    } catch (err) {
      alert(err.message || 'Unable to delete group')
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true)
    try {
      const res = await api.uploadLogo(file)
      setSettings((prev) => ({ ...prev, logo_url: res.logo_url || '' }))
      await refreshBranding()
    } catch (err) {
      alert(err.message || 'Unable to upload logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  async function removeUser(userId, name) {
    if (!window.confirm(`Remove ${name} from the system? This will also delete face data and attendance history.`)) return
    setDeletingUserId(userId)
    try {
      await api.deleteUser(userId)
      await loadPage()
    } catch (err) {
      alert(err.message || 'Unable to remove user')
    } finally {
      setDeletingUserId(null)
    }
  }

  const f = (key) => (e) => setSettings((prev) => ({ ...prev, [key]: e.target.value }))

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="glass-card p-6 xl:col-span-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center">
              <SettingsIcon size={20} className="text-orange-300" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">Time Control Settings</h2>
              <p className="text-slate-400 text-xs">Configure the six schedule points used for on-time, late, and checkout enforcement.</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={24} className="text-primary animate-spin" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-cyan-300/10 bg-cyan-300/[0.04] p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-200">Morning Session</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <TimeField
                      label="Morning Check-in"
                      value={settings.morning_check_in}
                      onChange={f('morning_check_in')}
                      hint="Students can start morning attendance from this time."
                    />
                    <TimeField
                      label="Morning Late After"
                      value={settings.morning_late_after}
                      onChange={f('morning_late_after')}
                      hint="Any morning check-in from this time onward is marked Late."
                    />
                    <TimeField
                      label="Morning Check-out"
                      value={settings.morning_check_out}
                      onChange={f('morning_check_out')}
                      hint="Morning checkout becomes available from this time."
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-violet-300/10 bg-violet-300/[0.04] p-5">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-violet-200">Afternoon Session</p>
                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <TimeField
                      label="Afternoon Check-in"
                      value={settings.afternoon_check_in}
                      onChange={f('afternoon_check_in')}
                      hint="Afternoon attendance opens from this time."
                    />
                    <TimeField
                      label="Afternoon Late After"
                      value={settings.afternoon_late_after}
                      onChange={f('afternoon_late_after')}
                      hint="Any afternoon check-in from this time onward is marked Late."
                    />
                    <TimeField
                      label="Afternoon Check-out"
                      value={settings.afternoon_check_out}
                      onChange={f('afternoon_check_out')}
                      hint="Normal afternoon checkout becomes available from this time."
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-4">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">How the system will enforce the schedule</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <RuleCard title="Morning In" value={settings.morning_check_in} tone="cyan" />
                  <RuleCard title="Morning Late" value={settings.morning_late_after} tone="blue" />
                  <RuleCard title="Morning Out" value={settings.morning_check_out} tone="blue" />
                  <RuleCard title="Afternoon In" value={settings.afternoon_check_in} tone="yellow" />
                  <RuleCard title="Afternoon Late" value={settings.afternoon_late_after} tone="purple" />
                  <RuleCard title="Afternoon Out" value={settings.afternoon_check_out} tone="purple" />
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Keep the time order as Morning Check-in, then Morning Late After, then Morning Check-out, then Afternoon Check-in, then Afternoon Late After, then Afternoon Check-out.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
                  {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
                </button>
                {saved && <span className="text-sm text-green-300">Settings updated successfully.</span>}
              </div>
            </form>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/15 flex items-center justify-center">
              <ImagePlus size={20} className="text-cyan-300" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">Branding</h2>
              <p className="text-slate-400 text-xs">Upload a custom logo for login, sidebar, and dashboard.</p>
            </div>
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.03] p-5">
            <BrandLogo logoUrl={branding.logo_url || settings.logo_url} showText compact={false} />
          </div>

          <label className="mt-4 inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 cursor-pointer hover:bg-cyan-300/15 transition-colors">
            {uploadingLogo ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
            {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
            <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp" className="hidden" onChange={handleLogoUpload} />
          </label>
          <p className="text-xs text-slate-500 mt-3">Recommended: square PNG or SVG logo for best display quality.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="glass-card p-6 xl:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <Shapes size={20} className="text-violet-300" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">Dynamic Group Management</h2>
              <p className="text-slate-400 text-xs">Create, rename, or remove groups without touching code.</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <input
              className="input-field"
              placeholder="New group name"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
            <button type="button" onClick={createGroup} className="btn-primary whitespace-nowrap">Add Group</button>
          </div>

          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                {editingGroupId === group.id ? (
                  <input
                    className="input-field"
                    value={editingGroupName}
                    onChange={(e) => setEditingGroupName(e.target.value)}
                  />
                ) : (
                  <div>
                    <p className="font-semibold text-white">{group.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{group.member_count || 0} students assigned</p>
                  </div>
                )}

                <div className="flex gap-2">
                  {editingGroupId === group.id ? (
                    <>
                      <button onClick={() => saveGroupEdit(group.id)} className="px-4 py-2 rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 text-sm">
                        Save
                      </button>
                      <button onClick={() => { setEditingGroupId(null); setEditingGroupName('') }} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm">
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditingGroupId(group.id)
                          setEditingGroupName(group.name)
                        }}
                        className="px-4 py-2 rounded-xl bg-cyan-400/10 border border-cyan-400/20 text-cyan-300 text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removeGroup(group.id, group.name)}
                        className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
              <BellRing size={20} className="text-primary" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white">Early Checkout Requests</h2>
              <p className="text-slate-400 text-xs">{requests.length} pending in the selected group</p>
            </div>
          </div>

          <div className="space-y-3 max-h-[28rem] overflow-y-auto pr-1">
            {requests.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">No pending requests right now.</p>
            ) : requests.map((request) => (
              <div key={request.id} className="rounded-2xl border border-white/5 bg-dark-600/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{request.name}</p>
                    <p className="text-xs text-slate-500">{request.user_id} - {request.class_dept || '-'}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-primary">{request.status}</span>
                </div>
                <p className="text-xs text-slate-300 mt-3">{request.reason}</p>
                <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
                  <span>Check-in: {request.check_in_time || '-'}</span>
                  <span>Request: {request.request_time || '-'}</span>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => reviewRequest(request.id, 'Approved')}
                    disabled={reviewingId === request.id}
                    className="flex-1 rounded-xl bg-green-500/15 border border-green-500/20 text-green-300 py-2 text-sm font-semibold hover:bg-green-500/20 transition-all"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Check size={14} />
                      Approve
                    </span>
                  </button>
                  <button
                    onClick={() => reviewRequest(request.id, 'Rejected')}
                    disabled={reviewingId === request.id}
                    className="flex-1 rounded-xl bg-red-500/15 border border-red-500/20 text-red-300 py-2 text-sm font-semibold hover:bg-red-500/20 transition-all"
                  >
                    <span className="inline-flex items-center gap-2">
                      <X size={14} />
                      Reject
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center">
            <Users size={20} className="text-cyan-300" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-white">Students Across All Classes</h2>
            <p className="text-slate-400 text-xs">{users.length} users available for admin management across every group</p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-red-400/15 bg-red-400/5 px-4 py-3 text-xs text-slate-300">
          Admin can now remove students from any class here. Deleting a student also removes linked face scans, attendance, meal logs, and requests.
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Name', 'ID', 'Role', 'Group', 'Class/Dept', 'Check-in', 'Check-out', 'Late Count', 'Actions'].map((header) => (
                  <th key={header} className="text-left py-2 px-3 text-xs uppercase tracking-widest text-slate-500 font-mono whitespace-nowrap">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id} className="border-b border-white/5 hover:bg-white/2">
                  <td className="py-2.5 px-3 text-white">{item.name}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-slate-400">{item.user_id}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-300">{item.role}</td>
                  <td className="py-2.5 px-3 text-xs text-cyan-300">{item.group_name || '-'}</td>
                  <td className="py-2.5 px-3 text-slate-400 text-xs">{item.class_dept}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-green-300">{item.check_in || '-'}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-yellow-300">{item.check_out || '-'}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-400">{item.late_count || 0}</td>
                  <td className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => removeUser(item.user_id, item.name)}
                      disabled={deletingUserId === item.user_id}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingUserId === item.user_id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      {deletingUserId === item.user_id ? 'Removing...' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TimeField({ label, value, onChange, hint }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest text-slate-500 mb-2">{label}</label>
      <input type="time" className="input-field" value={value} onChange={onChange} />
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

function RuleCard({ title, value, tone }) {
  const tones = {
    cyan: 'bg-cyan-400/10 border-cyan-400/15 text-cyan-300',
    blue: 'bg-blue-400/10 border-blue-400/15 text-blue-300',
    yellow: 'bg-yellow-500/10 border-yellow-500/15 text-yellow-300',
    purple: 'bg-purple-500/10 border-purple-500/15 text-purple-300',
  }

  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] || 'border-white/5 bg-dark-600/20 text-white'}`}>
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{title}</p>
      <p className="text-2xl font-display mt-2">{value}</p>
    </div>
  )
}
