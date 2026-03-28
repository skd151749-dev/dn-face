import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Clock, Loader2, TrendingUp, UserCheck, Users, UserX } from 'lucide-react'

import { useAuth, useBranding } from '../App.jsx'
import StatsCard from '../components/StatsCard.jsx'
import BrandLogo from '../components/BrandLogo.jsx'
import { api } from '../utils/api.js'

export default function Dashboard() {
  const { user } = useAuth()
  const { branding } = useBranding()
  const navigate = useNavigate()
  const [group, setGroup] = useState(() => localStorage.getItem('group') || '')
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.dashboardStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))

    const timer = setInterval(() => {
      api.dashboardStats().then(setStats).catch(() => {})
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="text-primary animate-spin" />
      </div>
    )
  }

  const attendanceRate = stats?.total_users > 0
    ? Math.round(((stats.present_today || 0) / stats.total_users) * 100)
    : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-card p-6 md:p-7 bg-[radial-gradient(circle_at_top_left,rgba(76,198,240,0.12),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(233,69,96,0.12),transparent_28%)]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-4">
            <BrandLogo logoUrl={branding.logo_url} showText compact />
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-300">Dashboard Header</p>
              <h1 className="font-display text-3xl text-white">DN FACE Control Center</h1>
              <p className="text-slate-400 text-sm mt-1">Competition-ready overview for attendance, checkout, and meal updates.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Current Group</p>
              <p className="text-white font-semibold mt-1">{group || 'Not selected'}</p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('group')
                setGroup('')
                navigate('/select-group')
              }}
              className="btn-secondary"
            >
              Change Group
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard title="Total Students" value={stats?.total_users ?? 0} icon={Users} color="cyan" />
        <StatsCard title="On Time Today" value={stats?.on_time_today ?? 0} icon={UserCheck} color="green" subtitle={`${attendanceRate}% attendance rate`} />
        <StatsCard title="Late Today" value={stats?.late_today ?? 0} icon={Clock} color="orange" />
        <StatsCard title="Absent Today" value={stats?.absent_today ?? 0} icon={UserX} color="primary" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="glass-card p-5 xl:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp size={18} className="text-cyan-300" />
            <h3 className="font-display font-semibold text-white tracking-wide">Weekly Attendance</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats?.weekly_attendance || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="attendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4CC6F0" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4CC6F0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#7C8898', fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fill: '#7C8898', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0D1422', border: '1px solid rgba(76,198,240,0.18)', borderRadius: 12 }}
                labelStyle={{ color: '#9AA8BA' }}
                itemStyle={{ color: '#4CC6F0' }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Students Present"
                stroke="#4CC6F0"
                strokeWidth={2}
                fill="url(#attendGrad)"
                dot={{ fill: '#4CC6F0', strokeWidth: 0, r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="font-display font-semibold text-white mb-5 tracking-wide">Today&apos;s Breakdown</h3>
          <div className="space-y-4">
            <BreakdownBar label="On Time" value={stats?.on_time_today ?? 0} total={stats?.total_users ?? 1} color="bg-green-500" />
            <BreakdownBar label="Late" value={stats?.late_today ?? 0} total={stats?.total_users ?? 1} color="bg-yellow-500" />
            <BreakdownBar label="Absent" value={stats?.absent_today ?? 0} total={stats?.total_users ?? 1} color="bg-red-500" />
            <BreakdownBar label="Meals" value={stats?.meal_count ?? 0} total={stats?.total_users ?? 1} color="bg-cyan-500" />
          </div>

          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <p className="text-4xl font-display font-bold gradient-text">{attendanceRate}%</p>
            <p className="text-xs text-slate-500 mt-1">Overall attendance rate</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-5">
        <h3 className="font-display font-semibold text-white mb-4 tracking-wide">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Register Student', href: '/register', color: 'from-cyan-500/15 to-blue-900/10 border-cyan-500/20 text-cyan-300', adminOnly: true },
            { label: 'Secure Scan', href: '/scan', color: 'from-primary/20 to-red-900/10 border-primary/20 text-primary' },
            { label: 'Meal Monitoring', href: '/meal', color: 'from-orange-500/15 to-yellow-900/10 border-orange-500/20 text-orange-300', adminOnly: true },
            { label: 'Reports', href: '/reports', color: 'from-green-500/15 to-emerald-900/10 border-green-500/20 text-green-300', adminOnly: true },
            { label: 'Settings', href: '/settings', color: 'from-slate-500/15 to-slate-900/10 border-white/10 text-slate-200', adminOnly: true },
          ]
            .filter((action) => !action.adminOnly || user?.role === 'admin')
            .map((action) => (
              <a
                key={action.href}
                href={action.href}
                className={`p-4 rounded-2xl bg-gradient-to-br border text-center text-sm font-display font-semibold tracking-wide transition-all hover:scale-[1.02] ${action.color}`}
              >
                {action.label}
              </a>
            ))}
        </div>
      </div>
    </div>
  )
}

function BreakdownBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-white">
          {value}
          {' '}
          <span className="text-slate-600">/ {total}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
