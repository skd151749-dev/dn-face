import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'

import { useAuth, useBranding } from '../App.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import { api } from '../utils/api.js'

export default function SelectGroup() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { branding } = useBranding()
  const [group, setGroup] = useState(() => localStorage.getItem('group') || '')
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getGroups()
      .then((res) => setGroups(res.groups || []))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false))
  }, [])

  function handleContinue() {
    if (!group) {
      alert('Please select a group first')
      return
    }
    localStorage.setItem('group', group)
    navigate(user?.role === 'admin' ? '/dashboard' : '/scan', { replace: true })
  }

  return (
    <div className="min-h-screen bg-mesh flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-xl p-8 text-center space-y-7">
        <div className="flex justify-center">
          <BrandLogo logoUrl={branding.logo_url} showText compact />
        </div>

        <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-400/10 flex items-center justify-center border border-cyan-400/20">
          <Users size={26} className="text-cyan-300" />
        </div>

        <div>
          <h1 className="font-display text-3xl font-bold text-white">Select Group</h1>
          <p className="text-slate-400 text-sm mt-2">Choose the active group before entering the secure dashboard.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 text-left">
            <div>
              <label className="block text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">Available Groups</label>
              <select className="input-field" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">-- Select Group --</option>
                {groups.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              {groups.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setGroup(item.name)}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    group === item.name
                      ? 'border-cyan-300/40 bg-cyan-400/10 text-white'
                      : 'border-white/8 bg-white/[0.03] text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{item.member_count || 0} students</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <button onClick={handleContinue} className="btn-primary w-full">
          Continue To {user?.role === 'admin' ? 'Dashboard' : 'Scan'}
        </button>
      </div>
    </div>
  )
}
